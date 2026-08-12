import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeYouTubeVideo } from "../lib/gemini";
import { deriveVideoMetrics } from "../lib/derived-metrics";

type PilotCase = {
  id: string;
  label: string;
  expected_style: string;
  url: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(message: string): number | null {
  if (!message.includes("429") && !message.toLowerCase().includes("quota")) {
    return null;
  }

  const match = message.match(/retry in\s+([0-9.]+)s/i);
  if (match) {
    return Math.ceil(Number(match[1]) * 1000) + 2000;
  }

  return 65_000;
}

async function analyzeWithQuotaRetry(url: string, id: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await analyzeYouTubeVideo(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const delay = retryDelayMs(message);

      if (delay === null || attempt === maxAttempts) {
        throw error;
      }

      console.warn(`PILOT_RATE_LIMIT ${id} attempt=${attempt} retry_after_ms=${delay}`);
      await sleep(delay);
    }
  }

  throw new Error("unreachable");
}

async function loadSelectedCases(allCases: PilotCase[]): Promise<PilotCase[]> {
  const activePath = path.join(process.cwd(), "fixtures", "real-product-pilot-active.json");

  try {
    const activeIds = JSON.parse(await readFile(activePath, "utf8")) as string[];
    const activeSet = new Set(activeIds);
    const selected = allCases.filter((item) => activeSet.has(item.id));

    if (selected.length === 0) {
      throw new Error("real-product-pilot-active.json did not match any corpus ids");
    }

    console.log(`PILOT_SELECTION active=${selected.map((item) => item.id).join(",")}`);
    return selected;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.log("PILOT_SELECTION active fixture absent; running full corpus");
      return allCases;
    }
    throw error;
  }
}

async function main() {
  const fixturePath = path.join(process.cwd(), "fixtures", "real-product-pilot.json");
  const allCases = JSON.parse(await readFile(fixturePath, "utf8")) as PilotCase[];
  const cases = await loadSelectedCases(allCases);

  const results = [];

  for (const item of cases) {
    const startedAt = Date.now();
    console.log(`PILOT_START ${item.id} ${item.url}`);

    try {
      const analysis = await analyzeWithQuotaRetry(item.url, item.id);
      const derived_metrics = deriveVideoMetrics(analysis);
      const elapsedMs = Date.now() - startedAt;
      results.push({
        ...item,
        status: "pass",
        elapsed_ms: elapsedMs,
        analysis,
        derived_metrics
      });
      console.log(
        `PILOT_PASS ${item.id} ${elapsedMs}ms ${analysis.structure_label} demo=${derived_metrics.demonstration.combined_percent}%`
      );
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        ...item,
        status: "fail",
        elapsed_ms: elapsedMs,
        error: message
      });
      console.error(`PILOT_FAIL ${item.id} ${elapsedMs}ms ${message}`);
    }
  }

  const passed = results.filter((item) => item.status === "pass").length;
  const failed = results.length - passed;
  const report = {
    generated_at: new Date().toISOString(),
    corpus_total: allCases.length,
    selected_total: results.length,
    passed,
    failed,
    note: "expected_style is user-supplied metadata for later human cross-validation and is not passed to Gemini. When real-product-pilot-active.json exists, only those ids are analyzed. Gemini 429 quota responses are retried using the provider-suggested delay when available. derived_metrics are deterministic calculations over observation_segments and do not make an additional model call.",
    results
  };

  const outDir = path.join(process.cwd(), "artifacts");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "real-product-pilot.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log(`PILOT_SUMMARY corpus=${allCases.length} selected=${results.length} passed=${passed} failed=${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
