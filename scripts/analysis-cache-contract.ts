import { InMemoryAnalysisCacheStore, InMemoryAnalysisReplayStore } from "../lib/analysis-cache";
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
  assert(first.live_request_count === 1 && liveCalls === 1, "first miss must use one live request");

  const second = await executeAnalysis<{ label: string }>({
    model, items: [item], cache, budget, now,
    live: async () => {
      liveCalls += 1;
      return { "yt:A": { label: "unexpected" } };
    }
  });
  assert(second.provenance["yt:A"] === "cache", "same key must hit cache");
  assert(second.live_request_count === 0 && liveCalls === 1, "cache hit must use zero live requests");
  assert((await budget.get(model, now)).budget.tracked_requests_today === 1, "cache hit must not increment budget");

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
  assert(replayed.provenance["yt:R"] === "replay", "replay must use fixture");
  assert(replayed.live_request_count === 0 && replayLiveCalls === 0, "replay must use zero live requests");
  assert((await replayBudget.get(model, now)).budget.tracked_requests_today === 0, "replay must not increment budget");

  console.log("ANALYSIS_CACHE_CONTRACT_PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
