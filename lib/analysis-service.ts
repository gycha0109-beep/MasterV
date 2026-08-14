import path from "node:path";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import {
  FileAnalysisCacheStore,
  FileAnalysisReplayStore,
  InMemoryAnalysisCacheStore,
  type AnalysisCacheStore,
  type AnalysisReplayStore,
  type InvalidatableAnalysisCacheStore
} from "@/lib/analysis-cache";
import {
  FileAnalysisBudgetStore,
  InMemoryAnalysisBudgetStore,
  type AnalysisBudgetStore
} from "@/lib/analysis-budget";
import {
  analyzeYouTubeCoarseBundle,
  COARSE_PROMPT_VERSION,
  COARSE_SCHEMA_VERSION,
  type CoarseInputVideo
} from "@/lib/coarse-analysis";
import { analyzeYouTubeVideo } from "@/lib/gemini";
import { executeAnalysis, type AnalysisRunMode } from "@/lib/analysis-runtime";
import { DEEP_MEDIA_RESOLUTION, DEEP_PROMPT_VERSION, DEEP_SCHEMA_VERSION } from "@/lib/analysis-versions";
import { canonicalizeYouTubeSource } from "@/lib/source-identity";
import {
  buildAnalysisCacheKey,
  type CoarseVideoAnalysis
} from "@/lib/tiered-analysis";

const runtimeStateDir = process.env.ANALYSIS_RUNTIME_STATE_DIR?.trim();
const sharedCache: AnalysisCacheStore = runtimeStateDir
  ? new FileAnalysisCacheStore(path.join(runtimeStateDir, "analysis-cache.json"))
  : new InMemoryAnalysisCacheStore();
const sharedBudget: AnalysisBudgetStore = runtimeStateDir
  ? new FileAnalysisBudgetStore(path.join(runtimeStateDir, "analysis-budget.json"))
  : new InMemoryAnalysisBudgetStore();
const replayFile = process.env.ANALYSIS_REPLAY_FILE?.trim();
const sharedReplay: AnalysisReplayStore | undefined = replayFile
  ? new FileAnalysisReplayStore(replayFile)
  : undefined;

export type RuntimeDependencies = {
  cache?: AnalysisCacheStore;
  budget?: AnalysisBudgetStore;
  replay?: AnalysisReplayStore;
  mode?: AnalysisRunMode;
  force_refresh?: boolean;
  now?: Date;
};

function configuredRunMode(): AnalysisRunMode {
  return process.env.ANALYSIS_RUN_MODE?.trim().toLowerCase() === "replay" ? "replay" : "live";
}

function runtimeDependencies(dependencies: RuntimeDependencies) {
  return {
    cache: dependencies.cache ?? sharedCache,
    budget: dependencies.budget ?? sharedBudget,
    replay: dependencies.replay ?? sharedReplay,
    mode: dependencies.mode ?? configuredRunMode(),
    force_refresh: dependencies.force_refresh ?? false,
    now: dependencies.now
  };
}

function deepModel() {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

function coarseModel() {
  return process.env.GEMINI_COARSE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

export function buildYouTubeDeepCacheKey(rawUrl: string, model = deepModel()) {
  const source = canonicalizeYouTubeSource(rawUrl);
  return buildAnalysisCacheKey({
    provider: "youtube",
    source_id: source.source_id,
    analyzer_tier: "deep",
    schema_version: DEEP_SCHEMA_VERSION,
    prompt_version: DEEP_PROMPT_VERSION,
    model,
    media_resolution: DEEP_MEDIA_RESOLUTION
  });
}

export function buildYouTubeCoarseCacheKey(rawUrl: string, model = coarseModel()) {
  const source = canonicalizeYouTubeSource(rawUrl);
  return buildAnalysisCacheKey({
    provider: "youtube",
    source_id: source.source_id,
    analyzer_tier: "coarse",
    schema_version: COARSE_SCHEMA_VERSION,
    prompt_version: COARSE_PROMPT_VERSION,
    model,
    media_resolution: "default"
  });
}

function executionMetrics<T>(execution: Awaited<ReturnType<typeof executeAnalysis<T>>>) {
  return {
    requested_count: execution.requested_count,
    cache_hit_count: execution.cache_hit_count,
    cache_miss_count: execution.cache_miss_count,
    cache_bypass_count: execution.cache_bypass_count,
    replay_hit_count: execution.replay_hit_count,
    live_source_count: execution.live_source_count,
    live_request_count: execution.live_request_count
  };
}

export async function analyzeYouTubeDeepManaged(rawUrl: string, dependencies: RuntimeDependencies = {}) {
  const source = canonicalizeYouTubeSource(rawUrl);
  const model = deepModel();
  const cacheKey = buildYouTubeDeepCacheKey(source.canonical_url, model);
  const runtime = runtimeDependencies(dependencies);

  const execution = await executeAnalysis<VideoAnalysis>({
    model,
    items: [{ source_id: source.source_id, cache_key: cacheKey }],
    cache: runtime.cache,
    budget: runtime.budget,
    replay: runtime.replay,
    mode: runtime.mode,
    force_refresh: runtime.force_refresh,
    now: runtime.now,
    live: async () => ({
      [source.source_id]: await analyzeYouTubeVideo(source.canonical_url)
    })
  });

  return {
    source,
    analysis: execution.values[source.source_id],
    execution: {
      cache_key: cacheKey,
      provenance: execution.provenance[source.source_id],
      ...executionMetrics(execution)
    }
  };
}

export async function invalidateYouTubeDeepCache(
  rawUrl: string,
  cache: AnalysisCacheStore = sharedCache
) {
  if (!("delete" in cache) || typeof (cache as InvalidatableAnalysisCacheStore).delete !== "function") {
    throw new Error("현재 analysis cache adapter는 explicit invalidation을 지원하지 않습니다.");
  }
  return (cache as InvalidatableAnalysisCacheStore).delete(buildYouTubeDeepCacheKey(rawUrl));
}

export type CoarseAvailabilityError = {
  source_id: string;
  store: "cache" | "replay";
  message: string;
};

export async function readAvailableYouTubeCoarseAnalyses(
  videos: CoarseInputVideo[],
  dependencies: Pick<RuntimeDependencies, "cache" | "replay"> = {}
) {
  const cache = dependencies.cache ?? sharedCache;
  const replay = dependencies.replay ?? sharedReplay;
  const model = coarseModel();
  const analyses: Record<string, CoarseVideoAnalysis> = {};
  const provenance: Record<string, "cache" | "replay"> = {};
  const errors: CoarseAvailabilityError[] = [];
  let cacheHitCount = 0;
  let replayHitCount = 0;

  for (const video of videos) {
    const source = canonicalizeYouTubeSource(video.url);
    if (source.source_id !== video.source_id) {
      throw new Error(`coarse source_id와 URL identity가 일치하지 않습니다: ${video.source_id} != ${source.source_id}`);
    }
    const cacheKey = buildYouTubeCoarseCacheKey(source.canonical_url, model);

    try {
      const cached = await cache.get<CoarseVideoAnalysis>(cacheKey);
      if (cached) {
        if (cached.value.source_id !== source.source_id) {
          throw new Error(`coarse cache source_id 불일치: ${cached.value.source_id} != ${source.source_id}`);
        }
        analyses[source.source_id] = cached.value;
        provenance[source.source_id] = "cache";
        cacheHitCount += 1;
        continue;
      }
    } catch (error) {
      errors.push({
        source_id: source.source_id,
        store: "cache",
        message: error instanceof Error ? error.message : String(error)
      });
    }

    if (!replay) continue;
    try {
      const replayed = await replay.get<CoarseVideoAnalysis>(cacheKey);
      if (!replayed) continue;
      if (replayed.source_id !== source.source_id) {
        throw new Error(`coarse replay source_id 불일치: ${replayed.source_id} != ${source.source_id}`);
      }
      analyses[source.source_id] = replayed;
      provenance[source.source_id] = "replay";
      replayHitCount += 1;
    } catch (error) {
      errors.push({
        source_id: source.source_id,
        store: "replay",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    analyses,
    provenance,
    errors,
    diagnostics: {
      requested_count: videos.length,
      cache_hit_count: cacheHitCount,
      replay_hit_count: replayHitCount,
      missing_count: videos.length - Object.keys(analyses).length,
      enrichment_error_count: errors.length,
      gemini_requests_executed: 0 as const
    }
  };
}

export async function analyzeYouTubeCoarseManaged(
  videos: CoarseInputVideo[],
  dependencies: RuntimeDependencies = {}
) {
  const model = coarseModel();
  const normalized = videos.map((video) => {
    const source = canonicalizeYouTubeSource(video.url);
    if (source.source_id !== video.source_id) {
      throw new Error(`coarse source_id와 URL identity가 일치하지 않습니다: ${video.source_id} != ${source.source_id}`);
    }
    return { video, source };
  });
  const cacheKeys = new Map(normalized.map(({ source }) => [
    source.source_id,
    buildYouTubeCoarseCacheKey(source.canonical_url, model)
  ]));
  const byId = new Map(normalized.map(({ video }) => [video.source_id, video]));
  const runtime = runtimeDependencies(dependencies);

  const execution = await executeAnalysis<CoarseVideoAnalysis>({
    model,
    items: normalized.map(({ source }) => ({
      source_id: source.source_id,
      cache_key: cacheKeys.get(source.source_id) as string
    })),
    cache: runtime.cache,
    budget: runtime.budget,
    replay: runtime.replay,
    mode: runtime.mode,
    force_refresh: runtime.force_refresh,
    now: runtime.now,
    live: async (sourceIds) => {
      const liveInputs = sourceIds.map((sourceId) => byId.get(sourceId) as CoarseInputVideo);
      const analyses = await analyzeYouTubeCoarseBundle(liveInputs);
      return Object.fromEntries(analyses.map((analysis) => [analysis.source_id, analysis]));
    }
  });

  return {
    analyses: videos.map((video) => execution.values[video.source_id]),
    execution: {
      cache_keys: Object.fromEntries(cacheKeys),
      provenance: execution.provenance,
      ...executionMetrics(execution)
    }
  };
}
