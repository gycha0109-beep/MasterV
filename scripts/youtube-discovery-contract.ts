import { discoverYouTubeCandidates, parseIso8601DurationSeconds } from "../lib/youtube-discovery";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function main() {
  const calls: URL[] = [];
  const fetcher = async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url);

    if (url.pathname.endsWith("/search")) {
      return response({ items: ["A", "A", "B", "C", "D", "F"].map((videoId) => ({ id: { videoId } })) });
    }

    const definitions = [
      ["A", "Creator One", "PT20S", "1000"],
      ["B", "Creator One", "PT45S", "900"],
      ["C", "Creator Two", "PT1M15S", "800"],
      ["D", "Creator Three", "PT2M30S", "700"],
      ["F", "Creator Five", "PT50S", "600"]
    ];
    return response({
      items: definitions.map(([id, creator, duration, views]) => ({
        id,
        snippet: {
          title: `video-${id}`,
          channelTitle: creator,
          channelId: `channel-${id}`,
          publishedAt: "2026-08-01T00:00:00Z",
          thumbnails: { high: { url: `https://img.youtube.com/${id}.jpg` } }
        },
        contentDetails: { duration },
        statistics: { viewCount: views }
      }))
    });
  };

  const result = await discoverYouTubeCandidates("umbrella", {
    max_results: 6,
    shortlist_limit: 4,
    min_duration_seconds: 10,
    max_duration_seconds: 180,
    max_per_creator: 1,
    region_code: "KR",
    relevance_language: "ko"
  }, { api_key: "fixture-key", fetcher });

  assert(calls.length === 2, "must use search.list and videos.list only");
  assert(calls[0].searchParams.get("type") === "video", "search must request videos only");
  assert(calls[0].searchParams.get("videoDuration") === "short", "search must request short videos");
  assert(calls[0].searchParams.get("regionCode") === "KR", "region must pass through");
  assert(calls[1].searchParams.get("id") === "A,B,C,D,F", "hydrate ids must be unique");
  assert(result.diagnostics.gemini_requests === 0, "discovery must use zero Gemini requests");
  assert(result.diagnostics.discovered_count === 6, "raw result count must be kept");
  assert(result.diagnostics.deduped_count === 5, "duplicate source id must be removed");
  assert(result.candidates.map((item) => item.source_id).join(",") === "yt:A,yt:F,yt:C,yt:D", "diversity shortlist mismatch");
  assert(result.candidates[0].native_metrics.view_count === "1000", "native metrics must be preserved");
  assert(parseIso8601DurationSeconds("PT1H2M3S") === 3723, "duration parser mismatch");

  console.log("YOUTUBE_DISCOVERY_CONTRACT_PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
