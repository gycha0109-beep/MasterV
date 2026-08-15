import type { AnalysisCacheStore, AnalysisReplayStore } from "@/lib/analysis-cache";
import { readAvailableYouTubeCoarseAnalyses } from "@/lib/analysis-service";
import type { SearchOptions } from "@/lib/discovery";
import {
  discoverYouTubeCandidatesWithKey,
  type FetchLike,
  type YouTubeDiscoveryResult
} from "@/lib/youtube-discovery-core";
import {
  buildOrchestrationPlan,
  type OrchestratorProfile
} from "@/lib/tiered-analysis";

export {
  parseIso8601DurationSeconds,
  YouTubeDiscoveryError,
  YouTubeDiscoveryProvider
} from "@/lib/youtube-discovery-core";
export type { YouTubeDiscoveryResult } from "@/lib/youtube-discovery-core";

export async function discoverYouTubeCandidates(
  query: string,
  options: SearchOptions = {},
  dependencies: { api_key?: string; fetcher?: FetchLike } = {}
): Promise<YouTubeDiscoveryResult> {
  const apiKey = dependencies.api_key ?? process.env.YOUTUBE_DATA_API_KEY ?? "";
  return discoverYouTubeCandidatesWithKey(query, options, {
    api_key: apiKey,
    fetcher: dependencies.fetcher
  });
}

export type ProgressiveDiscoveryDependencies = {
  api_key?: string;
  fetcher?: FetchLike;
  cache?: AnalysisCacheStore;
  replay?: AnalysisReplayStore;
  profile?: OrchestratorProfile;
};

export async function discoverYouTubeProgressive(
  query: string,
  options: SearchOptions = {},
  dependencies: ProgressiveDiscoveryDependencies = {}
) {
  const discovery = await discoverYouTubeCandidates(query, options, {
    api_key: dependencies.api_key,
    fetcher: dependencies.fetcher
  });
  const availability = await readAvailableYouTubeCoarseAnalyses(
    discovery.candidates.map((candidate) => ({ source_id: candidate.source_id, url: candidate.canonical_url })),
    { cache: dependencies.cache, replay: dependencies.replay }
  );
  const plan = buildOrchestrationPlan({
    query: discovery.query,
    candidates: discovery.candidates,
    coarse_by_source: availability.analyses,
    profile: dependencies.profile
  });

  return {
    ...discovery,
    orchestration: {
      plan,
      availability: {
        provenance: availability.provenance,
        errors: availability.errors,
        diagnostics: availability.diagnostics
      }
    }
  };
}
