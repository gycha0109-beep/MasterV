import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";

export type SingleVideoPromptKind = "script" | "shooting" | "assets" | "editing";

export type SingleVideoProductionGuide = {
  structure_steps: string[];
  shooting_scenes: string[];
  asset_checklist: string[];
  warnings: string[];
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

function materialLabel(material: string) {
  const labels: Record<string, string> = {
    직접촬영: "직접 촬영 영상",
    상품실물: "상품 실물",
    상품사진: "상품 사진/렌더",
    상품페이지: "상품 상세페이지 캡처",
    공식홍보자료: "공식 홍보 자료",
    외부자료: "외부 자료영상",
    "그래픽/표": "그래픽/비교표",
    화면녹화: "화면 녹화",
    상황재연: "상황 재연 장면",
    불명확: "출처 확인이 필요한 화면 소재"
  };
  return labels[material] ?? material;
}

function segmentLabel(analysis: VideoAnalysis, index: number) {
  const segment = analysis.observation_segments[index];
  return clean(segment.scene_purpose || segment.message_roles[0] || segment.action.type);
}

function buildStructureSteps(analysis: VideoAnalysis) {
  const steps = analysis.observation_segments.map((_, index) => segmentLabel(analysis, index)).filter(Boolean);
  return unique(steps).slice(0, 8);
}

function buildShootingScenes(analysis: VideoAnalysis) {
  const preferred = analysis.observation_segments.filter((segment) =>
    segment.visual.subject_role === "판매제품" ||
    segment.evidence.scope === "판매제품직접" ||
    segment.evidence.types.includes("직접사용") ||
    segment.evidence.types.includes("직접시연")
  );
  const basis = preferred.length > 0 ? preferred : analysis.observation_segments;

  return unique(
    basis.map((segment) => {
      const purpose = clean(segment.scene_purpose || segment.message_roles[0] || segment.action.type);
      const description = clean(segment.visual.description);
      return purpose && description ? `${purpose} — ${description}` : purpose || description;
    }).filter(Boolean)
  ).slice(0, 7);
}

function buildAssetChecklist(analysis: VideoAnalysis) {
  const materials = unique(analysis.observation_segments.flatMap((segment) => segment.visual.material_types));
  const assets = materials.map(materialLabel);

  if (analysis.observation_segments.some((segment) => segment.visual.subject_role === "판매제품")) {
    assets.unshift("판매할 상품 실물");
  }
  if (analysis.observation_segments.some((segment) => segment.visual.presenter_presence.includes("손"))) {
    assets.push("손을 활용한 제품 사용/시연 촬영 환경");
  }
  if (analysis.observation_segments.some((segment) => segment.visual.presenter_presence.includes("얼굴"))) {
    assets.push("출연자 얼굴 촬영 환경");
  }

  return unique(assets).slice(0, 8);
}

function buildWarnings(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const warnings: string[] = [
    "참고영상의 문장, 자막, 장면을 그대로 복사하지 말고 제작 구조만 참고합니다."
  ];

  if (metrics.claims_and_evidence.claim_segments_with_no_evidence > 0) {
    warnings.push(`화면 근거가 부족한 주장 ${metrics.claims_and_evidence.claim_segments_with_no_evidence}개 구간은 사실처럼 재작성하지 않습니다.`);
  }

  if (analysis.observation_segments.some((segment) =>
    segment.visual.subject_role === "비교제품" ||
    segment.visual.subject_role === "일반예시" ||
    segment.evidence.scope === "비교/일반예시"
  )) {
    warnings.push("비교 제품이나 일반 사례 화면을 판매 제품의 성능 증거로 사용하지 않습니다.");
  }

  if (analysis.observation_segments.some((segment) =>
    segment.evidence.scope === "연출/보조" || segment.evidence.types.includes("상황재연")
  )) {
    warnings.push("풍경 B-roll이나 상황 재연은 설명용 연출로만 사용하고 실제 효능·성능 증거로 표현하지 않습니다.");
  }

  warnings.push("확인되지 않은 효능, 수치, 후기, 인증, 가격, 할인 정보는 새로 만들어내지 않습니다.");
  return unique(warnings).slice(0, 5);
}

function baseContext(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics,
  guide: Pick<SingleVideoProductionGuide, "structure_steps" | "shooting_scenes" | "asset_checklist" | "warnings">
) {
  const structure = guide.structure_steps.length > 0
    ? guide.structure_steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : `1. ${analysis.structure_label}`;
  const scenes = guide.shooting_scenes.map((scene, index) => `${index + 1}. ${scene}`).join("\n") || "- 확인 필요";
  const assets = guide.asset_checklist.map((asset) => `- ${asset}`).join("\n") || "- 확인 필요";
  const warnings = guide.warnings.map((warning) => `- ${warning}`).join("\n");

  return `당신은 상품 숏폼 제작자다. 아래 참고영상에서 관찰된 제작 구조를 참고해 새로운 결과물을 만든다. 특정 문장·자막·장면을 그대로 복제하지 않는다.\n\n[참고영상 요약]\n${analysis.summary}\n\n[기본 구조]\n${structure}\n\n[실제 촬영에서 참고할 장면]\n${scenes}\n\n[준비 소재]\n${assets}\n\n[관찰 지표]\n- 길이: ${formatSeconds(analysis.duration_seconds ?? metrics.basis_duration_seconds)}\n- 상품 첫 등장: ${formatSeconds(metrics.product.first_seen_seconds)}\n- CTA 시작: ${formatSeconds(metrics.cta.first_seen_seconds)}\n- 사용/시연 비중: ${metrics.demonstration.combined_percent}%\n\n[주의]\n${warnings}`;
}

export function compileSingleVideoProductionGuide(
  analysis: VideoAnalysis,
  metrics: DerivedVideoMetrics
): SingleVideoProductionGuide {
  const partial = {
    structure_steps: buildStructureSteps(analysis),
    shooting_scenes: buildShootingScenes(analysis),
    asset_checklist: buildAssetChecklist(analysis),
    warnings: buildWarnings(analysis, metrics)
  };
  const base = baseContext(analysis, metrics, partial);

  const prompts: Record<SingleVideoPromptKind, string> = {
    script: `${base}\n\n[작업: 대본]\n이 제작 구조를 참고해 새로운 세로형 상품 숏폼 대본을 작성한다. 각 구간마다 시간, 화면, 행동, 내레이션/대사, 화면 자막, 장면 목적을 작성한다. 첫 3초와 CTA를 명확히 구분하고, 확인되지 않은 제품 사실은 [확인 필요]로 표시한다.`,
    shooting: `${base}\n\n[작업: 촬영]\n실제로 촬영 가능한 쇼트 리스트를 작성한다. 각 쇼트마다 예상 길이, 피사체, 행동, 구도/카메라, 필요한 소품, 화면에서 반드시 확인되어야 할 내용을 적는다. 비교 사례·연출 B-roll과 판매제품 직접 시연을 명확히 구분한다.`,
    assets: `${base}\n\n[작업: 소재 준비]\n촬영과 편집 전에 준비할 소재 체크리스트를 만든다. 직접 촬영, 상품 실물, 상품 사진, 상품페이지, 공식 자료, 외부 자료, 그래픽/자막으로 구분하고 각 소재가 어느 장면에 필요한지 연결한다. 외부 자료는 저작권/출처 확인 여부도 표시한다.`,
    editing: `${base}\n\n[작업: 편집]\n편집자용 지시서를 작성한다. 시간순 컷 구성, 첫 3초 처리, 컷 전환 목적, 자막 밀도, 제품 노출 타이밍, 시연/결과 장면 유지 시간, CTA 처리, 과장 표현 금지 항목을 포함한다. 비교·일반 사례나 B-roll을 판매제품 성능 입증처럼 편집하지 않는다.`
  };

  const rawPrompt = `${base}\n\n[요청]\n대본, 촬영 구성, 준비 소재, 편집 지시를 한 번에 작성한다. 서로 다른 섹션으로 분리하고 실제 제작자가 바로 실행할 수 있는 수준으로 구체화한다.`;

  return { ...partial, prompts, raw_prompt: rawPrompt };
}
