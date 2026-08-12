import type { EvidenceRule, EvidenceRuleSet } from "../lib/evidence-rules";
import { compileProductionConcepts } from "../lib/production-concepts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function rule(
  id: string,
  confidence: EvidenceRule["confidence"],
  supportPercent: number
): EvidenceRule {
  return {
    id,
    category: "message",
    title: id,
    instruction: `${id} 적용`,
    support_count: Math.round(supportPercent / 10),
    sample_size: 10,
    support_percent: supportPercent,
    counterexample_count: 10 - Math.round(supportPercent / 10),
    counterexample_percent: 100 - supportPercent,
    confidence,
    status: supportPercent >= 80 ? "dominant" : supportPercent >= 60 ? "recurring" : "candidate",
    default_selected: confidence !== "low",
    evidence: [`${supportPercent}%`],
    caveats: []
  };
}

const ruleSet: EvidenceRuleSet = {
  sample_size: 10,
  generated_at: "deterministic",
  rules: [
    rule("product-early", "high", 90),
    rule("show-demo", "high", 80),
    rule("use-hand", "medium", 70),
    rule("sequence", "medium", 60),
    rule("weak", "low", 50)
  ],
  default_selected_rule_ids: ["product-early", "show-demo", "use-hand", "sequence"],
  notes: []
};

const result = compileProductionConcepts(ruleSet);
assert(result.concepts.length === 3, "must create A/B/C concepts");
assert(result.concepts[0].id === "A", "first concept must be A");
assert(result.concepts[0].applied_rule_ids.length === 4, "A should apply all selected rules");
assert(result.concepts[1].applied_rule_ids.includes("product-early"), "B must preserve high-confidence core");
assert(result.concepts[1].applied_rule_ids.includes("show-demo"), "B must preserve all high-confidence rules");
assert(result.concepts[2].applied_rule_ids.length === 2, "C should retain only high-confidence core when available");
assert(result.concepts[2].relaxed_rule_ids.includes("use-hand"), "C should relax medium rules");
assert(!result.selected_rule_ids.includes("weak"), "default selection should exclude low rule");

const custom = compileProductionConcepts(ruleSet, ["product-early", "weak"]);
assert(custom.selected_rule_ids.length === 2, "custom selection must be respected");
assert(custom.concepts[0].applied_rule_ids.includes("weak"), "A must apply explicitly selected low rule");
assert(custom.concepts[2].applied_rule_ids.length === 1, "C should keep high core only");

let failed = false;
try {
  compileProductionConcepts(ruleSet, []);
} catch {
  failed = true;
}
assert(failed, "empty rule selection must fail");

console.log("PRODUCTION_CONCEPTS_CONTRACT_PASS");
