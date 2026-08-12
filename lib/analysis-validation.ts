import type { VideoAnalysis } from "@/lib/analysis-schema";

export function validateVideoAnalysis(analysis: VideoAnalysis): VideoAnalysis {
  const segments = analysis.observation_segments;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("분석 결과에 observation_segments가 없습니다.");
  }

  let previousStart = -1;

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

    previousStart = segment.start_seconds;

    if (!segment.visual.description.trim()) {
      throw new Error(`${prefix}.visual.description이 비어 있습니다.`);
    }

    if (segment.visual.material_types.length === 0) {
      throw new Error(`${prefix}.visual.material_types가 비어 있습니다.`);
    }

    if (!segment.action.type.trim()) {
      throw new Error(`${prefix}.action.type이 비어 있습니다.`);
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
  });

  return analysis;
}
