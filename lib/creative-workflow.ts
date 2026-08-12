import type { ReferenceComparisonResult } from "@/lib/reference-compare";
import { compileEvidenceRules, type EvidenceRuleSet } from "@/lib/evidence-rules";
import { compileProductionConcepts, type ProductionConceptSet } from "@/lib/production-concepts";
import { compilePromptPacks, type PromptContext, type PromptPackSet } from "@/lib/prompt-packs";

export type CreativeWorkflowResult = {
  evidence_rules: EvidenceRuleSet;
  production_concepts: ProductionConceptSet;
  prompt_packs: PromptPackSet;
};

export function compileCreativeWorkflow(
  comparison: ReferenceComparisonResult,
  options: {
    selected_rule_ids?: string[];
    prompt_context?: PromptContext;
  } = {}
): CreativeWorkflowResult {
  const evidenceRules = compileEvidenceRules(comparison);
  const productionConcepts = compileProductionConcepts(
    evidenceRules,
    options.selected_rule_ids ?? evidenceRules.default_selected_rule_ids
  );
  const promptPacks = compilePromptPacks(
    productionConcepts,
    options.prompt_context ?? {}
  );

  return {
    evidence_rules: evidenceRules,
    production_concepts: productionConcepts,
    prompt_packs: promptPacks
  };
}
