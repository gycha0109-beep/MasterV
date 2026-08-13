import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";
import {
  adaptReferenceProduction,
  type AdaptationExclusion,
  type AdaptedProductionStep
} from "@/lib/reference-adaptation";

export type SingleVideoPromptKind = "script" | "shooting" | "assets" | "editing";

export type ProductTruthInput = {
  product_name: string;
  verified_facts: string;
  target_customer: string;
  price_offer: string;
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

function buildDirectionSummary(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const direct = metrics.materials.find((item) => item.name === "직접촬영")?.percent ?? 0;
  const demos = metrics.demonstration.combined_percent;
  const firstRoles = metrics.first_three_seconds.message_roles.map((item) => item.name);

  if (demos >= 45 && direct >= 50) {
    return firstRoles.includes("문제제기")
      ? "문제를 먼저 보여준 뒤, 내 상품에서 확인된 기능만 직접 시연하는 구조로 가져옵니다."
      : "설명보다 내 상품에서 확인된 기능을 직접 보여주는 구조로 가져옵니다.";
  }
  if (demos >= 20) return "제품 설명 사이에 내 상품에서 확인된 사용·기능 시연을 반복해서 넣는 구조로 가져옵니다.";
  if (direct < 30) return "직접 시연보다 상품·자료 화면을 조합하는 제작 방식을 가져오되, 내 상품 사실만 사용합니다.";
  return "참고영상의 구체 기능은 복사하지 않고 제작 순서와 표현 방식만 내 상품 정보에 맞춰 적용합니다.";
}

function buildReferenceClaims(analysis: VideoAnalysis) {
  return unique(
    analysis.observation_segments
      .flatMap((segment) => segment.claims)
      .map(clean)
      .filter(Boolean)
  ).slice(0, 12);
}

function buildAssetGroups(steps: ProductionStep[], productTruth: ProductTruthInput): AssetGroup[] {
  const direct = unique(
    steps
      .filter((step) => step.asset_kind === "direct")
      .map((step) => step.detail)
  ).slice(0, 6);
  const support = unique(
    steps
      .filter((step) => step.asset_kind === "support")
      .map((step) => step.detail)
  ).slice(0, 5);
  const facts = verifiedFacts(productTruth.verified_facts);

  return [
    {
      title: "제품 실물",
      icon: "📦",
      items: [clean(productTruth.product_name) ? `${clean(productTruth.product_name)} 실물` : "판매할 상품 실물"]
    },
    {
      title: "직접 촬영",
      icon: "🎥",
      items: direct.length > 0 ? direct : ["제품 제시·사용 장면 촬영"]
    },
    {
      title: "비교·보조 자료",
      icon: "🖼",
      items: support.length > 0 ? support : ["필요한 경우에만 준비"]
    },
    {
      title: "상품 정보",
      icon: "📝",
      items: facts.length > 0 ? facts : ["아래 '내 상품 정보'에 실제 판매 상품의 확인된 사실 입력"]
    }
  ];
}

function buildCriticalWarnings(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  exclusions: AdaptationExclusion[],
  productTruth: ProductTruthInput
) {
  const warnings: string[] = [];

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

  if (verifiedFacts(productTruth.verified_facts).length > 0 && exclusions.length > 0) {
    warnings.push(`참고영상의 구체 제작 요소 ${exclusions.length}개는 내 상품 정보에 대응 사실이 없어 자동 제외했습니다.`);
  }

  return unique(warnings);
}

function systemGuardrails() {
  return [
    "참고영상의 문장, 자막, 장면을 그대로 복사하지 않고 제작 메커니즘만 참고한다.",
    "참고영상의 주장·스펙·가격·후기는 내 상품 정보로 간주하지 않는다.",
    "[추천 제작 흐름]에 남지 않은 참고영상의 구체 기능이나 성능을 다시 추가하지 않는다.",
    "비교 제품·일반 사례·연출 B-roll을 판매 제품의 성능 증거로 재작성하지 않는다.",
    "확인되지 않은 효능, 수치, 후기, 인증, 가격, 할인 정보를 만들어내지 않는다.",
    "광고 문구의 주장과 화면에서 실제 확인 가능한 결과를 구분한다."
  ];
}

function verifiedFacts(value: string) {
  return unique(
    value
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean)
  ).slice(0, 12);
}

function productTruthContext(productTruth: ProductTruthInput) {
  const facts = verifiedFacts(productTruth.verified_facts);
  const hasAny = Boolean(
    clean(productTruth.product_name) ||
    facts.length > 0 ||
    clean(productTruth.target_customer) ||
    clean(productTruth.price_offer)
  );

  if (!hasAny) {
    return "- 아직 입력되지 않음. 참고영상의 주장이나 스펙을 내 상품 사실로 사용하지 않는다.";
  }

  const lines = [
    `- 상품명: ${clean(productTruth.product_name) || "[입력 없음]"}`,
    `- 타깃: ${clean(productTruth.target_customer) || "[입력 없음]"}`,
    `- 가격/혜택: ${clean(productTruth.price_offer) || "[입력 없음]"}`,
    "- 확인된 특징/스펙:"
  ];
  lines.push(...(facts.length > 0 ? facts.map((fact) => `  - ${fact}`) : ["  - [입력 없음]"]));
  return lines.join("\n");
}

function exclusionsContext(exclusions: AdaptationExclusion[]) {
  if (exclusions.length === 0) return "- 없음";
  return exclusions
    .map((item) => `- ${item.title}: ${item.reason}`)
    .join("\n");
}

function baseContext(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  guide: Pick<
    SingleVideoProductionGuide,
    "direction_summary" |
    "production_steps" |
    "asset_groups" |
    "reference_claims" |
    "excluded_reference_mechanisms" |
    "critical_warnings" |
    "product_truth"
  >
) {
  const structure = guide.production_steps
    .map((step, index) => `${index + 1}. ${step.title} — ${step.detail}`)
    .join("\n");
  const assets = guide.asset_groups
    .flatMap((group) => group.items.map((item) => `- ${group.title}: ${item}`))
    .join("\n");
  const warnings = [...guide.critical_warnings, ...systemGuardrails()]
    .map((warning) => `- ${warning}`)
    .join("\n");
  const claimHandling = guide.reference_claims.length > 0
    ? `- 참고영상에서 구체 주장 ${guide.reference_claims.length}개를 추출했지만 Product Truth와 분리했으며, 이 프롬프트의 상품 사실이나 촬영 전제로 사용하지 않는다.`
    : "- 참고영상에서 별도 구체 주장을 추출하지 않았다.";

  return `당신은 상품 숏폼 제작자다. 참고영상의 구체 제품 기능을 복사하지 말고, 관찰된 제작 메커니즘을 [내 상품 정보]에 사용자가 직접 입력한 사실에 맞춰 적용한다.\n\n[제작 방향]\n${guide.direction_summary}\n\n[추천 제작 흐름 — Product Truth 적용 완료]\n${structure}\n\n[준비 소재]\n${assets}\n\n[내 상품 정보 — 사용자 입력 Product Truth]\n${productTruthContext(guide.product_truth)}\n\n[참고영상 주장 처리]\n${claimHandling}\n\n[내 상품에 없어 제외된 참고 메커니즘]\n${exclusionsContext(guide.excluded_reference_mechanisms)}\n\n[관찰 지표]\n- 참고영상 길이: ${formatSeconds(analysis.duration_seconds ?? metrics.basis_duration_seconds)}\n- 참고영상 상품 첫 등장: ${formatSeconds(metrics.product.first_seen_seconds)}\n- 참고영상 CTA 시작: ${formatSeconds(metrics.cta.first_seen_seconds)}\n- 참고영상 사용/시연 비중: ${metrics.demonstration.combined_percent}%\n\n[주의]\n${warnings}`;
}

export function compileSingleVideoProductionGuide(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  productTruth: ProductTruthInput = EMPTY_PRODUCT_TRUTH
): SingleVideoProductionGuide {
  const adaptation = adaptReferenceProduction(analysis, productTruth);
  const referenceClaims = buildReferenceClaims(analysis);
  const partial = {
    direction_summary: buildDirectionSummary(analysis, metrics),
    production_steps: adaptation.steps,
    asset_groups: buildAssetGroups(adaptation.steps, productTruth),
    reference_claims: referenceClaims,
    excluded_reference_mechanisms: adaptation.exclusions,
    critical_warnings: buildCriticalWarnings(analysis, metrics, adaptation.exclusions, productTruth),
    product_truth: productTruth
  };
  const base = baseContext(analysis, metrics, partial);

  const prompts: Record<SingleVideoPromptKind, string> = {
    script: `${base}\n\n[작업: 대본]\n[추천 제작 흐름]에 남은 메커니즘만 사용해 내 상품용 세로형 상품 숏폼 대본을 새로 작성한다. 각 구간마다 시간, 화면, 행동, 내레이션/대사, 화면 자막, 장면 목적을 작성한다. 첫 3초와 CTA를 명확히 구분하고, 내 상품 정보에 없는 사실은 새로 만들지 않는다.`,
    shooting: `${base}\n\n[작업: 촬영]\n[추천 제작 흐름]에 남은 메커니즘만 사용해 내 상품으로 실제 촬영 가능한 쇼트 리스트를 작성한다. 각 쇼트마다 예상 길이, 피사체, 행동, 구도/카메라, 필요한 소품, 화면에서 반드시 확인되어야 할 내용을 적는다. 제외된 참고 메커니즘을 촬영 전제로 되살리지 않는다.`,
    assets: `${base}\n\n[작업: 소재 준비]\n[추천 제작 흐름]에 실제로 남은 장면만 기준으로 촬영과 편집 전에 준비할 소재 체크리스트를 만든다. 직접 촬영, 상품 실물, 상품 사진, 상품페이지, 공식 자료, 외부 자료, 그래픽/자막으로 구분하고 각 소재가 어느 장면에 필요한지 연결한다. 외부 자료는 저작권/출처 확인 여부도 표시한다.`,
    editing: `${base}\n\n[작업: 편집]\n[추천 제작 흐름]에 남은 장면만 사용해 편집자용 지시서를 작성한다. 시간순 컷 구성, 첫 3초 처리, 컷 전환 목적, 자막 밀도, 제품 노출 타이밍, 시연/결과 장면 유지 시간, CTA 처리를 포함한다. 제외된 참고 기능이나 비교 자료를 내 상품 성능처럼 되살리지 않는다.`
  };

  const rawPrompt = `${base}\n\n[요청]\n대본, 촬영 구성, 준비 소재, 편집 지시를 한 번에 작성한다. 반드시 Product Truth 적용 후 남은 제작 흐름만 사용하고, 제외된 참고 메커니즘은 결과물에 다시 넣지 않는다.`;

  return { ...partial, prompts, raw_prompt: rawPrompt };
}
