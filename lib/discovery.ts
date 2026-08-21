import type { SearchCandidate } from "@/lib/tiered-analysis";

export const DISCOVERY_DEFAULTS = {
  max_results: 50,
  shortlist_limit: 12,
  min_duration_seconds: 1,
  max_duration_seconds: 180,
  max_per_creator: 2
} as const;

export type SearchOptions = {
  max_results?: number;
  shortlist_limit?: number;
  min_duration_seconds?: number;
  max_duration_seconds?: number;
  published_after?: string;
  region_code?: string;
  relevance_language?: string;
  max_per_creator?: number;
};

export type DiscoveryDiagnostics = {
  discovered_count: number;
  deduped_count: number;
  filtered_count: number;
  shortlisted_count: number;
};

export interface DiscoveryProvider {
  search(query: string, options?: SearchOptions): Promise<SearchCandidate[]>;
}

function finiteInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function normalizeSearchOptions(options: SearchOptions = {}): Required<Pick<
  SearchOptions,
  "max_results" | "shortlist_limit" | "min_duration_seconds" | "max_duration_seconds" | "max_per_creator"
>> & Omit<SearchOptions, "max_results" | "shortlist_limit" | "min_duration_seconds" | "max_duration_seconds" | "max_per_creator"> {
  const maxResults = finiteInteger(options.max_results, DISCOVERY_DEFAULTS.max_results, 1, 50);
  const shortlistLimit = finiteInteger(options.shortlist_limit, DISCOVERY_DEFAULTS.shortlist_limit, 1, maxResults);
  const minDuration = finiteInteger(options.min_duration_seconds, DISCOVERY_DEFAULTS.min_duration_seconds, 0, 14_400);
  const maxDuration = finiteInteger(options.max_duration_seconds, DISCOVERY_DEFAULTS.max_duration_seconds, minDuration, 14_400);
  const maxPerCreator = finiteInteger(options.max_per_creator, DISCOVERY_DEFAULTS.max_per_creator, 1, shortlistLimit);

  return {
    ...options,
    max_results: maxResults,
    shortlist_limit: shortlistLimit,
    min_duration_seconds: minDuration,
    max_duration_seconds: maxDuration,
    max_per_creator: maxPerCreator
  };
}

export function dedupeSearchCandidates(candidates: SearchCandidate[]) {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: SearchCandidate[] = [];

  for (const candidate of candidates) {
    if (seenIds.has(candidate.source_id) || seenUrls.has(candidate.canonical_url)) continue;
    seenIds.add(candidate.source_id);
    seenUrls.add(candidate.canonical_url);
    deduped.push(candidate);
  }

  return deduped;
}

function durationBucket(durationSeconds: number | undefined) {
  if (durationSeconds === undefined) return "unknown";
  if (durationSeconds <= 30) return "0-30";
  if (durationSeconds <= 60) return "31-60";
  if (durationSeconds <= 120) return "61-120";
  return "121+";
}

export function filterSearchCandidates(candidates: SearchCandidate[], options: SearchOptions = {}) {
  const normalized = normalizeSearchOptions(options);
  const publishedAfter = normalized.published_after ? Date.parse(normalized.published_after) : Number.NaN;

  return candidates.filter((candidate) => {
    const duration = candidate.duration_seconds;
    if (duration === undefined) return false;
    if (duration < normalized.min_duration_seconds || duration > normalized.max_duration_seconds) return false;

    if (!Number.isNaN(publishedAfter) && candidate.published_at) {
      const publishedAt = Date.parse(candidate.published_at);
      if (!Number.isNaN(publishedAt) && publishedAt < publishedAfter) return false;
    }

    return true;
  });
}

export function sampleSearchCandidatesForDiversity(candidates: SearchCandidate[], options: SearchOptions = {}) {
  const normalized = normalizeSearchOptions(options);
  const buckets = new Map<string, SearchCandidate[]>();

  for (const candidate of candidates) {
    const bucket = durationBucket(candidate.duration_seconds);
    const values = buckets.get(bucket) ?? [];
    values.push(candidate);
    buckets.set(bucket, values);
  }

  const bucketOrder = ["0-30", "31-60", "61-120", "121+", "unknown"].filter((key) => buckets.has(key));
  const creatorCounts = new Map<string, number>();
  const selected: SearchCandidate[] = [];
  let cursor = 0;

  while (selected.length < normalized.shortlist_limit && bucketOrder.length > 0) {
    const bucketKey = bucketOrder[cursor % bucketOrder.length];
    const bucket = buckets.get(bucketKey) ?? [];
    let picked = false;

    while (bucket.length > 0 && !picked) {
      const candidate = bucket.shift() as SearchCandidate;
      const creatorKey = candidate.creator?.trim().toLowerCase() || `source:${candidate.source_id}`;
      const creatorCount = creatorCounts.get(creatorKey) ?? 0;
      if (creatorCount >= normalized.max_per_creator) continue;

      creatorCounts.set(creatorKey, creatorCount + 1);
      selected.push(candidate);
      picked = true;
    }

    if (bucket.length === 0) {
      const index = bucketOrder.indexOf(bucketKey);
      bucketOrder.splice(index, 1);
      if (bucketOrder.length === 0) break;
      cursor = cursor % bucketOrder.length;
    } else {
      cursor = (cursor + 1) % bucketOrder.length;
    }
  }

  return selected;
}

export function prepareDiscoveryCandidates(candidates: SearchCandidate[], options: SearchOptions = {}) {
  const deduped = dedupeSearchCandidates(candidates);
  const filtered = filterSearchCandidates(deduped, options);
  const shortlisted = sampleSearchCandidatesForDiversity(filtered, options);

  return {
    candidates: shortlisted,
    diagnostics: {
      discovered_count: candidates.length,
      deduped_count: deduped.length,
      filtered_count: filtered.length,
      shortlisted_count: shortlisted.length
    } satisfies DiscoveryDiagnostics
  };
}
