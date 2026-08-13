import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FileAnalysisCacheStore,
  FileAnalysisReplayStore,
  InMemoryAnalysisCacheStore,
  InMemoryAnalysisReplayStore,
  writeAnalysisReplayFixture
} from "../lib/analysis-cache";
import { InMemoryAnalysisBudgetStore } from "../lib/analysis-budget";
import { executeAnalysis } from "../lib/analysis-runtime";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const model = "gemini-test";
  const now = new Date("2026-08-13T18:00:00.000Z");
  const cache = new InMemoryAnalysisCacheStore();
  const budget = new InMemoryAnalysisBudgetStore();
  const item = { source_id: "yt:A", cache_key: "cache-A" };
  let liveCalls = 0;

  const first = await executeAnalysis<{ label: string }>({
    model, items: [item], cache, budget, now,
    live: async () => {
      liveCalls += 1;
      return { "yt:A": { label: "live" } };
    }
  });
  assert(first.provenance["yt:A"] === "live", "first miss must execute live");
  assert(first.cache_miss_count === 1 && first.live_request_count === 1, "first miss observability must be recorded");

  const second = await executeAnalysis<{ label: string }>({
    model, items: [item], cache, budget, now,
    live: async () => {
      liveCalls += 1;
      return { "yt:A": { label: "unexpected" } };
    }
  });
  assert(second.provenance["yt:A"] === "cache", "same key must hit cache");
  assert(second.cache_hit_count === 1 && second.live_request_count === 0 && liveCalls === 1, "cache hit must use zero live requests");
  assert((await budget.get(model, now)).budget.tracked_requests_today === 1, "cache hit must not increment budget");

  const refreshed = await executeAnalysis<{ label: string }>({
    model, items: [item], cache, budget, now, force_refresh: true,
    live: async () => {
      liveCalls += 1;
      return { "yt:A": { label: "refreshed" } };
    }
  });
  assert(refreshed.cache_bypass_count === 1 && refreshed.provenance["yt:A"] === "live", "force refresh must bypass cache and execute live");
  assert((await cache.get<{ label: string }>(item.cache_key))?.value.label === "refreshed", "successful force refresh must replace cache value");

  const replayCache = new InMemoryAnalysisCacheStore();
  const replayBudget = new InMemoryAnalysisBudgetStore();
  const replay = new InMemoryAnalysisReplayStore([{ key: "replay-key", value: { label: "fixture" } }]);
  let replayLiveCalls = 0;
  const replayed = await executeAnalysis<{ label: string }>({
    model,
    items: [{ source_id: "yt:R", cache_key: "replay-key" }],
    cache: replayCache,
    budget: replayBudget,
    replay,
    mode: "replay",
    now,
    live: async () => {
      replayLiveCalls += 1;
      return { "yt:R": { label: "unexpected" } };
    }
  });
  assert(replayed.provenance["yt:R"] === "replay" && replayed.replay_hit_count === 1, "replay must use fixture");
  assert(replayed.live_request_count === 0 && replayLiveCalls === 0, "replay must use zero live requests");
  assert((await replayBudget.get(model, now)).budget.tracked_requests_today === 0, "replay must not increment budget");

  const directory = await mkdtemp(path.join(os.tmpdir(), "masterv-analysis-cache-"));
  try {
    const cachePath = path.join(directory, "cache.json");
    const fileCacheA = new FileAnalysisCacheStore(cachePath);
    await fileCacheA.set("persist-key", { label: "persisted" }, now.toISOString());
    const fileCacheB = new FileAnalysisCacheStore(cachePath);
    assert((await fileCacheB.get<{ label: string }>("persist-key"))?.value.label === "persisted", "file cache must survive adapter recreation");
    assert(await fileCacheB.delete("persist-key"), "file cache explicit invalidation must delete an existing entry");
    assert(await fileCacheA.get("persist-key") === null, "file cache invalidation must be visible to another adapter instance");

    const replayPath = path.join(directory, "replay.json");
    await writeAnalysisReplayFixture(replayPath, {
      version: "analysis-replay-v1",
      generated_at: now.toISOString(),
      entries: [{
        cache_key: "file-replay-key",
        source_id: "yt:F",
        analyzer_tier: "deep",
        schema_version: "deep-v2",
        prompt_version: "deep-prompt-v5",
        model,
        media_resolution: "default",
        value: { label: "file-fixture" }
      }]
    });
    const fileReplay = new FileAnalysisReplayStore(replayPath);
    assert((await fileReplay.get<{ label: string }>("file-replay-key"))?.label === "file-fixture", "file replay loader must read the persisted envelope");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log("ANALYSIS_CACHE_CONTRACT_PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
