import type {
  CommonPattern,
  CrossVideoCoverageMetric,
  ReferenceComparisonResult
} from "@/lib/reference-compare";

export type EvidenceRuleCategory =
  | "opening"
  | "material"
  | "presenter"
  | "demonstration"
  | "evidence"
  | "message"
  | "cta"
  | "sequence";

export type EvidenceRuleConfidence = "low" | "medium" | "high";
export type EvidenceRuleStatus = "candidate" | "recurring" | "dominant";

export type EvidenceRule = {
  id: string;
  category: EvidenceRuleCategory;
  title: string;
  instruction: string;
  support_count: number;
  sample_size: number;
  support_percent: number;
  counterexample_count: number;
  counterexample_percent: number;
  confidence: EvidenceRuleConfidence;
  status: EvidenceRuleStatus;
  default_selected: boolean;
  evidence: string[];
  caveats: string[];
};

export type EvidenceRuleSet = {
  sample_size: number;
  generated_at: "deterministic";
  rules: EvidenceRule[];
  default_selected_rule_ids: string[];
  notes: string[];
};

const round = (value: number) => Math.round(value * 10) / 10;

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^0-9a-z가-힣/_-]+/g, "")
    .replace(/\/+/, "-")
    .slice(0, 48) || "rule";
}

function confidence(sampleSize: number, supportPercent: number): EvidenceRuleConfidence {
  if (sampleSize >= 8 && supportPercent >= 75) return "high";
  if (sampleSize >= 4 && supportPercent >= 60) return "medium";
  return "low";
}

function status(supportCount: number, supportPercent: number): EvidenceRuleStatus {
  if (supportCount >= 3 && supportPercent >= 80) return "dominant";
  if (supportCount >= 2 && supportPercent >= 60) return "recurring";
  return "candidate";
}

function makeRule(args: {
  id: string;
  category: EvidenceRuleCategory;
  title: string;
  instruction: string;
  supportCount: number;
  sampleSize: number;
  supportPercent: number;
  evidence: string[];
  caveats?: string[];
}): EvidenceRule {
  const ruleConfidence = confidence(args.sampleSize, args.supportPercent);
  const ruleStatus = status(args.supportCount, args.supportPercent);
  const counterexampleCount = Math.max(0, args.sampleSize - args.supportCount);

  return {
    id: args.id,
    category: args.category,
    title: args.title,
    instruction: args.instruction,
    support_count: args.supportCount,
    sample_size: args.sampleSize,
    support_percent: round(args.supportPercent),
    counterexample_count: counterexampleCount,
    counterexample_percent: args.sampleSize
      ? round((counterexampleCount / args.sampleSize) * 100)
      : 0,
    confidence: ruleConfidence,
    status: ruleStatus,
    default_selected: ruleConfidence !== "low" && ruleStatus !== "candidate",
    evidence: args.evidence,
    caveats: [
      "선택된 참고영상에서 반복된 제작 패턴이며, 성과의 인과 원인으로 해석하지 않는다.",
      ...(args.caveats ?? [])
    ]
  };
}

function eligible(supportCount: number, supportPercent: number) {
  return supportCount >= 2 && supportPercent >= 50;
}

function coverageRule(
  metric: CrossVideoCoverageMetric,
  sampleSize: number,
  category: "material" | "presenter" | "message"
): EvidenceRule | null {
  if (!eligible(metric.video_count, metric.video_percent)) return null;

  const nouns = {
    material: ["화면 소재", "활용"],
    presenter: ["출연 요소", "등장"],
    message: ["메시지 역할", "포함"]
  } as const;
  const [kind, verb] = nouns[category];

  return makeRule({
    id: `${category}-${slug(metric.name)}`,
    category,
    title: `${metric.name} ${verb}`,
    instruction:
      category === "material"
        ? `${metric.name} 소재를 제작 구성에 포함하는 안을 우선 검토한다.`
        : category === "presenter"
          ? `${metric.name}이(가) 화면에 등장하는 구성을 우선 검토한다.`
          : `${metric.name} 역할을 수행하는 구간을 제작안에 포함하는 것을 우선 검토한다.`,
    supportCount: metric.video_count,
    sampleSize,
    supportPercent: metric.video_percent,
    evidence: [
      `${kind}: ${metric.video_count}/${sampleSize}개 영상 (${metric.video_percent}%)`,
      `해당 요소를 사용한 영상 내 평균 시간 coverage ${metric.avg_coverage_percent}%`,
      `해당 요소를 사용한 영상 내 중앙값 coverage ${metric.median_coverage_percent}%`
    ],
    caveats: ["coverage는 복수 요소가 동시에 집계될 수 있어 항목 합계가 100%일 필요가 없다."]
  });
}

function patternRule(pattern: CommonPattern, sampleSize: number): EvidenceRule | null {
  if (!eligible(pattern.support_count, pattern.support_percent)) return null;
  const sequence = pattern.sequence.join(" → ");

  return makeRule({
    id: `sequence-${slug(sequence)}`,
    category: "sequence",
    title: sequence,
    instruction: `${sequence} 순서를 하나의 제작 구조 후보로 사용한다.`,
    supportCount: pattern.support_count,
    sampleSize,
    supportPercent: pattern.support_percent,
    evidence: [`${pattern.support_count}/${sampleSize}개 영상에서 동일한 연속 역할 패턴 확인 (${pattern.support_percent}%)`],
    caveats: ["역할이 연속으로 반복된 구간은 정규화 과정에서 하나로 접힌 뒤 비교된다."]
  });
}

export function compileEvidenceRules(
  comparison: ReferenceComparisonResult
): EvidenceRuleSet {
  if (comparison.sample_size < 2) {
    throw new Error("근거 규칙 생성에는 최소 2개의 참고영상이 필요합니다.");
  }

  const total = comparison.sample_size;
  const rules: EvidenceRule[] = [];

  if (
    eligible(
      comparison.first_three_seconds.product_visible_count,
      comparison.first_three_seconds.product_visible_percent
    )
  ) {
    rules.push(
      makeRule({
        id: "opening-product-within-3s",
        category: "opening",
        title: "첫 3초 안에 상품 노출",
        instruction: "첫 3초 안에 상품 또는 상품 사용 장면이 보이는 제작안을 우선 검토한다.",
        supportCount: comparison.first_three_seconds.product_visible_count,
        sampleSize: total,
        supportPercent: comparison.first_three_seconds.product_visible_percent,
        evidence: [
          `첫 3초 상품 노출 ${comparison.first_three_seconds.product_visible_count}/${total}개 (${comparison.first_three_seconds.product_visible_percent}%)`,
          `상품 첫 등장 중앙값 ${comparison.product.median_first_seen_seconds ?? "확인 불가"}초`,
          `상품 첫 등장 평균 ${comparison.product.avg_first_seen_seconds ?? "확인 불가"}초`
        ],
        caveats: [
          `${comparison.product.known_first_seen_count}/${total}개 영상에서 상품 최초 등장 시점을 계산할 수 있었다.`
        ]
      })
    );
  }

  if (
    eligible(
      comparison.demonstration.videos_with_use_or_demo_count,
      comparison.demonstration.videos_with_use_or_demo_percent
    )
  ) {
    rules.push(
      makeRule({
        id: "demonstration-include-use-or-demo",
        category: "demonstration",
        title: "실제 사용 또는 기능 시연 포함",
        instruction: "설명만 이어가기보다 실제 사용 또는 기능 시연 구간을 제작안에 포함한다.",
        supportCount: comparison.demonstration.videos_with_use_or_demo_count,
        sampleSize: total,
        supportPercent: comparison.demonstration.videos_with_use_or_demo_percent,
        evidence: [
          `사용/시연 포함 ${comparison.demonstration.videos_with_use_or_demo_count}/${total}개 (${comparison.demonstration.videos_with_use_or_demo_percent}%)`,
          `영상 전체에서 사용/시연 비중 평균 ${comparison.demonstration.avg_combined_percent}%`,
          `사용/시연 비중 중앙값 ${comparison.demonstration.median_combined_percent}%`
        ]
      })
    );
  }

  if (
    eligible(
      comparison.demonstration.videos_with_visually_observable_result_count,
      comparison.demonstration.videos_with_visually_observable_result_percent
    )
  ) {
    rules.push(
      makeRule({
        id: "evidence-show-observable-result",
        category: "evidence",
        title: "화면에서 확인 가능한 결과 제시",
        instruction: "가능한 경우 주장만 말하지 말고 화면에서 직접 확인 가능한 변화나 결과를 보여준다.",
        supportCount: comparison.demonstration.videos_with_visually_observable_result_count,
        sampleSize: total,
        supportPercent: comparison.demonstration.videos_with_visually_observable_result_percent,
        evidence: [
          `관찰 가능한 결과 포함 ${comparison.demonstration.videos_with_visually_observable_result_count}/${total}개 (${comparison.demonstration.videos_with_visually_observable_result_percent}%)`
        ],
        caveats: ["제품을 먹거나 바르거나 착용하는 장면 자체는 효과가 관찰된 결과로 계산하지 않는다."]
      })
    );
  }

  if (eligible(comparison.cta.present_count, comparison.cta.present_percent)) {
    rules.push(
      makeRule({
        id: "cta-include",
        category: "cta",
        title: "CTA 포함",
        instruction: "마지막 또는 적절한 전환 지점에 명시적인 행동 유도 구간을 포함한다.",
        supportCount: comparison.cta.present_count,
        sampleSize: total,
        supportPercent: comparison.cta.present_percent,
        evidence: [
          `CTA 포함 ${comparison.cta.present_count}/${total}개 (${comparison.cta.present_percent}%)`,
          `CTA 최초 등장 중앙값 ${comparison.cta.median_first_seen_seconds ?? "확인 불가"}초`,
          `CTA 최초 등장 평균 ${comparison.cta.avg_first_seen_seconds ?? "확인 불가"}초`
        ]
      })
    );
  }

  for (const metric of comparison.materials) {
    const rule = coverageRule(metric, total, "material");
    if (rule) rules.push(rule);
  }

  for (const metric of comparison.presenters) {
    const rule = coverageRule(metric, total, "presenter");
    if (rule) rules.push(rule);
  }

  for (const metric of comparison.message_roles) {
    const rule = coverageRule(metric, total, "message");
    if (rule) rules.push(rule);
  }

  for (const pattern of comparison.common_patterns) {
    const rule = patternRule(pattern, total);
    if (rule) rules.push(rule);
  }

  const confidenceRank: Record<EvidenceRuleConfidence, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  const statusRank: Record<EvidenceRuleStatus, number> = {
    dominant: 3,
    recurring: 2,
    candidate: 1
  };

  rules.sort(
    (a, b) =>
      confidenceRank[b.confidence] - confidenceRank[a.confidence] ||
      statusRank[b.status] - statusRank[a.status] ||
      b.support_percent - a.support_percent ||
      a.id.localeCompare(b.id, "ko")
  );

  return {
    sample_size: total,
    generated_at: "deterministic",
    rules,
    default_selected_rule_ids: rules.filter((rule) => rule.default_selected).map((rule) => rule.id),
    notes: [
      "규칙은 선택된 참고영상 집합에서 반복된 제작 패턴을 결정론적으로 변환한 것이다.",
      "규칙의 support는 성과와의 인과관계를 의미하지 않는다.",
      "표본 8개 미만에서는 high confidence를 부여하지 않는다.",
      "지원율 50% 미만 또는 지지 영상 2개 미만인 요소는 제작 규칙으로 승격하지 않는다."
    ]
  };
}
