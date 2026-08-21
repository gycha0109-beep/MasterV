import type { ObservationSegment, VideoAnalysis } from "@/lib/analysis-schema";
import { deriveVideoMetrics, type CoverageMetric, type DerivedVideoMetrics } from "@/lib/derived-metrics";

export type ReferenceComparisonInput = {
  id: string;
  label?: string;
  url?: string;
  analysis: VideoAnalysis;
};

export type CrossVideoCoverageMetric = {
  name: string;
  video_count: number;
  video_percent: number;
  avg_coverage_percent: number;
  median_coverage_percent: number;
  avg_seconds: number;
};

export type CommonPattern = {
  sequence: string[];
  support_count: number;
  support_percent: number;
};

export type ReferenceComparisonResult = {
  sample_size: number;
  videos: Array<{
    id: string;
    label: string;
    url?: string;
    duration_seconds: number;
    structure_label: string;
    product_first_seen_seconds: number | null;
    product_visible_percent: number;
    demonstration_percent: number;
    cta_first_seen_seconds: number | null;
  }>;
  first_three_seconds: {
    product_visible_count: number;
    product_visible_percent: number;
    materials: CrossVideoCoverageMetric[];
    presenters: CrossVideoCoverageMetric[];
    message_roles: CrossVideoCoverageMetric[];
    actions: Array<{ name: string; video_count: number; video_percent: number }>;
  };
  product: {
    known_first_seen_count: number;
    avg_first_seen_seconds: number | null;
    median_first_seen_seconds: number | null;
    within_three_seconds_count: number;
    within_three_seconds_percent: number;
    avg_visible_percent: number;
    median_visible_percent: number;
  };
  materials: CrossVideoCoverageMetric[];
  presenters: CrossVideoCoverageMetric[];
  message_roles: CrossVideoCoverageMetric[];
  demonstration: {
    videos_with_use_or_demo_count: number;
    videos_with_use_or_demo_percent: number;
    avg_combined_percent: number;
    median_combined_percent: number;
    videos_with_visually_observable_result_count: number;
    videos_with_visually_observable_result_percent: number;
  };
  claims_and_evidence: {
    videos_with_claims_count: number;
    videos_with_claims_percent: number;
    avg_claim_count: number;
    videos_with_unsupported_claim_segments_count: number;
    videos_with_unsupported_claim_segments_percent: number;
    evidence_types: CrossVideoCoverageMetric[];
  };
  cta: {
    present_count: number;
    present_percent: number;
    avg_first_seen_seconds: number | null;
    median_first_seen_seconds: number | null;
  };
  common_patterns: CommonPattern[];
};

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percent(count: number, total: number) {
  return total > 0 ? round((count / total) * 100) : 0;
}

function metricMap(items: CoverageMetric[]) {
  return new Map(items.map((item) => [item.name, item]));
}

function aggregateCoverage(
  metrics: DerivedVideoMetrics[],
  select: (metric: DerivedVideoMetrics) => CoverageMetric[]
): CrossVideoCoverageMetric[] {
  const names = new Set<string>();
  const perVideo = metrics.map((metric) => {
    const map = metricMap(select(metric));
    for (const name of map.keys()) names.add(name);
    return map;
  });

  return [...names]
    .map((name) => {
      const present = perVideo
        .map((map) => map.get(name))
        .filter((item): item is CoverageMetric => Boolean(item));
      const percents = present.map((item) => item.percent);
      const seconds = present.map((item) => item.seconds);

      return {
        name,
        video_count: present.length,
        video_percent: percent(present.length, metrics.length),
        avg_coverage_percent: round(average(percents)),
        median_coverage_percent: round(median(percents) ?? 0),
        avg_seconds: round(average(seconds), 2)
      };
    })
    .sort(
      (a, b) =>
        b.video_count - a.video_count ||
        b.avg_coverage_percent - a.avg_coverage_percent ||
        a.name.localeCompare(b.name, "ko")
    );
}

function aggregatePresence(
  values: string[][],
  total: number
): Array<{ name: string; video_count: number; video_percent: number }> {
  const count = new Map<string, number>();
  values.forEach((items) => {
    for (const item of new Set(items.filter(Boolean))) {
      count.set(item, (count.get(item) ?? 0) + 1);
    }
  });

  return [...count.entries()]
    .map(([name, video_count]) => ({
      name,
      video_count,
      video_percent: percent(video_count, total)
    }))
    .sort((a, b) => b.video_count - a.video_count || a.name.localeCompare(b.name, "ko"));
}

function canonicalRole(role: string): string {
  const value = role.trim();
  if (/cta|행동\s*유도|구매\s*유도|링크\s*유도|댓글\s*유도/i.test(value)) return "CTA";
  if (/훅|hook/i.test(value)) return "훅";
  if (/문제/.test(value)) return "문제제기";
  if (/사용\s*시연|시연/.test(value)) return "사용시연";
  if (/결과/.test(value)) return "결과제시";
  if (/제품\s*소개|상품\s*소개/.test(value)) return "제품소개";
  if (/기능\s*설명|장점|특징/.test(value)) return "기능설명";
  if (/비교/.test(value)) return "비교";
  if (/큐레이팅|추천/.test(value)) return "큐레이팅";
  if (/후기|경험/.test(value)) return "후기";
  if (/가격|혜택|할인/.test(value)) return "가격/혜택";
  return value || "기타";
}

const ROLE_PRIORITY = [
  "훅",
  "문제제기",
  "제품소개",
  "사용시연",
  "기능설명",
  "결과제시",
  "비교",
  "큐레이팅",
  "후기",
  "가격/혜택",
  "CTA"
];

function primaryRole(segment: ObservationSegment): string {
  const roles = [...new Set(segment.message_roles.map(canonicalRole))];
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? canonicalRole(segment.action.type) ?? "기타";
}

function roleSequence(analysis: VideoAnalysis): string[] {
  const raw = analysis.observation_segments.map(primaryRole).filter(Boolean);
  const collapsed: string[] = [];
  for (const role of raw) {
    if (collapsed.at(-1) !== role) collapsed.push(role);
  }
  return collapsed;
}

function commonPatterns(inputs: ReferenceComparisonInput[]): CommonPattern[] {
  const support = new Map<string, { sequence: string[]; videos: Set<string> }>();

  for (const input of inputs) {
    const sequence = roleSequence(input.analysis);
    for (const size of [2, 3]) {
      for (let index = 0; index <= sequence.length - size; index += 1) {
        const slice = sequence.slice(index, index + size);
        const key = slice.join(" → ");
        const current = support.get(key) ?? { sequence: slice, videos: new Set<string>() };
        current.videos.add(input.id);
        support.set(key, current);
      }
    }
  }

  return [...support.values()]
    .filter((item) => item.videos.size >= 2)
    .map((item) => ({
      sequence: item.sequence,
      support_count: item.videos.size,
      support_percent: percent(item.videos.size, inputs.length)
    }))
    .sort(
      (a, b) =>
        b.support_count - a.support_count ||
        b.sequence.length - a.sequence.length ||
        a.sequence.join("→").localeCompare(b.sequence.join("→"), "ko")
    )
    .slice(0, 12);
}

export function compareVideoAnalyses(
  inputs: ReferenceComparisonInput[]
): ReferenceComparisonResult {
  if (inputs.length < 2) {
    throw new Error("비교 분석에는 최소 2개의 참고영상이 필요합니다.");
  }

  const ids = new Set<string>();
  for (const input of inputs) {
    if (!input.id.trim()) throw new Error("참고영상 id가 비어 있습니다.");
    if (ids.has(input.id)) throw new Error(`중복 참고영상 id: ${input.id}`);
    ids.add(input.id);
  }

  const derived = inputs.map((input) => deriveVideoMetrics(input.analysis));
  const total = inputs.length;

  const knownFirstSeen = derived
    .map((metric) => metric.product.first_seen_seconds)
    .filter((value): value is number => value !== null);
  const ctaFirstSeen = derived
    .map((metric) => metric.cta.first_seen_seconds)
    .filter((value): value is number => value !== null);
  const withinThree = knownFirstSeen.filter((value) => value <= 3).length;
  const productVisiblePercents = derived.map((metric) => metric.product.visible_percent);
  const demonstrationPercents = derived.map((metric) => metric.demonstration.combined_percent);

  const videosWithDemo = derived.filter(
    (metric) => metric.demonstration.combined_segment_count > 0
  ).length;
  const videosWithVisibleResult = derived.filter(
    (metric) => metric.demonstration.visually_observable_result_segment_count > 0
  ).length;
  const videosWithClaims = derived.filter(
    (metric) => metric.claims_and_evidence.claim_count > 0
  ).length;
  const videosWithUnsupportedClaimSegments = derived.filter(
    (metric) => metric.claims_and_evidence.claim_segments_with_no_evidence > 0
  ).length;
  const ctaPresent = derived.filter((metric) => metric.cta.first_seen_seconds !== null).length;

  return {
    sample_size: total,
    videos: inputs.map((input, index) => ({
      id: input.id,
      label: input.label?.trim() || input.analysis.structure_label || input.id,
      url: input.url,
      duration_seconds: derived[index].basis_duration_seconds,
      structure_label: input.analysis.structure_label,
      product_first_seen_seconds: derived[index].product.first_seen_seconds,
      product_visible_percent: derived[index].product.visible_percent,
      demonstration_percent: derived[index].demonstration.combined_percent,
      cta_first_seen_seconds: derived[index].cta.first_seen_seconds
    })),
    first_three_seconds: {
      product_visible_count: derived.filter((metric) => metric.first_three_seconds.product_visible).length,
      product_visible_percent: percent(
        derived.filter((metric) => metric.first_three_seconds.product_visible).length,
        total
      ),
      materials: aggregateCoverage(derived, (metric) => metric.first_three_seconds.materials),
      presenters: aggregateCoverage(derived, (metric) => metric.first_three_seconds.presenters),
      message_roles: aggregateCoverage(derived, (metric) => metric.first_three_seconds.message_roles),
      actions: aggregatePresence(
        derived.map((metric) => metric.first_three_seconds.actions),
        total
      )
    },
    product: {
      known_first_seen_count: knownFirstSeen.length,
      avg_first_seen_seconds: knownFirstSeen.length ? round(average(knownFirstSeen), 2) : null,
      median_first_seen_seconds: median(knownFirstSeen) === null ? null : round(median(knownFirstSeen)!, 2),
      within_three_seconds_count: withinThree,
      within_three_seconds_percent: percent(withinThree, knownFirstSeen.length),
      avg_visible_percent: round(average(productVisiblePercents)),
      median_visible_percent: round(median(productVisiblePercents) ?? 0)
    },
    materials: aggregateCoverage(derived, (metric) => metric.materials),
    presenters: aggregateCoverage(derived, (metric) => metric.presenters),
    message_roles: aggregateCoverage(derived, (metric) => metric.message_roles),
    demonstration: {
      videos_with_use_or_demo_count: videosWithDemo,
      videos_with_use_or_demo_percent: percent(videosWithDemo, total),
      avg_combined_percent: round(average(demonstrationPercents)),
      median_combined_percent: round(median(demonstrationPercents) ?? 0),
      videos_with_visually_observable_result_count: videosWithVisibleResult,
      videos_with_visually_observable_result_percent: percent(videosWithVisibleResult, total)
    },
    claims_and_evidence: {
      videos_with_claims_count: videosWithClaims,
      videos_with_claims_percent: percent(videosWithClaims, total),
      avg_claim_count: round(
        average(derived.map((metric) => metric.claims_and_evidence.claim_count)),
        2
      ),
      videos_with_unsupported_claim_segments_count: videosWithUnsupportedClaimSegments,
      videos_with_unsupported_claim_segments_percent: percent(
        videosWithUnsupportedClaimSegments,
        total
      ),
      evidence_types: aggregateCoverage(
        derived,
        (metric) => metric.claims_and_evidence.evidence_types
      )
    },
    cta: {
      present_count: ctaPresent,
      present_percent: percent(ctaPresent, total),
      avg_first_seen_seconds: ctaFirstSeen.length ? round(average(ctaFirstSeen), 2) : null,
      median_first_seen_seconds:
        median(ctaFirstSeen) === null ? null : round(median(ctaFirstSeen)!, 2)
    },
    common_patterns: commonPatterns(inputs)
  };
}
