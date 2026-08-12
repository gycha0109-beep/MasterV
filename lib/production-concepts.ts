import type { EvidenceRule, EvidenceRuleSet } from "@/lib/evidence-rules";

export type ProductionConceptKind = "A" | "B" | "C";

export type ProductionConcept = {
  id: ProductionConceptKind;
  name: string;
  strategy: string;
  applied_rule_ids: string[];
  relaxed_rule_ids: string[];
  required_instructions: string[];
  optional_instructions: string[];
  evidence_summary: string[];
  caveats: string[];
};

export type ProductionConceptSet = {
  sample_size: number;
  selected_rule_ids: string[];
  concepts: ProductionConcept[];
  notes: string[];
};

const confidenceRank = { high: 3, medium: 2, low: 1 } as const;

function sortRules(rules: EvidenceRule[]) {
  return [...rules].sort(
    (a, b) =>
      confidenceRank[b.confidence] - confidenceRank[a.confidence] ||
      b.support_percent - a.support_percent ||
      b.support_count - a.support_count ||
      a.id.localeCompare(b.id, "ko")
  );
}

function summarize(rule: EvidenceRule) {
  return `${rule.title}: ${rule.support_count}/${rule.sample_size} (${rule.support_percent}%), ${rule.confidence.toUpperCase()}`;
}

function concept(
  id: ProductionConceptKind,
  name: string,
  strategy: string,
  applied: EvidenceRule[],
  relaxed: EvidenceRule[],
  optional: EvidenceRule[]
): ProductionConcept {
  return {
    id,
    name,
    strategy,
    applied_rule_ids: applied.map((rule) => rule.id),
    relaxed_rule_ids: relaxed.map((rule) => rule.id),
    required_instructions: applied.map((rule) => rule.instruction),
    optional_instructions: optional.map((rule) => rule.instruction),
    evidence_summary: applied.map(summarize),
    caveats: [
      "참고영상에서 반복된 제작 패턴을 이용한 콘셉트이며 성과를 보장하지 않는다.",
      "규칙의 문구나 개별 장면을 복사하지 말고 구조만 재사용한다.",
      ...relaxed.map((rule) => `${rule.title} 규칙은 이 안에서 의도적으로 완화한다.`)
    ]
  };
}

export function compileProductionConcepts(
  ruleSet: EvidenceRuleSet,
  selectedRuleIds: string[] = ruleSet.default_selected_rule_ids
): ProductionConceptSet {
  if (ruleSet.sample_size < 2) {
    throw new Error("제작안 생성에는 최소 2개의 참고영상이 필요합니다.");
  }

  const selectedSet = new Set(selectedRuleIds);
  const selected = sortRules(ruleSet.rules.filter((rule) => selectedSet.has(rule.id)));

  if (selected.length === 0) {
    throw new Error("제작안에 반영할 근거 규칙을 최소 1개 선택해주세요.");
  }

  const high = selected.filter((rule) => rule.confidence === "high");
  const medium = selected.filter((rule) => rule.confidence === "medium");
  const low = selected.filter((rule) => rule.confidence === "low");

  const core = high.length > 0 ? high : selected.slice(0, Math.min(2, selected.length));
  const balancedExtra = medium.slice(0, Math.max(1, Math.ceil(medium.length / 2)));
  const balancedApplied = sortRules([...new Map([...core, ...balancedExtra].map((rule) => [rule.id, rule])).values()]);
  const balancedOptional = selected.filter((rule) => !balancedApplied.some((item) => item.id === rule.id));

  const experimentalApplied = core;
  const experimentalRelaxed = selected.filter((rule) => !core.some((item) => item.id === rule.id));

  return {
    sample_size: ruleSet.sample_size,
    selected_rule_ids: selected.map((rule) => rule.id),
    concepts: [
      concept(
        "A",
        "반복 패턴 우선",
        "선택된 반복 규칙을 최대한 충실하게 반영해 레퍼런스 공통 구조에 가까운 제작안을 만든다.",
        selected,
        [],
        []
      ),
      concept(
        "B",
        "핵심 + 균형",
        "신뢰도가 높은 규칙을 고정하고 중간 신뢰도 규칙 일부만 반영해 과도한 모방을 피한다.",
        balancedApplied,
        [],
        balancedOptional
      ),
      concept(
        "C",
        "핵심 고정 실험",
        "가장 강한 근거만 고정하고 나머지 규칙을 의도적으로 풀어 새로운 구성 실험 여지를 남긴다.",
        experimentalApplied,
        experimentalRelaxed,
        experimentalRelaxed
      )
    ],
    notes: [
      "A/B/C의 차이는 근거 규칙 적용 강도이며 서로 다른 성과 예측 점수가 아니다.",
      "표본에서 반복됐다는 사실과 성과 원인이라는 해석을 구분한다.",
      `선택 규칙 ${selected.length}개 중 HIGH ${high.length}, MEDIUM ${medium.length}, LOW ${low.length}`
    ]
  };
}
