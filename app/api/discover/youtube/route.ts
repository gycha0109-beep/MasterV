import { NextResponse } from "next/server";
import type { SearchOptions } from "@/lib/discovery";
import { discoverYouTubeCandidates, YouTubeDiscoveryError } from "@/lib/youtube-discovery";

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"]);
const CONFIG_REASONS = new Set(["keyInvalid", "accessNotConfigured", "ipRefererBlocked"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: string; options?: SearchOptions };
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 400 });
    }

    if (!process.env.YOUTUBE_DATA_API_KEY?.trim()) {
      return NextResponse.json({
        error: "YouTube Discovery API가 설정되지 않았습니다.",
        code: "YOUTUBE_DISCOVERY_NOT_CONFIGURED"
      }, { status: 503 });
    }

    const result = await discoverYouTubeCandidates(query, body.options ?? {});
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof YouTubeDiscoveryError) {
      const status = error.reason && QUOTA_REASONS.has(error.reason)
        ? 429
        : error.reason && CONFIG_REASONS.has(error.reason)
          ? 503
          : 502;

      return NextResponse.json({
        error: error.message,
        code: status === 429 ? "YOUTUBE_DISCOVERY_QUOTA" : "YOUTUBE_DISCOVERY_UPSTREAM",
        reason: error.reason
      }, { status });
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
