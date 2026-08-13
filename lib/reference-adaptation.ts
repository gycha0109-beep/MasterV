import type { ObservationSegment, VideoAnalysis } from "@/lib/analysis-schema";

export type ProductTruthLike = {
  product_name: string;
  verified_facts: string;
  target_customer: string;
  price_offer: string;
};

export type AdaptedProductionStep = {
  title: string;
  detail: string;
  mechanism: string;
  asset_kind: "direct" | "support" | "info" | "cta";
  matched_facts: string[];
};

export type AdaptationExclusion = {
  mechanism: string;
  title: string;
  reason: string;
  reference_detail: string;
};

export type ReferenceAdaptationResult = {
  steps: AdaptedProductionStep[];
  exclusions: AdaptationExclusion[];
};

type FactGroup = "automation" | "durability" | "water" | "uv" | "portability" | "size";
type MechanismKey =
  | "problem_hook"
  | "product_intro"
  | "comparison"
  | "automation_demo"
  | "durability_demo"
  | "durability_example"
  | "water_demo"
  | "uv_explanation"
  | "portability_demo"
  | "feature_demo"
  | "result_demo"
  | "price_offer"
  | "cta"
  | "support_example";

type ReferenceMechanism = {
  key: MechanismKey;
  reference_detail: string;
  required_groups: FactGroup[];
};

const FACT_PATTERNS: Record<FactGroup, RegExp> = {
  automation: /(자동\s*개폐|완전\s*자동|원터치|자동으로\s*(?:펼|접)|버튼.*(?:펼|접))/i,
  durability: /(내구|튼튼|강풍|유리섬유|살대|탄성|유연|충격|강도|파손|부러)/i,
  water: /(방수|발수|워터프루프|생활방수|물.*(?:튕|흘|막)|젖지)/i,
  uv: /(자외선|\buv\b|upf|양산|uv\s*차단)/i,
  portability: /(휴대|수납|주머니|파우치|버클|고리|경량|무게|\d+\s*(?:g|그램)\b)/i,
  size: /(크기|면적|폭|사이즈|길이|\d+\s*(?:cm|mm|인치)\b|대형|장우산)/i
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, max = 96) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function factsFromTruth(productTruth: ProductTruthLike) {
  return [...new Set(
    productTruth.verified_facts
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean)
  )].slice(0, 12);
}

function segmentSource(segment: ObservationSegment) {
  return clean([
    segment.scene_purpose,
    segment.action.type,
    segment.action.description,
    segment.visual.description,
    ...segment.message_roles
  ].join(" "));
}

function isNonSellingExample(segment: ObservationSegment) {
  return segment.visual.subject_role === "비교제품" ||
    segment.visual.subject_role === "일반예시" ||
    segment.visual.subject_role === "외부자료대상" ||
    segment.evidence.scope === "비교/일반예시" ||
    (segment.visual.subject_role !== "판매제품" &&
      segment.visual.material_types.includes("외부자료") &&
      (segment.message_roles.includes("문제제기") || segment.message_roles.includes("비교")));
}

function referenceMechanism(segment: ObservationSegment, index: number): ReferenceMechanism | null {
  const source = segmentSource(segment);
  const nonSellingExample = isNonSellingExample(segment);

  if (segment.message_roles.includes("CTA") || /CTA|구매|상세보기|클릭/.test(source)) {
    return { key: "cta", reference_detail: source, required_groups: [] };
  }

  if (nonSellingExample) {
    if (index === 0 && segment.message_roles.includes("문제제기")) {
      return { key: "problem_hook", reference_detail: source, required_groups: [] };
    }
    if (FACT_PATTERNS.durability.test(source)) {
      return { key: "durability_example", reference_detail: source, required_groups: ["durability"] };
    }
    if (FACT_PATTERNS.water.test(source)) {
      return { key: "support_example", reference_detail: source, required_groups: ["water"] };
    }
    if (FACT_PATTERNS.uv.test(source)) {
      return { key: "support_example", reference_detail: source, required_groups: ["uv"] };
    }
    return { key: "support_example", reference_detail: source, required_groups: [] };
  }

  if (FACT_PATTERNS.uv.test(source)) return { key: "uv_explanation", reference_detail: source, required_groups: ["uv"] };
  if (FACT_PATTERNS.water.test(source)) return { key: "water_demo", reference_detail: source, required_groups: ["water"] };
  if (FACT_PATTERNS.automation.test(source)) return { key: "automation_demo", reference_detail: source, required_groups: ["automation"] };
  if (FACT_PATTERNS.durability.test(source)) return { key: "durability_demo", reference_detail: source, required_groups: ["durability"] };
  if (FACT_PATTERNS.portability.test(source) && !FACT_PATTERNS.size.test(source)) {
    return { key: "portability_demo", reference_detail: source, required_groups: ["portability"] };
  }
  if (segment.message_roles.includes("비교") || FACT_PATTERNS.size.test(source)) {
    return { key: "comparison", reference_detail: source, required_groups: ["size", "portability"] };
  }
  if (segment.message_roles.includes("문제제기")) return { key: "problem_hook", reference_detail: source, required_groups: [] };
  if (segment.message_roles.includes("가격/혜택")) return { key: "price_offer", reference_detail: source, required_groups: [] };
  if (segment.message_roles.includes("제품소개")) return { key: "product_intro", reference_detail: source, required_groups: [] };
  if (segment.message_roles.includes("사용시연") || segment.evidence.types.includes("직접시연") || segment.evidence.types.includes("직접사용")) {
    return { key: "feature_demo", reference_detail: source, required_groups: [] };
  }
  if (segment.message_roles.includes("결과제시") || segment.evidence.types.includes("관찰가능한결과")) {
    return { key: "result_demo", reference_detail: source, required_groups: [] };
  }

  return null;
}

function matchingFacts(facts: string[], groups: FactGroup[]) {
  if (groups.length === 0) return [];
  return facts.filter((fact) => groups.some((group) => FACT_PATTERNS[group].test(fact))).slice(0, 2);
}

function firstUnusedFact(facts: string[], usedFacts: Set<string>) {
  return facts.find((fact) => !usedFacts.has(fact)) ?? null;
}

function pendingStep(mechanism: ReferenceMechanism): AdaptedProductionStep {
  const map: Record<MechanismKey, { title: string; detail: string; asset: AdaptedProductionStep["asset_kind"] }> = {
    problem_hook: { title: "문제 제시", detail: "실제 타깃이 겪는 대표 불편을 먼저 보여줍니다. 구체 문제는 판매 맥락에서 확인한 뒤 작성합니다.", asset: "support" },
    product_intro: { title: "제품 소개", detail: "판매할 제품을 화면에 명확히 보여줍니다.", asset: "direct" },
    comparison: { title: "비교", detail: "내 상품의 확인된 수치나 특징이 입력되면 동일 기준의 비교 장면으로 적용합니다.", asset: "direct" },
    automation_demo: { title: "기능 시연", detail: "내 상품에 대응하는 작동 기능이 확인되면 직접 작동 장면으로 보여줍니다.", asset: "direct" },
    durability_demo: { title: "내구성 시연", detail: "내 상품에 내구 관련 확인 사실이 있을 때만 실제 확인 가능한 범위에서 시연합니다.", asset: "direct" },
    durability_example: { title: "비교 사례", detail: "내 상품에 내구 관련 확인 사실이 있을 때만 일반 사례를 설명용 비교 자료로 사용합니다.", asset: "support" },
    water_demo: { title: "방수·발수 시연", detail: "내 상품에 방수·발수 관련 확인 사실이 있을 때만 물 사용 장면으로 보여줍니다.", asset: "direct" },
    uv_explanation: { title: "UV 정보", detail: "내 상품에 자외선 관련 확인 사실이 있을 때만 정보로 설명합니다. 풍경 B-roll은 성능 증거로 쓰지 않습니다.", asset: "info" },
    portability_demo: { title: "휴대성 시연", detail: "내 상품에 휴대·수납 관련 확인 사실이 있을 때만 실제 휴대 장면으로 보여줍니다.", asset: "direct" },
    feature_demo: { title: "핵심 기능 시연", detail: "내 상품의 확인된 특징 중 실제로 보여줄 수 있는 기능을 직접 시연합니다.", asset: "direct" },
    result_demo: { title: "결과 확인", detail: "내 상품의 확인된 특징 중 화면에서 직접 확인 가능한 결과만 보여줍니다.", asset: "direct" },
    price_offer: { title: "가격·혜택", detail: "실제 입력한 가격·혜택이 있을 때만 화면과 대사에 사용합니다.", asset: "info" },
    cta: { title: "CTA", detail: "영상 마지막에 구매·상세보기 등 다음 행동을 명확히 안내합니다.", asset: "cta" },
    support_example: { title: "보조 사례", detail: "내 상품의 확인된 특징을 설명할 필요가 있을 때만 보조 자료를 사용하고 제품 성능 증거로 과장하지 않습니다.", asset: "support" }
  };
  const value = map[mechanism.key];
  return { title: value.title, detail: value.detail, mechanism: mechanism.key, asset_kind: value.asset, matched_facts: [] };
}

function appliedStep(
  mechanism: ReferenceMechanism,
  productTruth: ProductTruthLike,
  matchedFacts: string[],
  fallbackFact: string | null
): AdaptedProductionStep {
  const selected = matchedFacts.length > 0 ? matchedFacts : fallbackFact ? [fallbackFact] : [];
  const quoted = selected.map((fact) => `‘${fact}’`).join(", ");
  const productName = clean(productTruth.product_name) || "내 상품";

  switch (mechanism.key) {
    case "problem_hook":
      return {
        title: "문제 제시",
        detail: clean(productTruth.target_customer) && !/^(모르겠음|모름|없음)$/i.test(clean(productTruth.target_customer))
          ? `${clean(productTruth.target_customer)}이 겪는 대표 불편을 먼저 보여주되, 구체 문제는 실제 판매 맥락에서 확인해 설정합니다.`
          : "사용자가 겪는 대표 불편을 먼저 보여주되, 구체 문제는 실제 판매 맥락에서 확인해 설정합니다.",
        mechanism: mechanism.key,
        asset_kind: "support",
        matched_facts: []
      };
    case "product_intro":
      return { title: "제품 소개", detail: `${productName}을 화면에 명확히 보여줍니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: [] };
    case "comparison":
      return { title: "비교", detail: `확인된 사실 ${quoted}을 수치 표시나 동일 기준의 화면 비교로 보여줍니다. 비교 대상의 수치는 별도 확인합니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "automation_demo":
      return { title: "기능 시연", detail: `확인된 작동 관련 사실 ${quoted}을 직접 조작하는 장면으로 보여줍니다. 입력 사실보다 강한 자동화 기능은 추가하지 않습니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "durability_demo":
      return { title: "내구성 시연", detail: `내구 관련 확인 사실 ${quoted}을 실제 확인 가능한 범위에서 시연합니다. 강풍·파손 방지 등 입력되지 않은 성능은 추가하지 않습니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "durability_example":
      return { title: "비교 사례", detail: `내구 관련 확인 사실 ${quoted}을 설명할 때 일반 사례를 보조 자료로 사용할 수 있지만, 그 화면을 ${productName}의 성능 증거로 쓰지 않습니다.`, mechanism: mechanism.key, asset_kind: "support", matched_facts: selected };
    case "water_demo":
      return { title: "방수·발수 시연", detail: `방수·발수 관련 확인 사실 ${quoted}을 실제 물 사용 장면으로 보여주되, 입력 범위를 넘는 방수 등급이나 성능은 단정하지 않습니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "uv_explanation":
      return { title: "UV 정보", detail: `자외선 관련 확인 사실 ${quoted}을 자막·설명으로 전달합니다. 풍경 B-roll은 설명용이며 차단 성능의 증거로 쓰지 않습니다.`, mechanism: mechanism.key, asset_kind: "info", matched_facts: selected };
    case "portability_demo":
      return { title: "휴대성 시연", detail: `휴대·수납 관련 확인 사실 ${quoted}을 실제 들고 다니거나 보관하는 장면으로 보여줍니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "feature_demo":
      return { title: "핵심 기능 시연", detail: `확인된 특징 ${quoted}을 실제 사용·작동 장면으로 보여줍니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "result_demo":
      return { title: "결과 확인", detail: `확인된 특징 ${quoted} 중 화면에서 직접 관찰 가능한 결과만 보여줍니다.`, mechanism: mechanism.key, asset_kind: "direct", matched_facts: selected };
    case "price_offer":
      return { title: "가격·혜택", detail: clean(productTruth.price_offer) ? `입력한 가격·혜택 ‘${clean(productTruth.price_offer)}’만 사용합니다.` : "가격·혜택 정보가 입력되지 않아 구체 수치는 사용하지 않습니다.", mechanism: mechanism.key, asset_kind: "info", matched_facts: [] };
    case "cta":
      return { title: "CTA", detail: clean(productTruth.price_offer) ? `‘${clean(productTruth.price_offer)}’ 범위 안에서 구매·상세보기 등 다음 행동을 안내합니다.` : "구매·상세보기 등 다음 행동을 명확히 안내합니다.", mechanism: mechanism.key, asset_kind: "cta", matched_facts: [] };
    case "support_example":
      return { title: "보조 사례", detail: selected.length > 0 ? `확인된 사실 ${quoted}을 설명하는 보조 자료만 사용하고 판매 제품의 성능 증거로 과장하지 않습니다.` : "필요한 경우에만 일반 사례·보조 자료를 사용하고 판매 제품의 성능 증거로 과장하지 않습니다.", mechanism: mechanism.key, asset_kind: "support", matched_facts: selected };
  }
}

function dedupeSteps(steps: AdaptedProductionStep[]) {
  return steps.filter((step, index) => {
    const previous = steps[index - 1];
    return !previous || previous.title !== step.title || previous.detail !== step.detail;
  });
}

function compactWithCta(steps: AdaptedProductionStep[]) {
  const compact = steps.slice(0, 8);
  const finalCta = [...steps].reverse().find((step) => step.mechanism === "cta");
  if (finalCta && !compact.some((step) => step.mechanism === "cta" && step.detail === finalCta.detail)) compact.push(finalCta);
  return compact;
}

export function adaptReferenceProduction(analysis: VideoAnalysis, productTruth: ProductTruthLike): ReferenceAdaptationResult {
  const facts = factsFromTruth(productTruth);
  const hasVerifiedFacts = facts.length > 0;
  const usedFacts = new Set<string>();
  const steps: AdaptedProductionStep[] = [];
  const exclusions: AdaptationExclusion[] = [];

  analysis.observation_segments.forEach((segment, index) => {
    const mechanism = referenceMechanism(segment, index);
    if (!mechanism) return;

    if (!hasVerifiedFacts && mechanism.required_groups.length > 0) {
      steps.push(pendingStep(mechanism));
      return;
    }

    const matches = matchingFacts(facts, mechanism.required_groups);
    const needsSpecificFact = mechanism.required_groups.length > 0;
    let fallbackFact: string | null = null;

    if (!needsSpecificFact && (mechanism.key === "feature_demo" || mechanism.key === "result_demo")) {
      fallbackFact = firstUnusedFact(facts, usedFacts);
      if (!fallbackFact && hasVerifiedFacts) {
        exclusions.push({
          mechanism: mechanism.key,
          title: pendingStep(mechanism).title,
          reason: "내 상품 정보에서 이 장면에 적용할 추가 확인 사실을 찾지 못해 제외했습니다.",
          reference_detail: shorten(mechanism.reference_detail)
        });
        return;
      }
    }

    if (needsSpecificFact && matches.length === 0) {
      exclusions.push({
        mechanism: mechanism.key,
        title: pendingStep(mechanism).title,
        reason: "내 상품의 확인된 특징/스펙에서 대응 사실을 찾지 못해 제작안에서 제외했습니다.",
        reference_detail: shorten(mechanism.reference_detail)
      });
      return;
    }

    const step = appliedStep(mechanism, productTruth, matches, fallbackFact);
    step.matched_facts.forEach((fact) => usedFacts.add(fact));
    steps.push(step);
  });

  const deduped = dedupeSteps(steps);
  return {
    steps: compactWithCta(deduped.length > 0 ? deduped : [
      { title: "제품 소개", detail: clean(productTruth.product_name) ? `${clean(productTruth.product_name)}을 화면에 명확히 보여줍니다.` : "판매할 제품을 화면에 명확히 보여줍니다.", mechanism: "product_intro", asset_kind: "direct", matched_facts: [] },
      { title: "CTA", detail: "구매·상세보기 등 다음 행동을 명확히 안내합니다.", mechanism: "cta", asset_kind: "cta", matched_facts: [] }
    ]),
    exclusions
  };
}
