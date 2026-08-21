import type {
  EvidenceType,
  ObservationMaterialType,
  ObservationSegment,
  VideoAnalysis
} from "@/lib/analysis-schema";

export type CoverageMetric = {
  name: string;
  seconds: number;
  percent: number;
  segment_count: number;
};

export type DerivedVideoMetrics = {
  basis_duration_seconds: number;
  analyzed_coverage_seconds: number;
  analyzed_coverage_percent: number;
  product: {
    first_seen_seconds: number | null;
    visible_seconds: number;
    visible_percent: number;
    segment_count: number;
  };
  first_three_seconds: {
    window_seconds: number;
    product_visible: boolean;
    product_first_seen_seconds: number | null;
    materials: CoverageMetric[];
    presenters: CoverageMetric[];
    message_roles: CoverageMetric[];
    actions: string[];
  };
  materials: CoverageMetric[];
  presenters: CoverageMetric[];
  message_roles: CoverageMetric[];
  demonstration: {
    combined_segment_count: number;
    combined_seconds: number;
    combined_percent: number;
    direct_use_segment_count: number;
    direct_use_seconds: number;
    direct_demo_segment_count: number;
    direct_demo_seconds: number;
    visually_observable_result_segment_count: number;
    visually_observable_result_seconds: number;
    contextual_or_comparison_result_segment_count: number;
    contextual_or_comparison_result_seconds: number;
  };
  claims_and_evidence: {
    claim_count: number;
    claim_segment_count: number;
    claim_segments_with_no_evidence: number;
    claim_segments_with_visually_observable_result: number;
    evidence_types: CoverageMetric[];
    evidence_scopes: CoverageMetric[];
  };
  cta: {
    first_seen_seconds: number | null;
    segment_count: number;
    seconds: number;
    percent: number;
  };
  timeline_signature: Array<{
    start_seconds: number;
    end_seconds: number;
    action: string;
    message_roles: string[];
  }>;
};

const roundSeconds = (value: number) => Math.round(value * 100) / 100;
const roundPercent = (value: number) => Math.round(value * 10) / 10;

function overlapSeconds(
  segment: ObservationSegment,
  windowStart: number,
  windowEnd: number
): number {
  const start = Math.max(segment.start_seconds, windowStart);
  const end = Math.min(segment.end_seconds, windowEnd);
  return Math.max(0, end - start);
}

function percent(seconds: number, basis: number): number {
  return basis > 0 ? roundPercent((seconds / basis) * 100) : 0;
}

function coverageBy(
  segments: ObservationSegment[],
  labelsFor: (segment: ObservationSegment) => string[],
  basis: number,
  windowStart = 0,
  windowEnd = basis
): CoverageMetric[] {
  const map = new Map<string, { seconds: number; segments: Set<number> }>();

  segments.forEach((segment, index) => {
    const duration = overlapSeconds(segment, windowStart, windowEnd);
    if (duration <= 0) return;

    for (const label of new Set(labelsFor(segment).filter(Boolean))) {
      const current = map.get(label) ?? { seconds: 0, segments: new Set<number>() };
      current.seconds += duration;
      current.segments.add(index);
      map.set(label, current);
    }
  });

  const windowBasis = Math.max(0, windowEnd - windowStart);

  return [...map.entries()]
    .map(([name, value]) => ({
      name,
      seconds: roundSeconds(value.seconds),
      percent: percent(value.seconds, windowBasis),
      segment_count: value.segments.size
    }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, "ko"));
}

function firstSegmentStart(
  segments: ObservationSegment[],
  predicate: (segment: ObservationSegment) => boolean
): number | null {
  const match = segments.find(predicate);
  return match ? roundSeconds(match.start_seconds) : null;
}

function sumMatchingSeconds(
  segments: ObservationSegment[],
  predicate: (segment: ObservationSegment) => boolean,
  basis: number
): number {
  return roundSeconds(
    segments.reduce((sum, segment) => {
      if (!predicate(segment)) return sum;
      return sum + overlapSeconds(segment, 0, basis);
    }, 0)
  );
}

function hasEvidence(segment: ObservationSegment, type: EvidenceType) {
  return segment.evidence.types.includes(type);
}

function isCtaRole(role: string) {
  return /cta|행동\s*유도|구매\s*유도|링크\s*유도|댓글\s*유도/i.test(role);
}

export function deriveVideoMetrics(analysis: VideoAnalysis): DerivedVideoMetrics {
  const segments = analysis.observation_segments;
  const maxEnd = Math.max(...segments.map((segment) => segment.end_seconds), 0);
  const basis = roundSeconds(Math.max(analysis.duration_seconds ?? 0, maxEnd));
  const analyzedCoverage = roundSeconds(
    segments.reduce((sum, segment) => sum + overlapSeconds(segment, 0, basis), 0)
  );

  const productSegments = segments.filter((segment) => segment.visual.contains_product);
  const productSeconds = sumMatchingSeconds(
    segments,
    (segment) => segment.visual.contains_product,
    basis
  );

  const directUsePredicate = (segment: ObservationSegment) => hasEvidence(segment, "직접사용");
  const directDemoPredicate = (segment: ObservationSegment) => hasEvidence(segment, "직접시연");
  const combinedDemoPredicate = (segment: ObservationSegment) =>
    directUsePredicate(segment) || directDemoPredicate(segment);
  const anyVisualResultPredicate = (segment: ObservationSegment) =>
    segment.evidence.result_visually_observable || hasEvidence(segment, "관찰가능한결과");
  const productVisualResultPredicate = (segment: ObservationSegment) =>
    anyVisualResultPredicate(segment) && segment.evidence.supports_selling_product_claim;
  const contextualVisualResultPredicate = (segment: ObservationSegment) =>
    anyVisualResultPredicate(segment) && !segment.evidence.supports_selling_product_claim;

  const directUseSeconds = sumMatchingSeconds(segments, directUsePredicate, basis);
  const directDemoSeconds = sumMatchingSeconds(segments, directDemoPredicate, basis);
  const combinedDemoSeconds = sumMatchingSeconds(segments, combinedDemoPredicate, basis);
  const productVisualResultSeconds = sumMatchingSeconds(segments, productVisualResultPredicate, basis);
  const contextualVisualResultSeconds = sumMatchingSeconds(segments, contextualVisualResultPredicate, basis);

  const claimSegments = segments.filter((segment) => segment.claims.length > 0);
  const claimSegmentsWithNoEvidence = claimSegments.filter((segment) => {
    const substantiveEvidence = segment.evidence.types.filter((type) => type !== "근거없음");
    return substantiveEvidence.length === 0;
  });
  const claimSegmentsWithVisibleResult = claimSegments.filter(productVisualResultPredicate);

  const ctaPredicate = (segment: ObservationSegment) => segment.message_roles.some(isCtaRole);
  const ctaSeconds = sumMatchingSeconds(segments, ctaPredicate, basis);

  const firstThreeEnd = Math.min(3, basis);
  const firstThreeSegments = segments.filter(
    (segment) => overlapSeconds(segment, 0, firstThreeEnd) > 0
  );
  const firstThreeProductStart = firstSegmentStart(
    firstThreeSegments,
    (segment) => segment.visual.contains_product
  );

  return {
    basis_duration_seconds: basis,
    analyzed_coverage_seconds: analyzedCoverage,
    analyzed_coverage_percent: percent(analyzedCoverage, basis),
    product: {
      first_seen_seconds: firstSegmentStart(
        segments,
        (segment) => segment.visual.contains_product
      ),
      visible_seconds: productSeconds,
      visible_percent: percent(productSeconds, basis),
      segment_count: productSegments.length
    },
    first_three_seconds: {
      window_seconds: firstThreeEnd,
      product_visible: firstThreeSegments.some((segment) => segment.visual.contains_product),
      product_first_seen_seconds: firstThreeProductStart,
      materials: coverageBy(
        segments,
        (segment) => segment.visual.material_types,
        basis,
        0,
        firstThreeEnd
      ),
      presenters: coverageBy(
        segments,
        (segment) => segment.visual.presenter_presence,
        basis,
        0,
        firstThreeEnd
      ),
      message_roles: coverageBy(
        segments,
        (segment) => segment.message_roles,
        basis,
        0,
        firstThreeEnd
      ),
      actions: [...new Set(firstThreeSegments.map((segment) => segment.action.type).filter(Boolean))]
    },
    materials: coverageBy(
      segments,
      (segment) => segment.visual.material_types as ObservationMaterialType[],
      basis
    ),
    presenters: coverageBy(segments, (segment) => segment.visual.presenter_presence, basis),
    message_roles: coverageBy(segments, (segment) => segment.message_roles, basis),
    demonstration: {
      combined_segment_count: segments.filter(combinedDemoPredicate).length,
      combined_seconds: combinedDemoSeconds,
      combined_percent: percent(combinedDemoSeconds, basis),
      direct_use_segment_count: segments.filter(directUsePredicate).length,
      direct_use_seconds: directUseSeconds,
      direct_demo_segment_count: segments.filter(directDemoPredicate).length,
      direct_demo_seconds: directDemoSeconds,
      visually_observable_result_segment_count: segments.filter(productVisualResultPredicate).length,
      visually_observable_result_seconds: productVisualResultSeconds,
      contextual_or_comparison_result_segment_count: segments.filter(contextualVisualResultPredicate).length,
      contextual_or_comparison_result_seconds: contextualVisualResultSeconds
    },
    claims_and_evidence: {
      claim_count: claimSegments.reduce((sum, segment) => sum + segment.claims.length, 0),
      claim_segment_count: claimSegments.length,
      claim_segments_with_no_evidence: claimSegmentsWithNoEvidence.length,
      claim_segments_with_visually_observable_result: claimSegmentsWithVisibleResult.length,
      evidence_types: coverageBy(
        segments,
        (segment) => segment.evidence.types,
        basis
      ),
      evidence_scopes: coverageBy(
        segments,
        (segment) => [segment.evidence.scope],
        basis
      )
    },
    cta: {
      first_seen_seconds: firstSegmentStart(segments, ctaPredicate),
      segment_count: segments.filter(ctaPredicate).length,
      seconds: ctaSeconds,
      percent: percent(ctaSeconds, basis)
    },
    timeline_signature: segments.map((segment) => ({
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      action: segment.action.type,
      message_roles: segment.message_roles
    }))
  };
}