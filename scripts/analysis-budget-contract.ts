import { AnalysisExecutionBlockedError, InMemoryAnalysisBudgetStore } from "../lib/analysis-budget";
import { InMemoryAnalysisCacheStore } from "../lib/analysis-cache";
import { executeAnalysis } from "../lib/analysis-runtime";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const model = "gemini-test";
  const dayOne = new Date("2026-08-13T18:00:00.000Z");
  const dayTwo = new Date("2026-08-14T18:00:00.000Z");
  const cache = new InMemoryAnalysisCacheStore();
  const budget = new InMemoryAnalysisBudgetStore();
  let liveCalls = 0;

  try {
    await executeAnalysis<{ ok: boolean }>({
      model,
      items: [{ source_id: "yt:A", cache_key: "limit-A" }],
      cache,
      budget,
      now: dayOne,
      live: async () => {
        liveCalls += 1;
        const error = new Error("429 quota per day");
        Object.assign(error, {
          status: 429,
          details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", model }]
        });
        throw error;
      }
    });
  } catch {}

  assert((await budget.get(model, dayOne)).status === "blocked_rpd", "RPD must block the model queue");

  let blockedBeforeLive = false;
  try {
    await executeAnalysis<{ ok: boolean }>({
      model,
      items: [{ source_id: "yt:B", cache_key: "limit-B" }],
      cache,
      budget,
      now: dayOne,
      live: async () => {
        liveCalls += 1;
        return { "yt:B": { ok: true } };
      }
    });
  } catch (error) {
    blockedBeforeLive = error instanceof AnalysisExecutionBlockedError && error.status === "blocked_rpd";
  }

  assert(blockedBeforeLive, "RPD must reject before the next live request");
  assert(liveCalls === 1, "blocked RPD queue must not hammer Gemini");

  const reset = await executeAnalysis<{ ok: boolean }>({
    model,
    items: [{ source_id: "yt:B", cache_key: "limit-B" }],
    cache,
    budget,
    now: dayTwo,
    live: async () => {
      liveCalls += 1;
      return { "yt:B": { ok: true } };
    }
  });

  assert(reset.provenance["yt:B"] === "live", "new Pacific day must release prior RPD block");
  assert(liveCalls === 2, "new Pacific day may execute a new live request");

  console.log("ANALYSIS_BUDGET_CONTRACT_PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
