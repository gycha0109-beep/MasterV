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
