import type { VideoAnalysis } from "@/lib/analysis-schema";

export function validateVideoAnalysis(analysis: VideoAnalysis): VideoAnalysis {
  const segments = analysis.observation_segments;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("분석 결과에 observation_segments가 없습니다.");
  }

  let previousStart = -1;
  let previousEnd = -1;

  segments.forEach((segment, index) => {
    const prefix = `observation_segments[${index}]`;

    if (!Number.isFinite(segment.start_seconds) || !Number.isFinite(segment.end_seconds)) {
      throw new Error(`${prefix}의 시간이 유효하지 않습니다.`);
    }

    if (segment.start_seconds < 0 || segment.end_seconds <= segment.start_seconds) {
      throw new Error(`${prefix}의 시간 범위가 유효하지 않습니다.`);
    }

    if (segment.start_seconds < previousStart) {
      throw new Error(`${prefix}의 시작 시간이 앞 구간보다 이전입니다.`);
    }

    if (previousEnd >= 0 && segment.start_seconds < previousEnd - 0.01) {
      throw new Error(`${prefix}가 앞 관찰 구간과 겹칩니다.`);
    }

    previousStart = segment.start_seconds;
    previousEnd = segment.end_seconds;

    if (!segment.visual.description.trim()) {
      throw new Error(`${prefix}.visual.description이 비어 있습니다.`);
    }

    if (segment.visual.material_types.length === 0) {
      throw new Error(`${prefix}.visual.material_types가 비어 있습니다.`);
    }

    if (typeof segment.visual.contains_product !== "boolean") {
      throw new Error(`${prefix}.visual.contains_product가 boolean이 아닙니다.`);
    }

    if (segment.visual.contains_product !== (segment.visual.subject_role === "판매제품")) {
      throw new Error(
        `${prefix}의 contains_product와 subject_role이 충돌합니다. 판매제품일 때만 contains_product=true여야 합니다.`
      );
    }

    if (!segment.action.type.trim()) {
      throw new Error(`${prefix}.action.type이 비어 있습니다.`);
    }

    if (!segment.scene_purpose.trim()) {
      throw new Error(`${prefix}.scene_purpose가 비어 있습니다.`);
    }

    if (segment.evidence.types.length === 0) {
      throw new Error(`${prefix}.evidence.types가 비어 있습니다.`);
    }

    if (
      segment.evidence.result_visually_observable &&
      !segment.evidence.observable_result.trim()
    ) {
      throw new Error(
        `${prefix}는 result_visually_observable=true지만 observable_result가 비어 있습니다.`
      );
    }

    if (
      segment.evidence.supports_selling_product_claim &&
      !["판매제품직접", "외부자료"].includes(segment.evidence.scope)
    ) {
      throw new Error(
        `${prefix}는 판매제품 주장 근거로 표시됐지만 evidence.scope가 직접 제품/외부자료가 아닙니다.`
      );
    }

    if (
      ["비교/일반예시", "연출/보조", "주장만", "해당없음"].includes(segment.evidence.scope) &&
      segment.evidence.supports_selling_product_claim
    ) {
      throw new Error(
        `${prefix}의 보조/비교 장면을 판매제품 성능 근거로 승격할 수 없습니다.`
      );
    }
  });

  return analysis;
}