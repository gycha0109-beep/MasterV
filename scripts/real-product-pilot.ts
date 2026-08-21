import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeAnalysisReplayFixture, type AnalysisReplayFixtureEntry } from "../lib/analysis-cache";
import { DEEP_MEDIA_RESOLUTION, DEEP_PROMPT_VERSION, DEEP_SCHEMA_VERSION } from "../lib/analysis-versions";
import { deriveVideoMetrics } from "../lib/derived-metrics";
import { normalizeGeminiError } from "../lib/gemini-error";
import { analyzeYouTubeVideo } from "../lib/gemini";
import { canonicalizeYouTubeSource } from "../lib/source-identity";
import { buildAnalysisCacheKey } from "../lib/tiered-analysis";

type PilotCase = {
  id: string;
  label: string;
  expected_style: string;
  url: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(error: unknown): number | null {
  const normalized = normalizeGeminiError(error);
  if (!normalized.is_rate_limit || !normalized.diagnostic) return null;
  if (normalized.diagnostic.kind === "RPD" || normalized.diagnostic.kind === "UNKNOWN") return null;
  if (normalized.diagnostic.retry_after_seconds === null) return null;
  return normalized.diagnostic.retry_after_seconds * 1000 + 2000;
}

async function analyzeWithQuotaRetry(url: string, id: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await analyzeYouTubeVideo(url);
    } catch (error) {
      const delay = retryDelayMs(error);
      if (delay === null || attempt === maxAttempts) throw error;
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
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const results = [];
  const replayEntries: AnalysisReplayFixtureEntry[] = [];

  for (const item of cases) {
    const startedAt = Date.now();
    console.log(`PILOT_START ${item.id} ${item.url}`);

    try {
      const analysis = await analyzeWithQuotaRetry(item.url, item.id);
      const derived_metrics = deriveVideoMetrics(analysis);
      const elapsedMs = Date.now() - startedAt;
      const source = canonicalizeYouTubeSource(item.url);
      const cacheKey = buildAnalysisCacheKey({
        provider: "youtube",
        source_id: source.source_id,
        analyzer_tier: "deep",
        schema_version: DEEP_SCHEMA_VERSION,
        prompt_version: DEEP_PROMPT_VERSION,
        model,
        media_resolution: DEEP_MEDIA_RESOLUTION
      });

      replayEntries.push({
        cache_key: cacheKey,
        source_id: source.source_id,
        analyzer_tier: "deep",
        schema_version: DEEP_SCHEMA_VERSION,
        prompt_version: DEEP_PROMPT_VERSION,
        model,
        media_resolution: DEEP_MEDIA_RESOLUTION,
        value: analysis
      });
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
      const normalized = normalizeGeminiError(error);
      const message = normalized.message;
      results.push({
        ...item,
        status: "fail",
        elapsed_ms: elapsedMs,
        error: message,
        rate_limit: normalized.diagnostic
      });
      console.error(`PILOT_FAIL ${item.id} ${elapsedMs}ms ${message}`);

      if (normalized.is_rate_limit && ["RPD", "UNKNOWN"].includes(normalized.diagnostic?.kind ?? "")) {
        console.error(`PILOT_STOP_RATE_LIMIT kind=${normalized.diagnostic?.kind ?? "UNKNOWN"}`);
        break;
      }
    }
  }

  const passed = results.filter((item) => item.status === "pass").length;
  const failed = results.length - passed;
  const generatedAt = new Date().toISOString();
  const report = {
    generated_at: generatedAt,
    corpus_total: allCases.length,
    selected_total: results.length,
    passed,
    failed,
    note: "expected_style is user-supplied metadata and is not passed to Gemini. Only explicit RPM/TPM retry hints may be retried. UNKNOWN/RPD rate limits stop the pilot without automatic hammering. Successful Deep outputs are also emitted as an analysis-replay-v1 fixture with the exact runtime cache key.",
    results
  };

  const outDir = path.join(process.cwd(), "artifacts");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "real-product-pilot.json"), JSON.stringify(report, null, 2), "utf8");
  await writeAnalysisReplayFixture(path.join(outDir, "analysis-replay-deep.json"), {
    version: "analysis-replay-v1",
    generated_at: generatedAt,
    entries: replayEntries
  });

  console.log(`PILOT_REPLAY entries=${replayEntries.length}`);
  console.log(`PILOT_SUMMARY corpus=${allCases.length} selected=${results.length} passed=${passed} failed=${failed}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
