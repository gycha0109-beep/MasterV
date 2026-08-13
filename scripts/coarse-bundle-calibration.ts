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
const requestedSizes = [...new Set((process.env.BUNDLE_SIZES || "1,2,4,6,10")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 10))];
const fixtureOffset = Number(process.env.FIXTURE_OFFSET || "0");
const fixtureLimit = process.env.FIXTURE_LIMIT ? Number(process.env.FIXTURE_LIMIT) : null;

if (requestedSizes.length === 0) {
  throw new Error("BUNDLE_SIZES에 1~10 사이 정수를 하나 이상 지정하세요.");
}
if (!Number.isInteger(fixtureOffset) || fixtureOffset < 0) {
  throw new Error("FIXTURE_OFFSET은 0 이상의 정수여야 합니다.");
}
if (fixtureLimit !== null && (!Number.isInteger(fixtureLimit) || fixtureLimit < 1)) {
  throw new Error("FIXTURE_LIMIT은 1 이상의 정수여야 합니다.");
}

const allFixtures = JSON.parse(await fs.readFile(fixturePath, "utf8")) as Fixture[];
const fixtures = allFixtures.slice(
  fixtureOffset,
  fixtureLimit === null ? undefined : fixtureOffset + fixtureLimit
);

if (fixtures.length === 0) {
  throw new Error("선택된 calibration fixture가 없습니다.");
}

await fs.mkdir(artifactDir, { recursive: true });

const report: {
  generated_at: string;
  model: string;
  fixture_count: number;
  selected_fixture_count: number;
  fixture_offset: number;
  fixture_limit: number | null;
  selected_fixture_ids: string[];
  bundle_sizes: number[];
  stopped_early: boolean;
  stop_reason?: string;
  stop_bundle_size?: number;
  stop_bundle_index?: number;
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
  fixture_count: allFixtures.length,
  selected_fixture_count: fixtures.length,
  fixture_offset: fixtureOffset,
  fixture_limit: fixtureLimit,
  selected_fixture_ids: fixtures.map((fixture) => fixture.id),
  bundle_sizes: requestedSizes,
  stopped_early: false,
  runs: []
};

calibration:
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
      const message = error instanceof Error ? error.message : String(error);
      report.runs.push({
        bundle_size: bundleSize,
        bundle_index: Math.floor(index / bundleSize),
        source_ids: sourceIds,
        success: false,
        duration_ms: Date.now() - started,
        error: message
      });

      if (/429|quota|rate.?limit|resource_exhausted/i.test(message)) {
        report.stopped_early = true;
        report.stop_reason = message;
        report.stop_bundle_size = bundleSize;
        report.stop_bundle_index = Math.floor(index / bundleSize);
        break calibration;
      }
    }
  }
}

const outPath = path.join(artifactDir, "coarse-bundle-calibration.json");
await fs.writeFile(outPath, JSON.stringify(report, null, 2));
console.log(`COARSE_BUNDLE_CALIBRATION_WRITTEN ${outPath}`);
console.log(`fixtures=${report.selected_fixture_count}/${report.fixture_count} offset=${report.fixture_offset} sizes=${report.bundle_sizes.join(",")}`);
console.log(`runs=${report.runs.length} success=${report.runs.filter((run) => run.success).length} failed=${report.runs.filter((run) => !run.success).length} stopped_early=${report.stopped_early}`);
