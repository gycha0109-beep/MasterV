import fs from "node:fs/promises";
import path from "node:path";
import { analyzeYouTubeCoarseBundle } from "../lib/coarse-analysis";

type Fixture = {
  id: string;
  label: string;
  expected_style: string;
  url: string;
};

const fixturePath = path.join(process.cwd(), "fixtures", "real-product-pilot.json");
const artifactDir = path.join(process.cwd(), "artifacts");
const requestedSizes = (process.env.BUNDLE_SIZES || "1,2,4,6,10")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 10);

if (requestedSizes.length === 0) {
  throw new Error("BUNDLE_SIZES에 1~10 사이 정수를 하나 이상 지정하세요.");
}

const fixtures = JSON.parse(await fs.readFile(fixturePath, "utf8")) as Fixture[];
await fs.mkdir(artifactDir, { recursive: true });

const report: {
  generated_at: string;
  model: string;
  fixture_count: number;
  bundle_sizes: number[];
  runs: Array<{
    bundle_size: number;
    bundle_index: number;
    source_ids: string[];
    success: boolean;
    duration_ms: number;
    analyses?: unknown[];
    error?: string;
  }>;
} = {
  generated_at: new Date().toISOString(),
  model: process.env.GEMINI_COARSE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash",
  fixture_count: fixtures.length,
  bundle_sizes: requestedSizes,
  runs: []
};

for (const bundleSize of requestedSizes) {
  for (let index = 0; index < fixtures.length; index += bundleSize) {
    const group = fixtures.slice(index, index + bundleSize);
    if (group.length === 0) continue;

    const sourceIds = group.map((item) => `yt:${new URL(item.url).pathname.split("/").filter(Boolean).at(-1)}`);
    const started = Date.now();

    try {
      const analyses = await analyzeYouTubeCoarseBundle(group.map((item, itemIndex) => ({
        source_id: sourceIds[itemIndex],
        url: item.url
      })));
      report.runs.push({
        bundle_size: bundleSize,
        bundle_index: Math.floor(index / bundleSize),
        source_ids: sourceIds,
        success: true,
        duration_ms: Date.now() - started,
        analyses
      });
    } catch (error) {
      report.runs.push({
        bundle_size: bundleSize,
        bundle_index: Math.floor(index / bundleSize),
        source_ids: sourceIds,
        success: false,
        duration_ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      });

      if (/429|quota|rate.?limit|resource_exhausted/i.test(error instanceof Error ? error.message : String(error))) {
        break;
      }
    }
  }
}

const outPath = path.join(artifactDir, "coarse-bundle-calibration.json");
await fs.writeFile(outPath, JSON.stringify(report, null, 2));
console.log(`COARSE_BUNDLE_CALIBRATION_WRITTEN ${outPath}`);
console.log(`runs=${report.runs.length} success=${report.runs.filter((run) => run.success).length} failed=${report.runs.filter((run) => !run.success).length}`);
