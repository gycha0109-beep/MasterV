export type SourcePlatform = "youtube" | "tiktok" | "meta" | "direct";
export type AnalyzerTier = "metadata" | "coarse" | "deep";
export type AnalysisConfidence = "high" | "medium" | "low";

export type SearchCandidate = {
  source: SourcePlatform;
  source_id: string;
  canonical_url: string;
  title?: string;
  creator?: string;
  published_at?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  native_metrics: Record<string, number | string | null>;
  source_metadata: Record<string, unknown>;
};

export type CoarseDeliveryMode =
  | "demonstration"
  | "curation"
  | "buying_guide"
  | "review"
  | "problem_solution"
  | "comparison"
  | "vlog"
  | "image_compilation"
  | "mixed"
  | "unknown";

export type CoarseVideoAnalysis = {
  source_id: string;
  duration_seconds: number | null;
  primary_delivery_mode: CoarseDeliveryMode;
  hook_type: string;
  dominant_visual_source: string;
  product_first_seen_seconds: number | null;
  direct_demo_present: boolean;
  cta_present: boolean;
  multi_product: boolean;
  rough_structure: string[];
  risk_flags: string[];
  confidence: AnalysisConfidence;
};

export type AnalysisCacheKeyInput = {
  provider: SourcePlatform;
  source_id: string;
  analyzer_tier: Exclude<AnalyzerTier, "metadata">;
  schema_version: string;
  prompt_version: string;
  model: string;
  media_resolution: string;
};

export type AnalysisQueueStatus =
  | "idle"
  | "running"
  | "paused_rate_limit"
  | "blocked_rpd"
  | "blocked_unknown"
  | "completed";

export type AnalysisBudgetState = {
  tracked_requests_today: number;
  last_reset_window: string;
  last_rate_limit?: {
    kind: "RPM" | "TPM" | "RPD" | "UNKNOWN";
    model?: string;
    limit?: number;
  };
  queue_paused_until?: string;
};

export type AnalysisQueueState = {
  status: AnalysisQueueStatus;
  pending_source_ids: string[];
  active_source_ids: string[];
  completed_source_ids: string[];
  failed_source_ids: string[];
  budget: AnalysisBudgetState;
};

function encodeKeyPart(value: string) {
  return encodeURIComponent(value.trim());
}

export function buildAnalysisCacheKey(input: AnalysisCacheKeyInput) {
  return [
    encodeKeyPart(input.provider),
    encodeKeyPart(input.source_id),
    encodeKeyPart(input.analyzer_tier),
    encodeKeyPart(input.schema_version),
    encodeKeyPart(input.prompt_version),
    encodeKeyPart(input.model),
    encodeKeyPart(input.media_resolution)
  ].join("/");
}

export function createInitialQueueState(resetWindow: string): AnalysisQueueState {
  return {
    status: "idle",
    pending_source_ids: [],
    active_source_ids: [],
    completed_source_ids: [],
    failed_source_ids: [],
    budget: {
      tracked_requests_today: 0,
      last_reset_window: resetWindow
    }
  };
}

export const ORCHESTRATOR_DEFAULTS = {
  coarse_live_limit: 8,
  deep_target_limit: 2,
  deep_max_per_creator: 1
} as const;

export type OrchestratorProfile = {
  coarse_live_limit?: number;
  deep_target_limit?: number;
  deep_max_per_creator?: number;
};

export type CoarseRuntimeGate =
  | { status: "blocked_quality_gate"; reason: string }
  | { status: "enabled_calibrated"; bundle_size: number };

export const DEFAULT_COARSE_RUNTIME_GATE: CoarseRuntimeGate = {
  status: "blocked_quality_gate",
  reason: "MV-ARCH-1C is not QUALITY_VALIDATED"
};

export type PlannedCandidate = {
  candidate: SearchCandidate;
  coarse_state: "cached_ready" | "pending_live" | "deferred";
  coarse_analysis?: CoarseVideoAnalysis;
};

export type OrchestrationPlan = {
  query: string;
  phase: "empty" | "metadata_ready" | "coarse_partial" | "coarse_ready";
  candidates: PlannedCandidate[];
  coarse_clusters: Array<{ key: CoarseDeliveryMode; source_ids: string[] }>;
  deep_representative_source_ids: string[];
  coarse_live_batches: string[][];
  diagnostics: {
    candidate_count: number;
    coarse_cached_count: number;
    coarse_pending_live_count: number;
    coarse_deferred_count: number;
    coarse_runtime_allowed: boolean;
    deep_representative_count: number;
    gemini_requests_executed: 0;
  };
};

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function normalizeOrchestratorProfile(profile: OrchestratorProfile = {}) {
  return {
    coarse_live_limit: boundedInteger(profile.coarse_live_limit, ORCHESTRATOR_DEFAULTS.coarse_live_limit, 0, 100),
    deep_target_limit: boundedInteger(profile.deep_target_limit, ORCHESTRATOR_DEFAULTS.deep_target_limit, 0, 20),
    deep_max_per_creator: boundedInteger(profile.deep_max_per_creator, ORCHESTRATOR_DEFAULTS.deep_max_per_creator, 1, 20)
  };
}

export function createCalibratedCoarseRuntimeGate(bundleSize: number): CoarseRuntimeGate {
  if (!Number.isInteger(bundleSize) || bundleSize < 1 || bundleSize > 10) {
    throw new Error("bundle_size must be an integer from 1 to 10");
  }
  return { status: "enabled_calibrated", bundle_size: bundleSize };
}

function lookupCoarse(
  sourceId: string,
  values: ReadonlyMap<string, CoarseVideoAnalysis> | Record<string, CoarseVideoAnalysis | undefined>
) {
  const map = values as ReadonlyMap<string, CoarseVideoAnalysis>;
  if (typeof map.get === "function") return map.get(sourceId);
  return (values as Record<string, CoarseVideoAnalysis | undefined>)[sourceId];
}

export function planCoarseCandidates(
  candidates: SearchCandidate[],
  coarseBySource: ReadonlyMap<string, CoarseVideoAnalysis> | Record<string, CoarseVideoAnalysis | undefined>,
  profile: OrchestratorProfile = {}
) {
  const normalized = normalizeOrchestratorProfile(profile);
  let liveSlotsUsed = 0;
  return candidates.map((candidate): PlannedCandidate => {
    const cached = lookupCoarse(candidate.source_id, coarseBySource);
    if (cached) {
      if (cached.source_id !== candidate.source_id) throw new Error("coarse source_id mismatch");
      return { candidate, coarse_state: "cached_ready", coarse_analysis: cached };
    }
    if (liveSlotsUsed < normalized.coarse_live_limit) {
      liveSlotsUsed += 1;
      return { candidate, coarse_state: "pending_live" };
    }
    return { candidate, coarse_state: "deferred" };
  });
}

export function clusterCoarseCandidates(planned: PlannedCandidate[]) {
  const clusters = new Map<CoarseDeliveryMode, string[]>();
  for (const item of planned) {
    const analysis = item.coarse_analysis;
    if (!analysis) continue;
    const sourceIds = clusters.get(analysis.primary_delivery_mode) ?? [];
    sourceIds.push(item.candidate.source_id);
    clusters.set(analysis.primary_delivery_mode, sourceIds);
  }
  return [...clusters.entries()].map(([key, source_ids]) => ({ key, source_ids }));
}

const CONFIDENCE_ORDER: Record<AnalysisConfidence, number> = { high: 0, medium: 1, low: 2 };

function searchRank(candidate: SearchCandidate) {
  const value = candidate.native_metrics.search_rank;
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function selectDeepRepresentatives(planned: PlannedCandidate[], profile: OrchestratorProfile = {}) {
  const normalized = normalizeOrchestratorProfile(profile);
  if (normalized.deep_target_limit === 0) return [];

  const indexed = new Map(planned.map((item, index) => [item.candidate.source_id, { item, index }]));
  const clusters = clusterCoarseCandidates(planned).map((cluster) => ({
    ...cluster,
    members: cluster.source_ids.map((id) => indexed.get(id)!).sort((a, b) => {
      const aa = a.item.coarse_analysis!;
      const bb = b.item.coarse_analysis!;
      const confidence = CONFIDENCE_ORDER[aa.confidence] - CONFIDENCE_ORDER[bb.confidence];
      if (confidence !== 0) return confidence;
      if (a.item.candidate.source === b.item.candidate.source) {
        const rank = searchRank(a.item.candidate) - searchRank(b.item.candidate);
        if (rank !== 0) return rank;
      }
      return a.index - b.index;
    })
  }));

  const creatorCounts = new Map<string, number>();
  const selected: string[] = [];
  for (let depth = 0; depth <= planned.length && selected.length < normalized.deep_target_limit; depth += 1) {
    let added = false;
    for (const cluster of clusters) {
      const member = cluster.members[depth];
      if (!member) continue;
      const creator = member.item.candidate.creator?.trim().toLowerCase() || `source:${member.item.candidate.source_id}`;
      const count = creatorCounts.get(creator) ?? 0;
      if (count >= normalized.deep_max_per_creator) continue;
      creatorCounts.set(creator, count + 1);
      selected.push(member.item.candidate.source_id);
      added = true;
      if (selected.length >= normalized.deep_target_limit) break;
    }
    if (!added && clusters.every((cluster) => cluster.members.length <= depth + 1)) break;
  }
  return selected;
}

function buildCoarseLiveBatches(planned: PlannedCandidate[], gate: CoarseRuntimeGate) {
  if (gate.status !== "enabled_calibrated") return [];
  const pending = planned
    .filter((item) => item.coarse_state === "pending_live")
    .map((item) => item.candidate.source_id);
  const batches: string[][] = [];
  for (let index = 0; index < pending.length; index += gate.bundle_size) {
    batches.push(pending.slice(index, index + gate.bundle_size));
  }
  return batches;
}

export function buildOrchestrationPlan(input: {
  query: string;
  candidates: SearchCandidate[];
  coarse_by_source?: ReadonlyMap<string, CoarseVideoAnalysis> | Record<string, CoarseVideoAnalysis | undefined>;
  profile?: OrchestratorProfile;
  coarse_runtime_gate?: CoarseRuntimeGate;
}): OrchestrationPlan {
  const coarseBySource = input.coarse_by_source ?? {};
  const gate = input.coarse_runtime_gate ?? DEFAULT_COARSE_RUNTIME_GATE;
  const planned = planCoarseCandidates(input.candidates, coarseBySource, input.profile);
  const cached = planned.filter((item) => item.coarse_state === "cached_ready").length;
  const pending = planned.filter((item) => item.coarse_state === "pending_live").length;
  const deferred = planned.filter((item) => item.coarse_state === "deferred").length;
  const deep = selectDeepRepresentatives(planned, input.profile);
  const phase = input.candidates.length === 0
    ? "empty"
    : cached === 0
      ? "metadata_ready"
      : pending > 0 || deferred > 0
        ? "coarse_partial"
        : "coarse_ready";

  return {
    query: input.query.trim(),
    phase,
    candidates: planned,
    coarse_clusters: clusterCoarseCandidates(planned),
    deep_representative_source_ids: deep,
    coarse_live_batches: buildCoarseLiveBatches(planned, gate),
    diagnostics: {
      candidate_count: input.candidates.length,
      coarse_cached_count: cached,
      coarse_pending_live_count: pending,
      coarse_deferred_count: deferred,
      coarse_runtime_allowed: gate.status === "enabled_calibrated",
      deep_representative_count: deep.length,
      gemini_requests_executed: 0
    }
  };
}
