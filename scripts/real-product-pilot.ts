import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeYouTubeVideo } from "../lib/gemini";

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

async function main() {
  const fixturePath = path.join(process.cwd(), "fixtures", "real-product-pilot.json");
  const cases = JSON.parse(await readFile(fixturePath, "utf8")) as PilotCase[];

  const results = [];

  for (const item of cases) {
    const startedAt = Date.now();
    console.log(`PILOT_START ${item.id} ${item.url}`);

    try {
      const analysis = await analyzeWithQuotaRetry(item.url, item.id);
      const elapsedMs = Date.now() - startedAt;
      results.push({
        ...item,
        status: "pass",
        elapsed_ms: elapsedMs,
        analysis
      });
      console.log(`PILOT_PASS ${item.id} ${elapsedMs}ms ${analysis.structure_label}`);
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
    total: results.length,
    passed,
    failed,
    note: "expected_style is user-supplied metadata for later human cross-validation and is not passed to Gemini. Gemini 429 quota responses are retried using the provider-suggested delay when available.",
    results
  };

  const outDir = path.join(process.cwd(), "artifacts");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "real-product-pilot.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log(`PILOT_SUMMARY total=${results.length} passed=${passed} failed=${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
