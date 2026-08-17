import assert from "node:assert/strict";
import { sanitizeProductTruthInterpretation } from "@/lib/product-truth-interpreter-core";
import type { ReferenceMechanismCandidate } from "@/lib/product-truth-interpretation";

const facts = ["백탁이 없음", "번들거림이 없음"];
const mechanisms: ReferenceMechanismCandidate[] = [
  {
    id: "demo",
    kind: "demonstration",
    title: "직접 시연",
    description: "상품 특징을 직접 보여준다.",
    requires_product_fact: true
  },
  {
    id: "cta",
    kind: "cta",
    title: "CTA",
    description: "행동 유도 구간을 둔다.",
    requires_product_fact: false
  }
];

const contradictory = sanitizeProductTruthInterpretation({
  version: "v1",
  source_facts: facts,
  mechanism_matches: [
    {
      mechanism_id: "demo",
      status: "ambiguous",
      matched_facts: ["백탁이 없음"],
      application_mode: "direct_demo",
      confidence: "medium",
      rationale: "불확실"
    },
    {
      mechanism_id: "cta",
      status: "matched",
      matched_facts: [],
      application_mode: "information",
      confidence: "high",
      rationale: "구조 규칙"
    }
  ]
}, facts, mechanisms);

assert.equal(contradictory.sanitized, true);
assert.deepEqual(contradictory.interpretation.source_facts, facts);
assert.equal(contradictory.interpretation.mechanism_matches[0].status, "ambiguous");
assert.deepEqual(contradictory.interpretation.mechanism_matches[0].matched_facts, []);
assert.equal(contradictory.interpretation.mechanism_matches[0].application_mode, "not_applicable");
assert(contradictory.warnings.includes("nonmatched_fact_link_removed:demo"));

const inventedFact = sanitizeProductTruthInterpretation({
  version: "v1",
  source_facts: ["모델이 바꾼 사실"],
  mechanism_matches: [
    {
      mechanism_id: "demo",
      status: "matched",
      matched_facts: ["SPF100"],
      application_mode: "direct_demo",
      confidence: "high",
      rationale: "과장"
    },
    {
      mechanism_id: "cta",
      status: "matched",
      matched_facts: [],
      application_mode: "information",
      confidence: "high",
      rationale: "구조 규칙"
    }
  ]
}, facts, mechanisms);

assert.deepEqual(inventedFact.interpretation.source_facts, facts);
assert.equal(inventedFact.interpretation.mechanism_matches[0].status, "unmatched");
assert.deepEqual(inventedFact.interpretation.mechanism_matches[0].matched_facts, []);
assert(inventedFact.warnings.includes("source_facts_replaced_with_user_authority"));
assert(inventedFact.warnings.includes("generated_fact_removed:demo"));
assert(inventedFact.warnings.includes("matched_without_valid_fact_downgraded:demo"));

const missingAndUnknown = sanitizeProductTruthInterpretation({
  version: "v1",
  source_facts: facts,
  mechanism_matches: [
    {
      mechanism_id: "unknown",
      status: "matched",
      matched_facts: ["백탁이 없음"],
      application_mode: "information",
      confidence: "high",
      rationale: "unknown"
    },
    {
      mechanism_id: "demo",
      status: "matched",
      matched_facts: ["백탁이 없음"],
      application_mode: "direct_demo",
      confidence: "high",
      rationale: "valid"
    }
  ]
}, facts, mechanisms);

assert.equal(missingAndUnknown.interpretation.mechanism_matches.length, 2);
assert.equal(missingAndUnknown.interpretation.mechanism_matches[0].status, "matched");
assert.deepEqual(missingAndUnknown.interpretation.mechanism_matches[0].matched_facts, ["백탁이 없음"]);
assert.equal(missingAndUnknown.interpretation.mechanism_matches[1].status, "matched");
assert.deepEqual(missingAndUnknown.interpretation.mechanism_matches[1].matched_facts, []);
assert(missingAndUnknown.warnings.includes("unknown_mechanism_ignored"));
assert(missingAndUnknown.warnings.includes("missing_mechanism_filled:cta"));

const duplicate = sanitizeProductTruthInterpretation({
  version: "v1",
  source_facts: facts,
  mechanism_matches: [
    {
      mechanism_id: "demo",
      status: "matched",
      matched_facts: ["백탁이 없음"],
      application_mode: "direct_demo",
      confidence: "high",
      rationale: "first"
    },
    {
      mechanism_id: "demo",
      status: "matched",
      matched_facts: ["번들거림이 없음"],
      application_mode: "direct_demo",
      confidence: "high",
      rationale: "second"
    },
    {
      mechanism_id: "cta",
      status: "matched",
      matched_facts: [],
      application_mode: "information",
      confidence: "high",
      rationale: "valid"
    }
  ]
}, facts, mechanisms);

assert.equal(duplicate.interpretation.mechanism_matches[0].status, "unmatched");
assert.deepEqual(duplicate.interpretation.mechanism_matches[0].matched_facts, []);
assert(duplicate.warnings.includes("duplicate_mechanism_downgraded:demo"));

const clean = sanitizeProductTruthInterpretation({
  version: "v1",
  source_facts: facts,
  mechanism_matches: [
    {
      mechanism_id: "demo",
      status: "matched",
      matched_facts: ["백탁이 없음"],
      application_mode: "direct_demo",
      confidence: "high",
      rationale: "valid"
    },
    {
      mechanism_id: "cta",
      status: "matched",
      matched_facts: [],
      application_mode: "information",
      confidence: "high",
      rationale: "valid"
    }
  ]
}, facts, mechanisms);

assert.equal(clean.sanitized, false);
assert.deepEqual(clean.warnings, []);

console.log("MASTERV_PRODUCT_TRUTH_SAFETY_CONTRACT_PASS");
