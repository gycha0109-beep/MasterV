import type { ObservationSegment, VideoAnalysis } from "@/lib/analysis-schema";
import {
  interpretationMatchesFacts,
  normalizeRawFacts,
  type ApplicationMode,
  type ProductTruthInterpretation,
  type ReferenceMechanismCandidate
} from "@/lib/product-truth-interpretation";

export type ProductTruthLike = {
  product_name: string;
  verified_facts: string;
  target_customer: string;
  price_offer: string;
  interpretation?: ProductTruthInterpretation;
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
  reference_mechanisms: ReferenceMechanismCandidate[];
  interpretation_ready: boolean;
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, max = 110) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function segmentDescription(segment: ObservationSegment) {
  return shorten([
    segment.scene_purpose,
    segment.action.description,
    segment.visual.description
  ].map(clean).filter(Boolean).join(" · "));
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

function mechanismFromSegment(segment: ObservationSegment, index: number): ReferenceMechanismCandidate | null {
  const nonSelling = isNonSellingExample(segment);
  let kind: ReferenceMechanismCandidate["kind"];
  let title: string;
  let requiresProductFact = false;

  if (segment.message_roles.includes("CTA")) {
    kind = "cta";
    title = "CTA";
  } else if (nonSelling && index === 0 && segment.message_roles.includes("문제제기")) {
    kind = "problem_hook";
    title = "문제 훅";
  } else if (nonSelling) {
    kind = "support_example";
    title = segment.message_roles.includes("비교") ? "비교·보조 사례" : "보조 사례";
    requiresProductFact = true;
  } else if (segment.message_roles.includes("가격/혜택")) {
    kind = "price_offer";
    title = "가격·혜택";
  } else if (segment.message_roles.includes("문제제기")) {
    kind = "problem_hook";
    title = "문제 훅";
  } else if (segment.message_roles.includes("비교")) {
    kind = "comparison";
    title = "비교";
    requiresProductFact = true;
  } else if (
    segment.message_roles.includes("사용시연") ||
    segment.evidence.types.includes("직접시연") ||
    segment.evidence.types.includes("직접사용")
  ) {
    kind = "demonstration";
    title = "직접 시연";
    requiresProductFact = true;
  } else if (
    segment.message_roles.includes("결과제시") ||
    segment.evidence.types.includes("관찰가능한결과")
  ) {
    kind = "result";
    title = "결과 확인";
    requiresProductFact = true;
  } else if (segment.message_roles.includes("제품소개")) {
    kind = "product_intro";
    title = "제품 소개";
  } else if (segment.message_roles.includes("기능설명")) {
    kind = "information";
    title = "정보 전달";
    requiresProductFact = true;
  } else if (segment.evidence.scope === "연출/보조" || segment.evidence.scope === "외부자료") {
    kind = "support_example";
    title = "보조 설명";
    requiresProductFact = true;
  } else {
    return null;
  }

  return {
    id: `m${index + 1}`,
    kind,
    title,
    description: segmentDescription(segment),
    requires_product_fact: requiresProductFact
  };
}

export function extractReferenceMechanisms(analysis: VideoAnalysis) {
  return analysis.observation_segments
    .map((segment, index) => mechanismFromSegment(segment, index))
    .filter((item): item is ReferenceMechanismCandidate => Boolean(item));
}

function pendingStep(candidate: ReferenceMechanismCandidate): AdaptedProductionStep {
  if (candidate.kind === "problem_hook") {
    return {
      title: "문제 제시",
      detail: "참고영상은 문제를 먼저 보여주는 구조입니다. 구체 문제는 사용자가 입력한 상품/타깃 사실 범위를 넘겨 만들지 않습니다.",
      mechanism: candidate.id,
      asset_kind: "support",
      matched_facts: []
    };
  }
  if (candidate.kind === "product_intro") {
    return {
      title: "제품 소개",
      detail: "판매할 제품을 화면에 명확히 보여줍니다.",
      mechanism: candidate.id,
      asset_kind: "direct",
      matched_facts: []
    };
  }
  if (candidate.kind === "price_offer") {
    return {
      title: "가격·혜택",
      detail: "사용자가 실제 가격·혜택을 입력한 경우에만 사용합니다.",
      mechanism: candidate.id,
      asset_kind: "info",
      matched_facts: []
    };
  }
  if (candidate.kind === "cta") {
    return {
      title: "CTA",
      detail: "영상 마지막에 구매·상세보기 등 다음 행동을 안내합니다.",
      mechanism: candidate.id,
      asset_kind: "cta",
      matched_facts: []
    };
  }

  return {
    title: candidate.title,
    detail: "사용자가 입력한 확인 사실을 의미 해석한 뒤, 실제로 대응되는 경우에만 이 제작 메커니즘을 적용합니다.",
    mechanism: candidate.id,
    asset_kind: candidate.kind === "support_example" ? "support" : candidate.kind === "information" ? "info" : "direct",
    matched_facts: []
  };
}

function quotedFacts(facts: string[]) {
  return facts.map((fact) => `‘${fact}’`).join(", ");
}

function matchedStep(
  candidate: ReferenceMechanismCandidate,
  mode: ApplicationMode,
  facts: string[],
  productTruth: ProductTruthLike
): AdaptedProductionStep {
  const quoted = quotedFacts(facts);
  const productName = clean(productTruth.product_name) || "내 상품";

  if (mode === "comparison_candidate") {
    return {
      title: "비교 후보",
      detail: `확인 사실 ${quoted}을 먼저 그대로 표시하고, 비교 대상의 동일 기준 사실이 별도로 확인된 경우에만 비교 장면으로 확장합니다.`,
      mechanism: candidate.id,
      asset_kind: "direct",
      matched_facts: facts
    };
  }

  if (mode === "information") {
    return {
      title: "정보 전달",
      detail: `확인 사실 ${quoted}을 자막·내레이션으로 전달합니다. 원문보다 강한 성능·효능·수치로 바꾸지 않습니다.`,
      mechanism: candidate.id,
      asset_kind: "info",
      matched_facts: facts
    };
  }

  if (mode === "support_only") {
    return {
      title: candidate.kind === "support_example" ? "비교·보조 사례" : "보조 설명",
      detail: `확인 사실 ${quoted}을 설명하기 위한 보조 장면만 사용합니다. 해당 보조 화면을 ${productName}의 성능 증거로 표현하지 않습니다.`,
      mechanism: candidate.id,
      asset_kind: "support",
      matched_facts: facts
    };
  }

  return {
    title: candidate.kind === "result" ? "결과 확인" : "직접 시연",
    detail: `확인 사실 ${quoted}을 실제 화면에서 확인 가능한 범위로 보여줍니다. 사용자 원문보다 강한 제품 사실을 추가하지 않습니다.`,
    mechanism: candidate.id,
    asset_kind: "direct",
    matched_facts: facts
  };
}

function structuralStep(candidate: ReferenceMechanismCandidate, productTruth: ProductTruthLike): AdaptedProductionStep | null {
  if (candidate.kind === "problem_hook") {
    const target = clean(productTruth.target_customer);
    return {
      title: "문제 제시",
      detail: target
        ? `사용자가 입력한 타깃 ‘${target}’을 그대로 참고하되, 타깃의 성향·불편을 추가 추정하지 않고 문제 장면을 구성합니다.`
        : "타깃 정보가 비어 있으므로 특정 사용자 불편을 임의로 만들지 않고 중립적인 사용 맥락으로 시작합니다.",
      mechanism: candidate.id,
      asset_kind: "support",
      matched_facts: []
    };
  }

  if (candidate.kind === "product_intro") {
    return {
      title: "제품 소개",
      detail: `${clean(productTruth.product_name) || "판매할 제품"}을 화면에 명확히 보여줍니다.`,
      mechanism: candidate.id,
      asset_kind: "direct",
      matched_facts: []
    };
  }

  if (candidate.kind === "price_offer") {
    const offer = clean(productTruth.price_offer);
    if (!offer) return null;
    return {
      title: "가격·혜택",
      detail: `사용자가 입력한 가격·혜택 ‘${offer}’ 범위 안에서만 전달합니다.`,
      mechanism: candidate.id,
      asset_kind: "info",
      matched_facts: []
    };
  }

  if (candidate.kind === "cta") {
    const offer = clean(productTruth.price_offer);
    return {
      title: "CTA",
      detail: offer
        ? `사용자가 입력한 가격·혜택 ‘${offer}’ 범위 안에서 구매·상세보기 등 다음 행동을 안내합니다.`
        : "구매·상세보기 등 다음 행동을 안내하되 입력되지 않은 가격·할인 정보는 만들지 않습니다.",
      mechanism: candidate.id,
      asset_kind: "cta",
      matched_facts: []
    };
  }

  return null;
}

function dedupeSteps(steps: AdaptedProductionStep[]) {
  return steps.filter((step, index, items) => {
    const previous = items[index - 1];
    return !previous || previous.title !== step.title || previous.detail !== step.detail;
  });
}

function compactWithCta(steps: AdaptedProductionStep[]) {
  const compact = steps.slice(0, 8);
  const finalCta = [...steps].reverse().find((step) => step.title === "CTA");
  if (finalCta && !compact.some((step) => step.mechanism === finalCta.mechanism)) compact.push(finalCta);
  return compact;
}

export function adaptReferenceProduction(
  analysis: VideoAnalysis,
  productTruth: ProductTruthLike
): ReferenceAdaptationResult {
  const referenceMechanisms = extractReferenceMechanisms(analysis);
  const facts = normalizeRawFacts(productTruth.verified_facts);
  const interpretationReady = interpretationMatchesFacts(productTruth.interpretation, productTruth.verified_facts);
  const matchById = new Map(
    interpretationReady
      ? productTruth.interpretation!.mechanism_matches.map((item) => [item.mechanism_id, item] as const)
      : []
  );

  const steps: AdaptedProductionStep[] = [];
  const exclusions: AdaptationExclusion[] = [];

  for (const candidate of referenceMechanisms) {
    if (!candidate.requires_product_fact) {
      const structural = structuralStep(candidate, productTruth);
      if (structural) steps.push(structural);
      else if (candidate.kind === "price_offer") {
        exclusions.push({
          mechanism: candidate.id,
          title: candidate.title,
          reason: "가격·혜택 입력이 없어 해당 메커니즘을 제외했습니다.",
          reference_detail: candidate.description
        });
      }
      continue;
    }

    if (facts.length === 0 || !interpretationReady) {
      steps.push(pendingStep(candidate));
      continue;
    }

    const match = matchById.get(candidate.id);
    if (!match || match.status !== "matched" || match.application_mode === "not_applicable" || match.matched_facts.length === 0) {
      exclusions.push({
        mechanism: candidate.id,
        title: candidate.title,
        reason: match?.status === "ambiguous"
          ? "사용자 입력과의 의미 연결이 불확실해 자동 적용하지 않았습니다."
          : "사용자가 입력한 확인 사실에서 대응 의미를 찾지 못해 자동 제외했습니다.",
        reference_detail: candidate.description
      });
      continue;
    }

    steps.push(matchedStep(candidate, match.application_mode, match.matched_facts, productTruth));
  }

  const deduped = dedupeSteps(steps);
  const safeSteps = deduped.length > 0
    ? deduped
    : [{
        title: "제품 소개",
        detail: `${clean(productTruth.product_name) || "판매할 제품"}을 화면에 명확히 보여줍니다.`,
        mechanism: "fallback-product-intro",
        asset_kind: "direct" as const,
        matched_facts: []
      }, {
        title: "CTA",
        detail: "구매·상세보기 등 다음 행동을 안내합니다.",
        mechanism: "fallback-cta",
        asset_kind: "cta" as const,
        matched_facts: []
      }];

  return {
    steps: compactWithCta(safeSteps),
    exclusions,
    reference_mechanisms: referenceMechanisms,
    interpretation_ready: interpretationReady
  };
}
