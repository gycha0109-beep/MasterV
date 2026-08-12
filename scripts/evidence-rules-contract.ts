import type { ReferenceComparisonResult } from "../lib/reference-compare";
import { compileEvidenceRules } from "../lib/evidence-rules";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const comparison: ReferenceComparisonResult = {
  sample_size: 10,
  videos: [],
  first_three_seconds: {
    product_visible_count: 8,
    product_visible_percent: 80,
    materials: [],
    presenters: [],
    message_roles: [],
    actions: []
  },
  product: {
    known_first_seen_count: 10,
    avg_first_seen_seconds: 2.4,
    median_first_seen_seconds: 2,
    within_three_seconds_count: 8,
    within_three_seconds_percent: 80,
    avg_visible_percent: 61,
    median_visible_percent: 63
  },
  materials: [
    {
      name: "직접촬영",
      video_count: 8,
      video_percent: 80,
      avg_coverage_percent: 64,
      median_coverage_percent: 66,
      avg_seconds: 28
    },
    {
      name: "상품페이지",
      video_count: 2,
      video_percent: 20,
      avg_coverage_percent: 18,
      median_coverage_percent: 18,
      avg_seconds: 7
    }
  ],
  presenters: [
    {
      name: "손",
      video_count: 7,
      video_percent: 70,
      avg_coverage_percent: 48,
      median_coverage_percent: 45,
      avg_seconds: 19
    }
  ],
  message_roles: [
    {
      name: "사용시연",
      video_count: 9,
      video_percent: 90,
      avg_coverage_percent: 42,
      median_coverage_percent: 40,
      avg_seconds: 17
    }
  ],
  demonstration: {
    videos_with_use_or_demo_count: 9,
    videos_with_use_or_demo_percent: 90,
    avg_combined_percent: 39,
    median_combined_percent: 41,
    videos_with_visually_observable_result_count: 7,
    videos_with_visually_observable_result_percent: 70
  },
  claims_and_evidence: {
    videos_with_claims_count: 10,
    videos_with_claims_percent: 100,
    avg_claim_count: 5.2,
    videos_with_unsupported_claim_segments_count: 3,
    videos_with_unsupported_claim_segments_percent: 30,
    evidence_types: []
  },
  cta: {
    present_count: 8,
    present_percent: 80,
    avg_first_seen_seconds: 24,
    median_first_seen_seconds: 25
  },
  common_patterns: [
    {
      sequence: ["제품소개", "사용시연", "결과제시"],
      support_count: 7,
      support_percent: 70
    },
    {
      sequence: ["후기", "가격/혜택"],
      support_count: 2,
      support_percent: 20
    }
  ]
};

const rules = compileEvidenceRules(comparison);

assert(rules.sample_size === 10, "sample size should be preserved");
assert(rules.generated_at === "deterministic", "compiler should be deterministic");

const opening = rules.rules.find((rule) => rule.id === "opening-product-within-3s");
assert(opening, "opening product rule should be generated");
assert(opening?.support_count === 8, "opening support count should be 8");
assert(opening?.counterexample_count === 2, "opening counterexamples should be preserved");
assert(opening?.confidence === "high", "10 videos / 80% should be high confidence");
assert(opening?.default_selected === true, "high recurring rule should default selected");

const directMaterial = rules.rules.find((rule) => rule.id === "material-직접촬영");
assert(directMaterial?.support_percent === 80, "direct shooting support should be retained");

const weakMaterial = rules.rules.find((rule) => rule.id === "material-상품페이지");
assert(!weakMaterial, "20% material must not be promoted into a rule");

const sequence = rules.rules.find(
  (rule) => rule.title === "제품소개 → 사용시연 → 결과제시"
);
assert(sequence, "70% repeated sequence should be promoted");
assert(sequence?.confidence === "medium", "70% support at n=10 should be medium confidence");

const demo = rules.rules.find((rule) => rule.id === "demonstration-include-use-or-demo");
assert(demo?.confidence === "high", "90% demo support at n=10 should be high confidence");

const smallSample = compileEvidenceRules({
  ...comparison,
  sample_size: 3,
  first_three_seconds: {
    ...comparison.first_three_seconds,
    product_visible_count: 3,
    product_visible_percent: 100
  },
  product: {
    ...comparison.product,
    known_first_seen_count: 3,
    within_three_seconds_count: 3,
    within_three_seconds_percent: 100
  },
  materials: [],
  presenters: [],
  message_roles: [],
  demonstration: {
    ...comparison.demonstration,
    videos_with_use_or_demo_count: 3,
    videos_with_use_or_demo_percent: 100,
    videos_with_visually_observable_result_count: 0,
    videos_with_visually_observable_result_percent: 0
  },
  cta: {
    ...comparison.cta,
    present_count: 3,
    present_percent: 100
  },
  common_patterns: []
});

const smallOpening = smallSample.rules.find((rule) => rule.id === "opening-product-within-3s");
assert(smallOpening?.confidence === "low", "small samples must stay low confidence");
assert(smallOpening?.default_selected === false, "low confidence rules must not auto-select");

let failed = false;
try {
  compileEvidenceRules({ ...comparison, sample_size: 1 });
} catch {
  failed = true;
}
assert(failed, "single-video rule compilation must fail");

console.log("EVIDENCE_RULES_CONTRACT_PASS");
