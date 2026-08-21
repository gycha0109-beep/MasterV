import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnalysisExecutionBlockedError, FileAnalysisBudgetStore } from "../lib/analysis-budget";
import { InMemoryAnalysisCacheStore } from "../lib/analysis-cache";
import { executeAnalysis } from "../lib/analysis-runtime";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const model = "gemini-test";
  const dayOne = new Date("2026-08-13T18:00:00.000Z");
  const dayTwo = new Date("2026-08-14T18:00:00.000Z");
  const directory = await mkdtemp(path.join(os.tmpdir(), "masterv-analysis-budget-"));
  const budgetPath = path.join(directory, "budget.json");
  const cache = new InMemoryAnalysisCacheStore();
  let liveCalls = 0;

  try {
    const budgetA = new FileAnalysisBudgetStore(budgetPath);
    try {
      await executeAnalysis<{ ok: boolean }>({
        model,
        items: [{ source_id: "yt:A", cache_key: "limit-A" }],
        cache,
        budget: budgetA,
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

    assert((await budgetA.get(model, dayOne)).status === "blocked_rpd", "RPD must block the model queue");

    const budgetB = new FileAnalysisBudgetStore(budgetPath);
    assert((await budgetB.get(model, dayOne)).status === "blocked_rpd", "file budget state must survive adapter recreation");

    let blockedBeforeLive = false;
    try {
      await executeAnalysis<{ ok: boolean }>({
        model,
        items: [{ source_id: "yt:B", cache_key: "limit-B" }],
        cache,
        budget: budgetB,
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

    const budgetC = new FileAnalysisBudgetStore(budgetPath);
    const reset = await executeAnalysis<{ ok: boolean }>({
      model,
      items: [{ source_id: "yt:B", cache_key: "limit-B" }],
      cache,
      budget: budgetC,
      now: dayTwo,
      live: async () => {
        liveCalls += 1;
        return { "yt:B": { ok: true } };
      }
    });

    assert(reset.provenance["yt:B"] === "live", "new Pacific day must release prior RPD block");
    assert(liveCalls === 2, "new Pacific day may execute a new live request");
    assert((await new FileAnalysisBudgetStore(budgetPath).get(model, dayTwo)).budget.tracked_requests_today === 1, "reset budget state must persist to disk");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log("ANALYSIS_BUDGET_CONTRACT_PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
