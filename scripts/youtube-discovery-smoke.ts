import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverYouTubeCandidates } from "../lib/youtube-discovery";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  assert(apiKey, "YOUTUBE_DATA_API_KEY secret is required");

  const query = process.env.YOUTUBE_DISCOVERY_SMOKE_QUERY?.trim() || "sunscreen review shorts";
  const result = await discoverYouTubeCandidates(query, {
    max_results: 10,
    shortlist_limit: 5,
    min_duration_seconds: 1,
    max_duration_seconds: 180,
    max_per_creator: 2
  }, { api_key: apiKey });

  assert(result.provider === "youtube", "provider must be youtube");
  assert(result.diagnostics.gemini_requests === 0, "discovery smoke must execute zero Gemini requests");
  assert(result.diagnostics.youtube_api_requests === 2, "populated discovery must use exactly search.list + videos.list");
  assert(result.candidates.length > 0, "live discovery returned no candidates; use a broader smoke query");
  assert(result.candidates.length <= 5, "shortlist limit must be respected");

  for (const candidate of result.candidates) {
    assert(candidate.source === "youtube", `unexpected source: ${candidate.source}`);
    assert(candidate.source_id.startsWith("yt:"), `non-canonical source_id: ${candidate.source_id}`);
    assert(candidate.canonical_url.startsWith("https://www.youtube.com/watch?v="), `non-canonical URL: ${candidate.canonical_url}`);
    assert(typeof candidate.native_metrics.search_rank === "number", `missing search_rank: ${candidate.source_id}`);
  }

  const artifact = {
    version: "youtube-discovery-smoke-v1",
    generated_at: new Date().toISOString(),
    query: result.query,
    provider: result.provider,
    diagnostics: result.diagnostics,
    candidates: result.candidates.map((candidate) => ({
      source_id: candidate.source_id,
      canonical_url: candidate.canonical_url,
      title: candidate.title ?? null,
      creator: candidate.creator ?? null,
      published_at: candidate.published_at ?? null,
      duration_seconds: candidate.duration_seconds ?? null,
      native_metrics: candidate.native_metrics
    }))
  };

  const artifactDir = path.resolve("artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "youtube-discovery-smoke.json");
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");

  console.log(JSON.stringify({
    status: "YOUTUBE_DISCOVERY_SMOKE_PASS",
    query: result.query,
    candidate_count: result.candidates.length,
    youtube_api_requests: result.diagnostics.youtube_api_requests,
    gemini_requests: result.diagnostics.gemini_requests,
    artifact: artifactPath
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
