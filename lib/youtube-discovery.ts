import {
  normalizeSearchOptions,
  prepareDiscoveryCandidates,
  type DiscoveryDiagnostics,
  type DiscoveryProvider,
  type SearchOptions
} from "@/lib/discovery";
import { canonicalizeYouTubeSource } from "@/lib/source-identity";
import type { SearchCandidate } from "@/lib/tiered-analysis";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type YouTubeSearchItem = {
  id?: { videoId?: string };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    description?: string;
    publishedAt?: string;
    categoryId?: string;
    tags?: string[];
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: {
    duration?: string;
    definition?: string;
    caption?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  status?: {
    embeddable?: boolean;
    privacyStatus?: string;
    selfDeclaredMadeForKids?: boolean;
  };
};

type YouTubeSearchResponse = {
  items?: YouTubeSearchItem[];
  error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> };
};

type YouTubeVideosResponse = {
  items?: YouTubeVideoItem[];
  error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> };
};

export class YouTubeDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason: string | null
  ) {
    super(message);
    this.name = "YouTubeDiscoveryError";
  }
}

function parseIso8601DurationSeconds(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return undefined;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return Math.round(days * 86_400 + hours * 3_600 + minutes * 60 + seconds);
}

function bestThumbnail(thumbnails: Record<string, { url?: string }> | undefined) {
  if (!thumbnails) return undefined;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const value = thumbnails[key]?.url;
    if (value) return value;
  }
  return Object.values(thumbnails).find((thumbnail) => thumbnail.url)?.url;
}

async function readJson<T extends { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } }>(
  response: Response,
  operation: string
) {
  const body = await response.json() as T;
  if (response.ok) return body;

  const reason = body.error?.errors?.[0]?.reason ?? null;
  const detail = body.error?.message ?? body.error?.errors?.[0]?.message ?? response.statusText;
  throw new YouTubeDiscoveryError(`${operation} 실패: ${detail || response.status}`, response.status, reason);
}

function buildSearchUrl(apiKey: string, query: string, options: ReturnType<typeof normalizeSearchOptions>) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(options.max_results));
  url.searchParams.set("order", "relevance");
  url.searchParams.set("videoDuration", "short");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);
  if (options.region_code) url.searchParams.set("regionCode", options.region_code);
  if (options.relevance_language) url.searchParams.set("relevanceLanguage", options.relevance_language);
  if (options.published_after) url.searchParams.set("publishedAfter", options.published_after);
  return url;
}

function buildVideosUrl(apiKey: string, ids: string[]) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails,statistics,status");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", apiKey);
  return url;
}

export class YouTubeDiscoveryProvider implements DiscoveryProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch
  ) {
    if (!apiKey.trim()) throw new Error("YOUTUBE_DATA_API_KEY가 필요합니다.");
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchCandidate[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error("YouTube 검색어가 비어 있습니다.");
    const normalizedOptions = normalizeSearchOptions(options);

    const searchResponse = await readJson<YouTubeSearchResponse>(
      await this.fetcher(buildSearchUrl(this.apiKey, normalizedQuery, normalizedOptions)),
      "YouTube search.list"
    );

    const orderedIds = (searchResponse.items ?? [])
      .map((item) => item.id?.videoId?.trim())
      .filter((id): id is string => Boolean(id));
    const uniqueIds = [...new Set(orderedIds)];
    if (uniqueIds.length === 0) return [];

    const videosResponse = await readJson<YouTubeVideosResponse>(
      await this.fetcher(buildVideosUrl(this.apiKey, uniqueIds)),
      "YouTube videos.list"
    );
    const byId = new Map((videosResponse.items ?? []).flatMap((item) => item.id ? [[item.id, item] as const] : []));

    return orderedIds.flatMap((videoId, index) => {
      const video = byId.get(videoId);
      if (!video) return [];
      const source = canonicalizeYouTubeSource(`https://www.youtube.com/watch?v=${videoId}`);
      const snippet = video.snippet ?? {};
      const durationSeconds = parseIso8601DurationSeconds(video.contentDetails?.duration);

      return [{
        source: "youtube" as const,
        source_id: source.source_id,
        canonical_url: source.canonical_url,
        title: snippet.title,
        creator: snippet.channelTitle,
        published_at: snippet.publishedAt,
        duration_seconds: durationSeconds,
        thumbnail_url: bestThumbnail(snippet.thumbnails),
        native_metrics: {
          search_rank: index + 1,
          view_count: video.statistics?.viewCount ?? null,
          like_count: video.statistics?.likeCount ?? null,
          comment_count: video.statistics?.commentCount ?? null
        },
        source_metadata: {
          native_video_id: videoId,
          channel_id: snippet.channelId ?? null,
          description: snippet.description ?? null,
          category_id: snippet.categoryId ?? null,
          tags: snippet.tags ?? [],
          definition: video.contentDetails?.definition ?? null,
          caption: video.contentDetails?.caption ?? null,
          default_language: snippet.defaultLanguage ?? null,
          default_audio_language: snippet.defaultAudioLanguage ?? null,
          live_broadcast_content: snippet.liveBroadcastContent ?? null,
          embeddable: video.status?.embeddable ?? null,
          self_declared_made_for_kids: video.status?.selfDeclaredMadeForKids ?? null,
          privacy_status: video.status?.privacyStatus ?? null
        }
      }];
    });
  }
}

export type YouTubeDiscoveryResult = {
  provider: "youtube";
  query: string;
  candidates: SearchCandidate[];
  diagnostics: DiscoveryDiagnostics & {
    youtube_api_requests: number;
    gemini_requests: 0;
  };
};

export async function discoverYouTubeCandidates(
  query: string,
  options: SearchOptions = {},
  dependencies: { api_key?: string; fetcher?: FetchLike } = {}
): Promise<YouTubeDiscoveryResult> {
  const apiKey = dependencies.api_key ?? process.env.YOUTUBE_DATA_API_KEY ?? "";
  const baseFetcher = dependencies.fetcher ?? fetch;
  let youtubeApiRequests = 0;
  const countingFetcher: FetchLike = async (input, init) => {
    youtubeApiRequests += 1;
    return baseFetcher(input, init);
  };
  const provider = new YouTubeDiscoveryProvider(apiKey, countingFetcher);
  const discovered = await provider.search(query, options);
  const prepared = prepareDiscoveryCandidates(discovered, options);

  return {
    provider: "youtube",
    query: query.trim(),
    candidates: prepared.candidates,
    diagnostics: {
      ...prepared.diagnostics,
      youtube_api_requests: youtubeApiRequests,
      gemini_requests: 0
    }
  };
}

export { parseIso8601DurationSeconds };
