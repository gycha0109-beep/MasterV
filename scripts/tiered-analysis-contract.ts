import {
  buildAnalysisCacheKey,
  buildOrchestrationPlan,
  createCalibratedCoarseRuntimeGate,
  createInitialQueueState,
  type CoarseVideoAnalysis,
  type SearchCandidate
} from "../lib/tiered-analysis";
import {
  buildCoarseAnalysisJsonSchema,
  COARSE_SCHEMA_VERSION,
  validateCoarseBundle,
  validateCoarseInput
} from "../lib/coarse-analysis";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const candidate: SearchCandidate = {
  source: "youtube",
  source_id: "yt:T9Kc4GT8vGA",
  canonical_url: "https://www.youtube.com/shorts/T9Kc4GT8vGA",
  native_metrics: { views: 120000, likes: 3400 },
  source_metadata: { expected_style: "식사 영상" }
};

assert(candidate.native_metrics.views === 120000, "platform-native metrics must be preserved without universal score conversion");

const keyA = buildAnalysisCacheKey({
  provider: "youtube",
  source_id: candidate.source_id,
  analyzer_tier: "coarse",
  schema_version: COARSE_SCHEMA_VERSION,
  prompt_version: "coarse-prompt-v1",
  model: "gemini-3.6-flash",
  media_resolution: "low"
});
const keyB = buildAnalysisCacheKey({
  provider: "youtube",
  source_id: candidate.source_id,
  analyzer_tier: "deep",
  schema_version: "deep-v2",
  prompt_version: "deep-prompt-v5",
  model: "gemini-3.6-flash",
  media_resolution: "default"
});
assert(keyA !== keyB, "coarse and deep cache keys must never collide");
assert(keyA.includes("coarse-v2"), "current coarse schema version must participate in cache key");
assert(keyA.includes("coarse-prompt-v1"), "prompt version must participate in cache key");

const queue = createInitialQueueState("2026-08-13-Pacific");
assert(queue.status === "idle", "initial queue must be idle");
assert(queue.budget.tracked_requests_today === 0, "initial tracked request count must start at zero");

const inputs = [
  { source_id: "yt:A", url: "https://www.youtube.com/shorts/A" },
  { source_id: "yt:B", url: "https://www.youtube.com/shorts/B" }
];
const outputs: CoarseVideoAnalysis[] = [
  {
    source_id: "yt:A",
    duration_seconds: 20,
    primary_delivery_mode: "demonstration",
    hook_type: "문제제기",
    dominant_visual_source: "live_action",
    product_first_seen_seconds: 0,
    direct_demo_present: true,
    cta_present: true,
    multi_product: false,
    rough_structure: ["문제", "시연", "CTA"],
    risk_flags: [],
    confidence: "high"
  },
  {
    source_id: "yt:B",
    duration_seconds: 30,
    primary_delivery_mode: "curation",
    hook_type: "리스트",
    dominant_visual_source: "mixed",
    product_first_seen_seconds: 1,
    direct_demo_present: false,
    cta_present: true,
    multi_product: true,
    rough_structure: ["훅", "상품1", "상품2", "CTA"],
    risk_flags: ["다제품"],
    confidence: "medium"
  }
];

assert(validateCoarseInput(inputs).length === 2, "valid coarse input must pass preflight validation");

const schema = buildCoarseAnalysisJsonSchema(inputs.map((item) => item.source_id));
const schemaVideos = schema.properties.videos;
const schemaSourceIds = schemaVideos.items.properties.source_id.enum;
assert(schemaVideos.minItems === 2 && schemaVideos.maxItems === 2, "coarse response schema must require exactly one result per input video");
assert(schemaSourceIds.length === 2, "coarse response schema must enumerate every expected source_id");
assert(schemaSourceIds[0] === "yt:A" && schemaSourceIds[1] === "yt:B", "coarse response schema must constrain source_id to exact input IDs");
assert(!schemaSourceIds.includes("yt:A00:00"), "timestamp-mutated source_id must be impossible in response schema");

assert(validateCoarseBundle(inputs, outputs).length === 2, "valid coarse bundle must pass");

let duplicateInputRejected = false;
try {
  validateCoarseInput([inputs[0], { ...inputs[1], source_id: "yt:A" }]);
} catch {
  duplicateInputRejected = true;
}
assert(duplicateInputRejected, "duplicate input source_id must reject before live API call");

let missingRejected = false;
try {
  validateCoarseBundle(inputs, outputs.slice(0, 1));
} catch {
  missingRejected = true;
}
assert(missingRejected, "missing source output must reject entire bundle");

let unknownRejected = false;
try {
  validateCoarseBundle(inputs, [{ ...outputs[0], source_id: "yt:OTHER" }, outputs[1]]);
} catch {
  unknownRejected = true;
}
assert(unknownRejected, "unknown source output must reject entire bundle");

let timestampMutationRejected = false;
try {
  validateCoarseBundle(inputs, [{ ...outputs[0], source_id: "yt:A00:00" }, outputs[1]]);
} catch {
  timestampMutationRejected = true;
}
assert(timestampMutationRejected, "timestamp-mutated source output must reject entire bundle");

let duplicateRejected = false;
try {
  validateCoarseBundle(inputs, [outputs[0], { ...outputs[1], source_id: "yt:A" }]);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "duplicate source output must reject entire bundle");

function searchCandidate(id: string, creator: string, rank: number): SearchCandidate {
  return {
    source: "youtube",
    source_id: `yt:${id}`,
    canonical_url: `https://www.youtube.com/watch?v=${id}`,
    creator,
    duration_seconds: 30,
    native_metrics: { search_rank: rank },
    source_metadata: {}
  };
}

function coarse(id: string, mode: CoarseVideoAnalysis["primary_delivery_mode"], confidence: CoarseVideoAnalysis["confidence"]): CoarseVideoAnalysis {
  return {
    source_id: `yt:${id}`,
    duration_seconds: 30,
    primary_delivery_mode: mode,
    hook_type: "fixture",
    dominant_visual_source: "fixture",
    product_first_seen_seconds: 1,
    direct_demo_present: mode === "demonstration",
    cta_present: true,
    multi_product: mode === "curation",
    rough_structure: ["hook", "body", "cta"],
    risk_flags: [],
    confidence
  };
}

const orchestrationCandidates = [
  searchCandidate("A", "Creator One", 1),
  searchCandidate("B", "Creator One", 2),
  searchCandidate("C", "Creator Two", 3),
  searchCandidate("D", "Creator Three", 4),
  searchCandidate("E", "Creator Four", 5),
  searchCandidate("F", "Creator Five", 6)
];

const cachedCoarse = {
  "yt:A": coarse("A", "demonstration", "high"),
  "yt:B": coarse("B", "demonstration", "medium"),
  "yt:C": coarse("C", "curation", "high")
};

const blockedPlan = buildOrchestrationPlan({
  query: "umbrella",
  candidates: orchestrationCandidates,
  coarse_by_source: cachedCoarse,
  profile: { coarse_live_limit: 2, deep_target_limit: 2, deep_max_per_creator: 1 }
});

assert(blockedPlan.phase === "coarse_partial", "cached coarse plus pending candidates must be coarse_partial");
assert(blockedPlan.diagnostics.coarse_cached_count === 3, "cached coarse count mismatch");
assert(blockedPlan.diagnostics.coarse_pending_live_count === 2, "cache hits must not consume live candidate slots");
assert(blockedPlan.diagnostics.coarse_deferred_count === 1, "overflow candidates must remain deferred");
assert(blockedPlan.diagnostics.coarse_runtime_allowed === false, "coarse runtime must be blocked before calibration activation");
assert(blockedPlan.coarse_live_batches.length === 0, "blocked quality gate must not create live coarse batches");
assert(blockedPlan.deep_representative_source_ids.join(",") === "yt:A,yt:C", "deep representatives must diversify across coarse clusters and creators");
assert(blockedPlan.diagnostics.gemini_requests_executed === 0, "planning contract must execute zero Gemini requests");

const calibratedPlan = buildOrchestrationPlan({
  query: "umbrella",
  candidates: orchestrationCandidates,
  coarse_by_source: cachedCoarse,
  profile: { coarse_live_limit: 2, deep_target_limit: 2 },
  coarse_runtime_gate: createCalibratedCoarseRuntimeGate(2)
});
assert(calibratedPlan.diagnostics.coarse_runtime_allowed === true, "explicit calibrated gate must allow coarse planning");
assert(calibratedPlan.coarse_live_batches.length === 1, "two pending candidates at bundle size two must form one batch");
assert(calibratedPlan.coarse_live_batches[0].join(",") === "yt:D,yt:E", "live batch must contain only uncached pending candidates");

let invalidBundleRejected = false;
try {
  createCalibratedCoarseRuntimeGate(0);
} catch {
  invalidBundleRejected = true;
}
assert(invalidBundleRejected, "invalid calibrated bundle size must reject");

console.log("TIERED_ANALYSIS_CONTRACT_PASS");
