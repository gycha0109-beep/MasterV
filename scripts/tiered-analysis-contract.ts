import { buildAnalysisCacheKey, createInitialQueueState, type SearchCandidate } from "../lib/tiered-analysis";
import { validateCoarseBundle } from "../lib/coarse-analysis";

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
  schema_version: "coarse-v1",
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
assert(keyA.includes("coarse-v1"), "schema version must participate in cache key");
assert(keyA.includes("coarse-prompt-v1"), "prompt version must participate in cache key");

const queue = createInitialQueueState("2026-08-13-Pacific");
assert(queue.status === "idle", "initial queue must be idle");
assert(queue.budget.tracked_requests_today === 0, "initial tracked request count must start at zero");

const inputs = [
  { source_id: "yt:A", url: "https://www.youtube.com/shorts/A" },
  { source_id: "yt:B", url: "https://www.youtube.com/shorts/B" }
];
const outputs = [
  {
    source_id: "yt:A",
    duration_seconds: 20,
    primary_delivery_mode: "demonstration" as const,
    hook_type: "문제제기",
    dominant_visual_source: "live_action",
    product_first_seen_seconds: 0,
    direct_demo_present: true,
    cta_present: true,
    multi_product: false,
    rough_structure: ["문제", "시연", "CTA"],
    risk_flags: [],
    confidence: "high" as const
  },
  {
    source_id: "yt:B",
    duration_seconds: 30,
    primary_delivery_mode: "curation" as const,
    hook_type: "리스트",
    dominant_visual_source: "mixed",
    product_first_seen_seconds: 1,
    direct_demo_present: false,
    cta_present: true,
    multi_product: true,
    rough_structure: ["훅", "상품1", "상품2", "CTA"],
    risk_flags: ["다제품"],
    confidence: "medium" as const
  }
];
assert(validateCoarseBundle(inputs, outputs).length === 2, "valid coarse bundle must pass");

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

let duplicateRejected = false;
try {
  validateCoarseBundle(inputs, [outputs[0], { ...outputs[1], source_id: "yt:A" }]);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "duplicate source output must reject entire bundle");

console.log("TIERED_ANALYSIS_CONTRACT_PASS");
