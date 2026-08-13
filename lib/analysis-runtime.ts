import type { AnalysisCacheStore, AnalysisReplayStore } from "@/lib/analysis-cache";
import {
  applyGeminiRateLimit,
  markAnalysisRequestFailed,
  markAnalysisRequestStarted,
  markAnalysisRequestSucceeded,
  prepareAnalysisBudget,
  type AnalysisBudgetStore
} from "@/lib/analysis-budget";
import { normalizeGeminiError } from "@/lib/gemini-error";

export type AnalysisRunMode = "live" | "replay";
export type AnalysisExecutionProvenance = "cache" | "replay" | "live";

export type AnalysisExecutionItem = {
  source_id: string;
  cache_key: string;
};

export type AnalysisExecutionResult<T> = {
  values: Record<string, T>;
  provenance: Record<string, AnalysisExecutionProvenance>;
  requested_count: number;
  cache_hit_count: number;
  cache_miss_count: number;
  cache_bypass_count: number;
  replay_hit_count: number;
  live_source_count: number;
  live_request_count: number;
};

export class AnalysisReplayMissError extends Error {
  constructor(public readonly missing_source_ids: string[]) {
    super(`Replay fixture가 없습니다: ${missing_source_ids.join(", ")}`);
    this.name = "AnalysisReplayMissError";
  }
}

function validateItems(items: AnalysisExecutionItem[]) {
  if (items.length === 0) throw new Error("analysis runtime 입력이 없습니다.");
  const sourceIds = items.map((item) => item.source_id);
  const cacheKeys = items.map((item) => item.cache_key);
  if (sourceIds.some((id) => !id.trim())) throw new Error("analysis runtime source_id가 비어 있습니다.");
  if (cacheKeys.some((key) => !key.trim())) throw new Error("analysis runtime cache_key가 비어 있습니다.");
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("analysis runtime source_id가 중복되었습니다.");
  if (new Set(cacheKeys).size !== cacheKeys.length) throw new Error("analysis runtime cache_key가 중복되었습니다.");
}

function validateLiveValues<T>(sourceIds: string[], values: Record<string, T>) {
  const expected = new Set(sourceIds);
  const returned = Object.keys(values);
  if (returned.length !== sourceIds.length) {
    throw new Error(`analysis runtime live 결과 개수 불일치: input=${sourceIds.length}, output=${returned.length}`);
  }
  for (const id of returned) {
    if (!expected.has(id)) throw new Error(`analysis runtime live 결과에 알 수 없는 source_id가 있습니다: ${id}`);
  }
  for (const id of sourceIds) {
    if (!(id in values)) throw new Error(`analysis runtime live 결과에 source_id가 누락되었습니다: ${id}`);
  }
}

export async function executeAnalysis<T>(options: {
  model: string;
  items: AnalysisExecutionItem[];
  cache: AnalysisCacheStore;
  budget: AnalysisBudgetStore;
  mode?: AnalysisRunMode;
  replay?: AnalysisReplayStore;
  force_refresh?: boolean;
  live: (sourceIds: string[]) => Promise<Record<string, T>>;
  now?: Date;
}): Promise<AnalysisExecutionResult<T>> {
  validateItems(options.items);

  const mode = options.mode ?? "live";
  const now = options.now ?? new Date();
  const values: Record<string, T> = {};
  const provenance: Record<string, AnalysisExecutionProvenance> = {};
  const unresolved: AnalysisExecutionItem[] = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let cacheBypassCount = 0;

  for (const item of options.items) {
    if (options.force_refresh) {
      cacheBypassCount += 1;
      unresolved.push(item);
      continue;
    }

    const cached = await options.cache.get<T>(item.cache_key);
    if (cached) {
      cacheHitCount += 1;
      values[item.source_id] = cached.value;
      provenance[item.source_id] = "cache";
    } else {
      cacheMissCount += 1;
      unresolved.push(item);
    }
  }

  const baseMetrics = {
    requested_count: options.items.length,
    cache_hit_count: cacheHitCount,
    cache_miss_count: cacheMissCount,
    cache_bypass_count: cacheBypassCount
  };

  if (unresolved.length === 0) {
    return {
      values,
      provenance,
      ...baseMetrics,
      replay_hit_count: 0,
      live_source_count: 0,
      live_request_count: 0
    };
  }

  if (mode === "replay") {
    if (!options.replay) throw new AnalysisReplayMissError(unresolved.map((item) => item.source_id));

    const replayValues = new Map<string, T>();
    const missing: string[] = [];
    for (const item of unresolved) {
      const replayed = await options.replay.get<T>(item.cache_key);
      if (replayed === null) missing.push(item.source_id);
      else replayValues.set(item.source_id, replayed);
    }
    if (missing.length > 0) throw new AnalysisReplayMissError(missing);

    for (const item of unresolved) {
      const replayed = replayValues.get(item.source_id) as T;
      values[item.source_id] = replayed;
      provenance[item.source_id] = "replay";
      await options.cache.set(item.cache_key, replayed, now.toISOString());
    }

    return {
      values,
      provenance,
      ...baseMetrics,
      replay_hit_count: unresolved.length,
      live_source_count: 0,
      live_request_count: 0
    };
  }

  const sourceIds = unresolved.map((item) => item.source_id);
  const budgetBefore = await options.budget.get(options.model, now);
  const preparedBudget = prepareAnalysisBudget(budgetBefore, options.model, now);
  const runningBudget = markAnalysisRequestStarted(preparedBudget, sourceIds);
  await options.budget.set(options.model, runningBudget);

  try {
    const liveValues = await options.live(sourceIds);
    validateLiveValues(sourceIds, liveValues);

    for (const item of unresolved) {
      const value = liveValues[item.source_id];
      values[item.source_id] = value;
      provenance[item.source_id] = "live";
      await options.cache.set(item.cache_key, value, now.toISOString());
    }

    await options.budget.set(
      options.model,
      markAnalysisRequestSucceeded(runningBudget, sourceIds)
    );

    return {
      values,
      provenance,
      ...baseMetrics,
      replay_hit_count: 0,
      live_source_count: sourceIds.length,
      live_request_count: 1
    };
  } catch (error) {
    const normalized = normalizeGeminiError(error);
    if (normalized.is_rate_limit && normalized.diagnostic) {
      await options.budget.set(
        options.model,
        applyGeminiRateLimit(runningBudget, normalized.diagnostic, sourceIds, now)
      );
    } else {
      await options.budget.set(
        options.model,
        markAnalysisRequestFailed(runningBudget, sourceIds)
      );
    }
    throw error;
  }
}
