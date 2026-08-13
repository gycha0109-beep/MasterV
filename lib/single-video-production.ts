import type { ObservationSegment, VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";

export type SingleVideoPromptKind = "script" | "shooting" | "assets" | "editing";

export type ProductionStep = {
  title: string;
  detail: string;
};

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
  critical_warnings: string[];
  prompts: Record<SingleVideoPromptKind, string>;
  raw_prompt: string;
};

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, max = 92) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatSeconds(value: number | null) {
  if (value === null) return "확인 불가";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function stepTitle(segment: ObservationSegment) {
  const source = `${segment.scene_purpose} ${segment.action.type} ${segment.message_roles.join(" ")}`;

  if (segment.message_roles.includes("CTA") || /CTA|구매|클릭/.test(source)) return "CTA";
  if (/자외선|UV|UPF/.test(source)) return "UV 설명";
  if (/발수|방수/.test(source)) return "발수";
  if (/자동.?개폐|원터치|자동.*펼|자동.*접/.test(source)) return "자동 개폐";
  if (/내구|강풍|살대|유연성|탄성/.test(source)) return "내구성";
  if (/휴대|버클|고리|체결|수납/.test(source) && !/크기|면적|비교/.test(source)) return "휴대성";
  if (/크기|면적/.test(source) && (segment.message_roles.includes("비교") || /비교/.test(source))) return "크기 비교";
  if (segment.message_roles.includes("문제제기")) return "문제 제시";
  if (segment.message_roles.includes("비교")) return "비교";
  if (segment.message_roles.includes("제품소개")) return "제품 소개";
  if (segment.message_roles.includes("사용시연") || segment.evidence.types.includes("직접시연")) return "기능 시연";
  if (segment.message_roles.includes("결과제시")) return "결과";
  if (segment.message_roles.includes("가격/혜택")) return "가격·혜택";

  return shorten(segment.action.type || segment.scene_purpose || segment.message_roles[0] || "장면", 18);
}

function stepDetail(segment: ObservationSegment) {
  const description = clean(segment.visual.description);
  const action = clean(segment.action.description);
  if (description && action && !description.includes(action)) return shorten(`${description} · ${action}`);
  return shorten(description || action || segment.scene_purpose);
}

function buildProductionSteps(analysis: VideoAnalysis) {
  const allSteps: ProductionStep[] = [];

  for (const segment of analysis.observation_segments) {
    const next = { title: stepTitle(segment), detail: stepDetail(segment) };
    const previous = allSteps.at(-1);
    if (previous && previous.title === next.title && previous.detail === next.detail) continue;
    allSteps.push(next);
  }

  if (allSteps.length === 0) {
    return [{ title: "전체 구성", detail: analysis.structure_label }];
  }

  const compact = allSteps.slice(0, 8);
  const finalCta = [...allSteps].reverse().find((step) => step.title === "CTA");
  if (finalCta && !compact.some((step) => step.title === "CTA" && step.detail === finalCta.detail)) {
    compact.push(finalCta);
  }

  return compact;
}

function buildDirectionSummary(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const direct = metrics.materials.find((item) => item.name === "직접촬영")?.percent ?? 0;
  const demos = metrics.demonstration.combined_percent;
  const firstRoles = metrics.first_three_seconds.message_roles.map((item) => item.name);

  if (demos >= 45 && direct >= 50) {
    return firstRoles.includes("문제제기")
      ? "문제를 먼저 보여준 뒤, 제품 기능을 직접 하나씩 시연하는 구조입니다."
      : "설명보다 제품 기능을 직접 하나씩 보여주는 구조입니다.";
  }
  if (demos >= 20) return "제품 설명 사이에 실제 사용·기능 시연을 반복해서 넣는 구조입니다.";
  if (direct < 30) return "직접 시연보다 상품·자료 화면을 조합해 설명하는 구조입니다.";
  return shorten(analysis.summary, 100);
}

function sellingProductShootItems(analysis: VideoAnalysis) {
  return unique(
    analysis.observation_segments
      .filter((segment) =>
        segment.visual.subject_role === "판매제품" &&
        (segment.evidence.scope === "판매제품직접" ||
          segment.evidence.types.includes("직접사용") ||
          segment.evidence.types.includes("직접시연"))
      )
      .map((segment) => shorten(segment.action.description || segment.scene_purpose, 70))
      .filter(Boolean)
  ).slice(0, 6);
}

function supportMaterialItems(analysis: VideoAnalysis) {
  return unique(
    analysis.observation_segments
      .filter((segment) =>
        segment.visual.subject_role === "비교제품" ||
        segment.visual.subject_role === "일반예시" ||
        segment.visual.subject_role === "외부자료대상" ||
        segment.evidence.scope === "연출/보조" ||
        segment.visual.material_types.some((material) =>
          ["외부자료", "공식홍보자료", "상품사진", "상품페이지", "그래픽/표"].includes(material)
        )
      )
      .map((segment) => shorten(segment.visual.description || segment.scene_purpose, 70))
      .filter(Boolean)
  ).slice(0, 5);
}

function buildReferenceClaims(analysis: VideoAnalysis) {
  return unique(
    analysis.observation_segments
      .flatMap((segment) => segment.claims)
      .map(clean)
      .filter(Boolean)
  ).slice(0, 8);
}

function buildAssetGroups(analysis: VideoAnalysis): AssetGroup[] {
  const hasSellingProduct = analysis.observation_segments.some((segment) => segment.visual.subject_role === "판매제품");
  const shoots = sellingProductShootItems(analysis);
  const support = supportMaterialItems(analysis);

  return [
    {
      title: "제품 실물",
      icon: "📦",
      items: hasSellingProduct ? ["판매할 상품 실물"] : ["판매할 상품 또는 상품 이미지"]
    },
    {
      title: "직접 촬영",
      icon: "🎥",
      items: shoots.length > 0 ? shoots : ["제품 제시·사용 장면 촬영"]
    },
    {
      title: "비교·보조 자료",
      icon: "🖼",
      items: support.length > 0 ? support : ["필요한 경우에만 준비"]
    },
    {
      title: "상품 정보",
      icon: "📝",
      items: ["실제 판매 상품의 제품명·가격·핵심 특징·성능 근거를 별도 입력·확인"]
    }
  ];
}

function buildCriticalWarnings(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const warnings: string[] = [];

  if (metrics.claims_and_evidence.claim_segments_with_no_evidence > 0) {
    warnings.push(`화면만으로 확인되지 않는 주장 ${metrics.claims_and_evidence.claim_segments_with_no_evidence}개 구간은 별도 확인이 필요합니다.`);
  }

  if (analysis.observation_segments.some((segment) =>
    segment.visual.subject_role === "비교제품" ||
    segment.visual.subject_role === "일반예시" ||
    segment.evidence.scope === "비교/일반예시"
  )) {
    warnings.push("비교 제품·일반 사례 화면은 판매 제품의 성능 증거가 아닙니다.");
  }

  if (analysis.observation_segments.some((segment) =>
    segment.evidence.scope === "연출/보조" || segment.evidence.types.includes("상황재연")
  )) {
    warnings.push("풍경 B-roll·상황 재연은 설명용이며 실제 효능·성능을 입증하지 않습니다.");
  }

  return unique(warnings);
}

function systemGuardrails() {
  return [
    "참고영상의 문장, 자막, 장면을 그대로 복사하지 않고 제작 구조만 참고한다.",
    "참고영상의 주장·스펙·가격·후기는 내 상품 정보로 간주하지 않는다.",
    "비교 제품·일반 사례·연출 B-roll을 판매 제품의 성능 증거로 재작성하지 않는다.",
    "확인되지 않은 효능, 수치, 후기, 인증, 가격, 할인 정보를 만들어내지 않는다.",
    "광고 문구의 주장과 화면에서 실제 확인 가능한 결과를 구분한다."
  ];
}

function baseContext(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  guide: Pick<SingleVideoProductionGuide, "direction_summary" | "production_steps" | "asset_groups" | "reference_claims" | "critical_warnings">
) {
  const structure = guide.production_steps.map((step, index) => `${index + 1}. ${step.title} — ${step.detail}`).join("\n");
  const assets = guide.asset_groups.flatMap((group) => group.items.map((item) => `- ${group.title}: ${item}`)).join("\n");
  const referenceClaims = guide.reference_claims.length > 0
    ? guide.reference_claims.map((claim) => `- ${claim} [참고영상 주장 / 내 상품 적용 전 확인 필요]`).join("\n")
    : "- 없음";
  const warnings = [...guide.critical_warnings, ...systemGuardrails()].map((warning) => `- ${warning}`).join("\n");

  return `당신은 상품 숏폼 제작자다. 아래 참고영상에서 관찰된 제작 구조를 참고해 새로운 결과물을 만든다.\n\n[제작 방향]\n${guide.direction_summary}\n\n[추천 제작 흐름]\n${structure}\n\n[준비 소재]\n${assets}\n\n[내 상품 정보]\n- 아직 입력되지 않음. 참고영상의 주장이나 스펙을 내 상품 사실로 사용하지 않는다.\n\n[참고영상 주장 — 상품 사실 아님]\n${referenceClaims}\n\n[관찰 지표]\n- 길이: ${formatSeconds(analysis.duration_seconds ?? metrics.basis_duration_seconds)}\n- 상품 첫 등장: ${formatSeconds(metrics.product.first_seen_seconds)}\n- CTA 시작: ${formatSeconds(metrics.cta.first_seen_seconds)}\n- 사용/시연 비중: ${metrics.demonstration.combined_percent}%\n\n[주의]\n${warnings}`;
}

export function compileSingleVideoProductionGuide(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics
): SingleVideoProductionGuide {
  const partial = {
    direction_summary: buildDirectionSummary(analysis, metrics),
    production_steps: buildProductionSteps(analysis),
    asset_groups: buildAssetGroups(analysis),
    reference_claims: buildReferenceClaims(analysis),
    critical_warnings: buildCriticalWarnings(analysis, metrics)
  };
  const base = baseContext(analysis, metrics, partial);

  const prompts: Record<SingleVideoPromptKind, string> = {
    script: `${base}\n\n[작업: 대본]\n이 제작 구조를 참고해 새로운 세로형 상품 숏폼 대본을 작성한다. 각 구간마다 시간, 화면, 행동, 내레이션/대사, 화면 자막, 장면 목적을 작성한다. 첫 3초와 CTA를 명확히 구분하고, 내 상품 정보가 없는 사실은 [확인 필요]로 표시한다.`,
    shooting: `${base}\n\n[작업: 촬영]\n실제로 촬영 가능한 쇼트 리스트를 작성한다. 각 쇼트마다 예상 길이, 피사체, 행동, 구도/카메라, 필요한 소품, 화면에서 반드시 확인되어야 할 내용을 적는다. 비교 사례·연출 B-roll과 판매제품 직접 시연을 명확히 구분한다. 내 상품의 사실로 확인되지 않은 참고영상 주장을 촬영 전제로 사용하지 않는다.`,
    assets: `${base}\n\n[작업: 소재 준비]\n촬영과 편집 전에 준비할 소재 체크리스트를 만든다. 직접 촬영, 상품 실물, 상품 사진, 상품페이지, 공식 자료, 외부 자료, 그래픽/자막으로 구분하고 각 소재가 어느 장면에 필요한지 연결한다. 외부 자료는 저작권/출처 확인 여부도 표시한다. 참고영상의 주장은 별도 '확인 필요 정보'로 분리한다.`,
    editing: `${base}\n\n[작업: 편집]\n편집자용 지시서를 작성한다. 시간순 컷 구성, 첫 3초 처리, 컷 전환 목적, 자막 밀도, 제품 노출 타이밍, 시연/결과 장면 유지 시간, CTA 처리, 과장 표현 금지 항목을 포함한다. 비교·일반 사례나 B-roll을 판매제품 성능 입증처럼 편집하지 않는다. 내 상품 사실로 확인되지 않은 참고영상 주장을 자막·내레이션으로 단정하지 않는다.`
  };

  const rawPrompt = `${base}\n\n[요청]\n대본, 촬영 구성, 준비 소재, 편집 지시를 한 번에 작성한다. 서로 다른 섹션으로 분리하고 실제 제작자가 바로 실행할 수 있는 수준으로 구체화한다.`;

  return { ...partial, prompts, raw_prompt: rawPrompt };
}
