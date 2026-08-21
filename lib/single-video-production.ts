import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";
import {
  adaptReferenceProduction,
  type AdaptationExclusion,
  type AdaptedProductionStep
} from "@/lib/reference-adaptation";
import {
  normalizeRawFacts,
  type ProductTruthInterpretation,
  type ReferenceMechanismCandidate
} from "@/lib/product-truth-interpretation";

export type SingleVideoPromptKind = "script" | "shooting" | "assets" | "editing";

export type ProductTruthInput = {
  product_name: string;
  verified_facts: string;
  target_customer: string;
  price_offer: string;
  interpretation?: ProductTruthInterpretation;
};

export const EMPTY_PRODUCT_TRUTH: ProductTruthInput = {
  product_name: "",
  verified_facts: "",
  target_customer: "",
  price_offer: ""
};

export type ProductionStep = AdaptedProductionStep;

export type AssetGroup = {
  title: string;
  icon: string;
  items: string[];
};

export type SingleVideoProductionGuide = {
  direction_summary: string;
  production_steps: ProductionStep[];
  asset_groups: AssetGroup[];
  reference_claims: string[];
  excluded_reference_mechanisms: AdaptationExclusion[];
  critical_warnings: string[];
  product_truth: ProductTruthInput;
  reference_mechanisms: ReferenceMechanismCandidate[];
  interpretation_ready: boolean;
  interpretation_required: boolean;
  prompts: Record<SingleVideoPromptKind, string>;
  raw_prompt: string;
};

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatSeconds(value: number | null) {
  if (value === null) return "확인 불가";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function buildDirectionSummary(metrics: DerivedVideoMetrics, interpretationReady: boolean, interpretationRequired: boolean) {
  const direct = metrics.materials.find((item) => item.name === "직접촬영")?.percent ?? 0;
  const demos = metrics.demonstration.combined_percent;
  const firstRoles = metrics.first_three_seconds.message_roles.map((item) => item.name);
  const suffix = interpretationRequired && !interpretationReady
    ? " 상품 정보 의미 해석 후 실제 적용 장면을 확정합니다."
    : "";

  if (demos >= 45 && direct >= 50) {
    return `${firstRoles.includes("문제제기")
      ? "문제를 먼저 보여준 뒤, 내 상품에서 확인된 기능만 직접 시연하는 구조로 가져옵니다."
      : "설명보다 내 상품에서 확인된 기능을 직접 보여주는 구조로 가져옵니다."}${suffix}`;
  }
  if (demos >= 20) return `제품 설명 사이에 확인된 사용·기능 시연을 반복해서 넣는 구조로 가져옵니다.${suffix}`;
  if (direct < 30) return `직접 시연보다 상품·자료 화면을 조합하는 제작 방식을 가져오되, 내 상품 사실만 사용합니다.${suffix}`;
  return `참고영상의 구체 기능은 복사하지 않고 제작 순서와 표현 방식만 내 상품 정보에 맞춰 적용합니다.${suffix}`;
}

function buildReferenceClaims(analysis: VideoAnalysis) {
  return unique(
    analysis.observation_segments
      .flatMap((segment) => segment.claims)
      .map(clean)
      .filter(Boolean)
  ).slice(0, 20);
}

function buildAssetGroups(steps: ProductionStep[], productTruth: ProductTruthInput): AssetGroup[] {
  const direct = unique(steps.filter((step) => step.asset_kind === "direct").map((step) => step.detail)).slice(0, 6);
  const support = unique(steps.filter((step) => step.asset_kind === "support").map((step) => step.detail)).slice(0, 5);
  const info = unique(steps.filter((step) => step.asset_kind === "info").map((step) => step.detail)).slice(0, 5);
  const facts = normalizeRawFacts(productTruth.verified_facts);

  return [
    {
      title: "제품 실물",
      icon: "📦",
      items: [clean(productTruth.product_name) ? `${clean(productTruth.product_name)} 실물` : "판매할 상품 실물"]
    },
    {
      title: "직접 촬영",
      icon: "🎥",
      items: direct.length > 0 ? direct : ["제작 흐름 확정 후 필요한 직접 촬영 장면을 정리합니다."]
    },
    {
      title: "비교·보조 자료",
      icon: "🖼",
      items: [...support, ...info].length > 0 ? unique([...support, ...info]).slice(0, 6) : ["필요한 경우에만 준비"]
    },
    {
      title: "상품 정보",
      icon: "📝",
      items: facts.length > 0 ? facts : ["실제 판매 상품의 확인된 사실을 한 줄에 하나씩 입력"]
    }
  ];
}

function buildCriticalWarnings(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  exclusions: AdaptationExclusion[],
  interpretationRequired: boolean,
  interpretationReady: boolean
) {
  const warnings: string[] = [];

  if (interpretationRequired && !interpretationReady) {
    warnings.push("입력한 상품 사실은 아직 의미 해석 전입니다. 제작안에 반영한 뒤 최종 흐름과 프롬프트를 사용하세요.");
  }

  if (metrics.claims_and_evidence.claim_segments_with_no_evidence > 0) {
    warnings.push(`화면만으로 확인되지 않는 주장 ${metrics.claims_and_evidence.claim_segments_with_no_evidence}개 구간은 별도 확인이 필요합니다.`);
  }

  if (analysis.observation_segments.some((segment) =>
    segment.visual.subject_role === "비교제품" ||
    segment.visual.subject_role === "일반예시" ||
    segment.visual.subject_role === "외부자료대상" ||
    segment.evidence.scope === "비교/일반예시"
  )) {
    warnings.push("비교 제품·일반 사례·외부 자료 화면은 판매 제품의 성능 증거가 아닙니다.");
  }

  if (analysis.observation_segments.some((segment) =>
    segment.evidence.scope === "연출/보조" || segment.evidence.types.includes("상황재연")
  )) {
    warnings.push("풍경 B-roll·상황 재연은 설명용이며 실제 효능·성능을 입증하지 않습니다.");
  }

  if (interpretationReady && exclusions.length > 0) {
    warnings.push(`참고영상 제작 메커니즘 ${exclusions.length}개는 사용자 입력과 의미 연결이 없거나 불확실해 자동 제외했습니다.`);
  }

  return unique(warnings);
}

function systemGuardrails() {
  return [
    "참고영상의 문장, 자막, 장면을 그대로 복사하지 않고 제작 메커니즘만 참고한다.",
    "사용자가 입력한 원문만 Product Truth로 취급하고, semantic interpretation은 원문의 의미 연결에만 사용한다.",
    "semantic matcher가 matched로 승인하지 않은 참고 메커니즘을 되살리지 않는다.",
    "사용자 원문보다 강한 효능, 수치, 인증, 성능, 가격, 할인 정보를 만들어내지 않는다.",
    "비교 제품·일반 사례·연출 B-roll을 판매 제품의 성능 증거로 재작성하지 않는다.",
    "광고 문구의 주장과 화면에서 실제 확인 가능한 결과를 구분한다."
  ];
}

function productTruthContext(productTruth: ProductTruthInput) {
  const facts = normalizeRawFacts(productTruth.verified_facts);
  const hasAny = Boolean(
    clean(productTruth.product_name) ||
    facts.length > 0 ||
    clean(productTruth.target_customer) ||
    clean(productTruth.price_offer)
  );

  if (!hasAny) return "- 아직 입력되지 않음. 참고영상의 주장이나 스펙을 내 상품 사실로 사용하지 않는다.";

  const lines = [
    `- 상품명 원문: ${clean(productTruth.product_name) || "[입력 없음]"}`,
    `- 타깃 원문: ${clean(productTruth.target_customer) || "[입력 없음]"}`,
    `- 가격/혜택 원문: ${clean(productTruth.price_offer) || "[입력 없음]"}`,
    "- 확인된 특징/스펙 원문:"
  ];
  lines.push(...(facts.length > 0 ? facts.map((fact) => `  - ${fact}`) : ["  - [입력 없음]"]));
  return lines.join("\n");
}

function interpretationContext(guide: SingleVideoProductionGuide) {
  const facts = normalizeRawFacts(guide.product_truth.verified_facts);
  if (facts.length === 0) return "- 해석할 특징/스펙 원문이 없습니다.";
  if (!guide.interpretation_ready) return "- 아직 semantic interpretation 전입니다. 구체 참고 기능은 조건부 상태이며 최종 적용으로 간주하지 않습니다.";

  const matches = guide.product_truth.interpretation?.mechanism_matches ?? [];
  const matched = matches.filter((item) => item.status === "matched").length;
  const ambiguous = matches.filter((item) => item.status === "ambiguous").length;
  const unmatched = matches.filter((item) => item.status === "unmatched").length;
  return `- 사용자 원문은 변경하지 않았고 의미 연결만 수행했습니다. matched ${matched} / ambiguous ${ambiguous} / unmatched ${unmatched}.`;
}

function exclusionsContext(exclusions: AdaptationExclusion[]) {
  if (exclusions.length === 0) return "- 없음";
  return exclusions.map((item) => `- ${item.title}: ${item.reason}`).join("\n");
}

function baseContext(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  guide: SingleVideoProductionGuide
) {
  const structure = guide.production_steps.map((step, index) => `${index + 1}. ${step.title} — ${step.detail}`).join("\n");
  const assets = guide.asset_groups.flatMap((group) => group.items.map((item) => `- ${group.title}: ${item}`)).join("\n");
  const warnings = [...guide.critical_warnings, ...systemGuardrails()].map((warning) => `- ${warning}`).join("\n");
  const claimHandling = guide.reference_claims.length > 0
    ? `- 참고영상에서 구체 주장 ${guide.reference_claims.length}개를 추출했지만 Product Truth와 분리했으며 이 프롬프트의 상품 사실로 사용하지 않는다.`
    : "- 참고영상에서 별도 구체 주장을 추출하지 않았다.";
  const flowLabel = guide.interpretation_required && !guide.interpretation_ready
    ? "추천 제작 흐름 — Product Truth 의미 해석 전 / 조건부"
    : "추천 제작 흐름 — Product Truth 의미 매칭 적용";

  return `당신은 상품 숏폼 제작자다. 참고영상의 구체 제품 기능을 복사하지 말고, 관찰된 제작 메커니즘을 사용자가 입력한 Product Truth 원문에 맞춰 적용한다.\n\n[제작 방향]\n${guide.direction_summary}\n\n[${flowLabel}]\n${structure}\n\n[준비 소재]\n${assets}\n\n[내 상품 정보 — 사용자 입력 원문 authority]\n${productTruthContext(guide.product_truth)}\n\n[Product Truth semantic interpretation 상태]\n${interpretationContext(guide)}\n\n[참고영상 주장 처리]\n${claimHandling}\n\n[자동 제외된 참고 메커니즘]\n${exclusionsContext(guide.excluded_reference_mechanisms)}\n\n[참고영상 관찰 지표]\n- 길이: ${formatSeconds(analysis.duration_seconds ?? metrics.basis_duration_seconds)}\n- 상품 첫 등장: ${formatSeconds(metrics.product.first_seen_seconds)}\n- CTA 시작: ${formatSeconds(metrics.cta.first_seen_seconds)}\n- 사용/시연 비중: ${metrics.demonstration.combined_percent}%\n\n[주의]\n${warnings}`;
}

export function compileSingleVideoProductionGuide(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  productTruth: ProductTruthInput = EMPTY_PRODUCT_TRUTH
): SingleVideoProductionGuide {
  const adaptation = adaptReferenceProduction(analysis, productTruth);
  const referenceClaims = buildReferenceClaims(analysis);
  const interpretationRequired = normalizeRawFacts(productTruth.verified_facts).length > 0;

  const seed = {
    direction_summary: buildDirectionSummary(metrics, adaptation.interpretation_ready, interpretationRequired),
    production_steps: adaptation.steps,
    asset_groups: buildAssetGroups(adaptation.steps, productTruth),
    reference_claims: referenceClaims,
    excluded_reference_mechanisms: adaptation.exclusions,
    critical_warnings: buildCriticalWarnings(
      analysis,
      metrics,
      adaptation.exclusions,
      interpretationRequired,
      adaptation.interpretation_ready
    ),
    product_truth: productTruth,
    reference_mechanisms: adaptation.reference_mechanisms,
    interpretation_ready: adaptation.interpretation_ready,
    interpretation_required: interpretationRequired
  };

  const placeholderGuide = {
    ...seed,
    prompts: {} as Record<SingleVideoPromptKind, string>,
    raw_prompt: ""
  };
  const base = baseContext(analysis, metrics, placeholderGuide);
  const pendingInstruction = interpretationRequired && !adaptation.interpretation_ready
    ? " 현재 상품 사실의 semantic interpretation이 완료되지 않았으므로 구체 참고 기능을 사실처럼 확정하지 말고, 사용자에게 먼저 제작안 반영을 완료하도록 안내한다."
    : "";

  const prompts: Record<SingleVideoPromptKind, string> = {
    script: `${base}\n\n[작업: 대본]\n[추천 제작 흐름]에 남은 메커니즘만 사용해 내 상품용 세로형 상품 숏폼 대본을 새로 작성한다. 각 구간마다 시간, 화면, 행동, 내레이션/대사, 화면 자막, 장면 목적을 작성한다. 사용자 원문에 없는 상품 사실을 새로 만들지 않는다.${pendingInstruction}`,
    shooting: `${base}\n\n[작업: 촬영]\n[추천 제작 흐름]에 남은 메커니즘만 사용해 실제 촬영 가능한 쇼트 리스트를 작성한다. 각 쇼트마다 예상 길이, 피사체, 행동, 구도/카메라, 소품, 화면에서 확인되어야 할 내용을 적는다. semantic matcher가 승인하지 않은 참고 기능을 촬영 전제로 되살리지 않는다.${pendingInstruction}`,
    assets: `${base}\n\n[작업: 소재 준비]\n[추천 제작 흐름]에 실제로 남은 장면만 기준으로 준비할 소재 체크리스트를 만든다. 직접 촬영, 상품 실물, 상품 사진, 상품페이지, 공식 자료, 외부 자료, 그래픽/자막으로 구분하고 각 소재가 어느 장면에 필요한지 연결한다.${pendingInstruction}`,
    editing: `${base}\n\n[작업: 편집]\n[추천 제작 흐름]에 남은 장면만 사용해 편집자용 지시서를 작성한다. 시간순 컷 구성, 첫 3초 처리, 컷 전환 목적, 자막 밀도, 제품 노출 타이밍, 시연/결과 장면 유지 시간, CTA 처리를 포함한다. 사용자 원문보다 강한 성능처럼 편집하지 않는다.${pendingInstruction}`
  };

  const rawPrompt = `${base}\n\n[요청]\n대본, 촬영 구성, 준비 소재, 편집 지시를 서로 다른 섹션으로 작성한다. 사용자 원문 Product Truth를 유일한 상품 사실 authority로 사용한다.${pendingInstruction}`;

  return { ...seed, prompts, raw_prompt: rawPrompt };
}
