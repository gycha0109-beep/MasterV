import type { VideoAnalysis } from "@/lib/analysis-schema";
import {
  InMemoryAnalysisCacheStore,
  type AnalysisCacheStore,
  type AnalysisReplayStore
} from "@/lib/analysis-cache";
import {
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

const sharedCache = new InMemoryAnalysisCacheStore();
const sharedBudget = new InMemoryAnalysisBudgetStore();

type RuntimeDependencies = {
  cache?: AnalysisCacheStore;
  budget?: AnalysisBudgetStore;
  replay?: AnalysisReplayStore;
  mode?: AnalysisRunMode;
  now?: Date;
};

function runtimeDependencies(dependencies: RuntimeDependencies) {
  return {
    cache: dependencies.cache ?? sharedCache,
    budget: dependencies.budget ?? sharedBudget,
    replay: dependencies.replay,
    mode: dependencies.mode ?? "live" as const,
    now: dependencies.now
  };
}

function deepModel() {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

function coarseModel() {
  return process.env.GEMINI_COARSE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

export async function analyzeYouTubeDeepManaged(rawUrl: string, dependencies: RuntimeDependencies = {}) {
  const source = canonicalizeYouTubeSource(rawUrl);
  const model = deepModel();
  const cacheKey = buildAnalysisCacheKey({
    provider: "youtube",
    source_id: source.source_id,
    analyzer_tier: "deep",
    schema_version: DEEP_SCHEMA_VERSION,
    prompt_version: DEEP_PROMPT_VERSION,
    model,
    media_resolution: DEEP_MEDIA_RESOLUTION
  });
  const runtime = runtimeDependencies(dependencies);

  const execution = await executeAnalysis<VideoAnalysis>({
    model,
    items: [{ source_id: source.source_id, cache_key: cacheKey }],
    cache: runtime.cache,
    budget: runtime.budget,
    replay: runtime.replay,
    mode: runtime.mode,
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
      live_request_count: execution.live_request_count
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
    buildAnalysisCacheKey({
      provider: "youtube",
      source_id: source.source_id,
      analyzer_tier: "coarse",
      schema_version: COARSE_SCHEMA_VERSION,
      prompt_version: COARSE_PROMPT_VERSION,
      model,
      media_resolution: "default"
    })
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
      live_request_count: execution.live_request_count
    }
  };
}
