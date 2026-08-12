import type { ProductionConceptSet } from "../lib/production-concepts";
import { compilePromptPacks } from "../lib/prompt-packs";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const concepts: ProductionConceptSet = {
  sample_size: 10,
  selected_rule_ids: ["r1", "r2"],
  concepts: [
    {
      id: "A",
      name: "반복 패턴 우선",
      strategy: "공통 구조 최대 반영",
      applied_rule_ids: ["r1", "r2"],
      relaxed_rule_ids: [],
      required_instructions: ["첫 3초 제품 노출", "실제 시연 포함"],
      optional_instructions: [],
      evidence_summary: ["첫 3초 제품 노출: 8/10 (80%), HIGH"],
      caveats: ["성과를 보장하지 않는다."]
    },
    {
      id: "B",
      name: "핵심 + 균형",
      strategy: "핵심 규칙 중심",
      applied_rule_ids: ["r1"],
      relaxed_rule_ids: [],
      required_instructions: ["첫 3초 제품 노출"],
      optional_instructions: ["실제 시연 포함"],
      evidence_summary: ["첫 3초 제품 노출: 8/10 (80%), HIGH"],
      caveats: ["성과를 보장하지 않는다."]
    },
    {
      id: "C",
      name: "핵심 고정 실험",
      strategy: "핵심 외 실험",
      applied_rule_ids: ["r1"],
      relaxed_rule_ids: ["r2"],
      required_instructions: ["첫 3초 제품 노출"],
      optional_instructions: ["실제 시연 포함"],
      evidence_summary: ["첫 3초 제품 노출: 8/10 (80%), HIGH"],
      caveats: ["실제 시연 규칙을 완화한다."]
    }
  ],
  notes: []
};

const packs = compilePromptPacks(concepts, {
  product_name: "테스트 상품",
  platform: "YouTube Shorts",
  target_duration_seconds: 25,
  audience: "20~40대",
  objective: "제품 이해와 클릭 유도"
});

assert(packs.packs.length === 3, "must generate three prompt packs");
assert(packs.packs[0].concept_id === "A", "first pack should be A");
assert(packs.packs[0].script_prompt.includes("테스트 상품"), "product context must be included");
assert(packs.packs[0].script_prompt.includes("첫 3초 제품 노출"), "required evidence rule must be included");
assert(packs.packs[0].shooting_prompt.includes("연출/주장"), "shooting prompt must distinguish staged claims");
assert(packs.packs[0].asset_prompt.includes("저작권"), "asset prompt must mention source rights");
assert(packs.packs[0].editing_prompt.includes("과장 표현"), "editing prompt must contain claim guardrail");
assert(packs.packs[2].evidence_block.includes("핵심 외 실험"), "concept strategy must survive into evidence block");

let failed = false;
try {
  compilePromptPacks({ ...concepts, concepts: concepts.concepts.slice(0, 2) });
} catch {
  failed = true;
}
assert(failed, "prompt pack compiler must require A/B/C concepts");

console.log("PROMPT_PACKS_CONTRACT_PASS");
