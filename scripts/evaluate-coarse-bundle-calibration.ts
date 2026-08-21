import fs from "node:fs/promises";
import path from "node:path";
import type { CoarseVideoAnalysis } from "../lib/tiered-analysis";

type CalibrationRun = {
  bundle_size: number;
  bundle_index: number;
  source_ids: string[];
  success: boolean;
  duration_ms: number;
  analyses?: CoarseVideoAnalysis[];
  error?: string;
};

type CalibrationReport = {
  model: string;
  fixture_count: number;
  selected_fixture_count: number;
  selected_fixture_ids: string[];
  bundle_sizes: number[];
  stopped_early: boolean;
  stop_reason?: string;
  runs: CalibrationRun[];
};

type SourceComparison = {
  bundle_size: number;
  bundle_index: number;
  source_id: string;
  delivery_mode_match: boolean;
  cta_match: boolean;
  direct_demo_match: boolean;
  multi_product_match: boolean;
  product_first_seen_abs_error: number | null;
  product_first_seen_null_mismatch: boolean;
  hook_exact_match: boolean;
  hook_token_jaccard: number;
  rough_structure_token_jaccard: number;
  changed_fields: string[];
  neighbor_match_shifts: Array<{
    field: string;
    bundled_value: string | boolean;
    neighbor_source_id: string;
  }>;
};

type SizeSummary = {
  bundle_size: number;
  successful_runs: number;
  failed_runs: number;
  compared_sources: number;
  delivery_mode_agreement: number | null;
  cta_agreement: number | null;
  direct_demo_agreement: number | null;
  multi_product_agreement: number | null;
  product_first_seen_comparable: number;
  product_first_seen_mae: number | null;
  product_first_seen_null_mismatch_count: number;
  hook_exact_agreement: number | null;
  hook_token_jaccard_avg: number | null;
  rough_structure_token_jaccard_avg: number | null;
  neighbor_match_shift_count: number;
};

const comparableFields = [
  "primary_delivery_mode",
  "cta_present",
  "direct_demo_present",
  "multi_product",
  "hook_type",
  "dominant_visual_source"
] as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value: string) {
  const normalized = normalizeText(value);
  return new Set(normalized ? normalized.split(" ") : []);
}

function jaccard(left: string, right: string) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function mean(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function agreement(values: boolean[]) {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length;
}

function fieldValue(analysis: CoarseVideoAnalysis, field: typeof comparableFields[number]) {
  const value = analysis[field];
  return typeof value === "string" ? normalizeText(value) : value;
}

function compareSource(
  run: CalibrationRun,
  source: CoarseVideoAnalysis,
  baseline: CoarseVideoAnalysis,
  baselines: Map<string, CoarseVideoAnalysis>
): SourceComparison {
  const changedFields: string[] = [];
  const neighborMatchShifts: SourceComparison["neighbor_match_shifts"] = [];

  for (const field of comparableFields) {
    const bundledValue = fieldValue(source, field);
    const baselineValue = fieldValue(baseline, field);
    if (bundledValue === baselineValue) continue;
    changedFields.push(field);

    for (const neighborId of run.source_ids) {
      if (neighborId === source.source_id) continue;
      const neighbor = baselines.get(neighborId);
      if (!neighbor) continue;
      const neighborValue = fieldValue(neighbor, field);
      if (bundledValue === neighborValue && baselineValue !== neighborValue) {
        neighborMatchShifts.push({
          field,
          bundled_value: bundledValue,
          neighbor_source_id: neighborId
        });
        break;
      }
    }
  }

  const baselineFirstSeen = baseline.product_first_seen_seconds;
  const bundledFirstSeen = source.product_first_seen_seconds;
  const firstSeenComparable = baselineFirstSeen !== null && bundledFirstSeen !== null;

  if (baselineFirstSeen !== bundledFirstSeen) changedFields.push("product_first_seen_seconds");

  return {
    bundle_size: run.bundle_size,
    bundle_index: run.bundle_index,
    source_id: source.source_id,
    delivery_mode_match: source.primary_delivery_mode === baseline.primary_delivery_mode,
    cta_match: source.cta_present === baseline.cta_present,
    direct_demo_match: source.direct_demo_present === baseline.direct_demo_present,
    multi_product_match: source.multi_product === baseline.multi_product,
    product_first_seen_abs_error: firstSeenComparable
      ? Math.abs(bundledFirstSeen - baselineFirstSeen)
      : null,
    product_first_seen_null_mismatch: (baselineFirstSeen === null) !== (bundledFirstSeen === null),
    hook_exact_match: normalizeText(source.hook_type) === normalizeText(baseline.hook_type),
    hook_token_jaccard: jaccard(source.hook_type, baseline.hook_type),
    rough_structure_token_jaccard: jaccard(source.rough_structure.join(" "), baseline.rough_structure.join(" ")),
    changed_fields: [...new Set(changedFields)],
    neighbor_match_shifts: neighborMatchShifts
  };
}

async function main() {
  const artifactDir = path.join(process.cwd(), "artifacts");
  const inputPath = process.env.CALIBRATION_ARTIFACT || path.join(artifactDir, "coarse-bundle-calibration.json");
  const outputPath = process.env.CALIBRATION_EVALUATION_ARTIFACT || path.join(artifactDir, "coarse-bundle-calibration-evaluation.json");
  const report = JSON.parse(await fs.readFile(inputPath, "utf8")) as CalibrationReport;

  const baselines = new Map<string, CoarseVideoAnalysis>();
  for (const run of report.runs) {
    if (run.bundle_size !== 1 || !run.success || !Array.isArray(run.analyses) || run.analyses.length !== 1) continue;
    baselines.set(run.analyses[0].source_id, run.analyses[0]);
  }

  const comparisons: SourceComparison[] = [];
  const missingBaselines = new Set<string>();

  for (const run of report.runs) {
    if (run.bundle_size <= 1 || !run.success || !Array.isArray(run.analyses)) continue;
    for (const source of run.analyses) {
      const baseline = baselines.get(source.source_id);
      if (!baseline) {
        missingBaselines.add(source.source_id);
        continue;
      }
      comparisons.push(compareSource(run, source, baseline, baselines));
    }
  }

  const evaluatedSizes = [...new Set(report.bundle_sizes.filter((size) => size > 1))];
  const summaries: SizeSummary[] = evaluatedSizes.map((bundleSize) => {
    const sizeComparisons = comparisons.filter((item) => item.bundle_size === bundleSize);
    const sizeRuns = report.runs.filter((run) => run.bundle_size === bundleSize);
    const firstSeenErrors = sizeComparisons
      .map((item) => item.product_first_seen_abs_error)
      .filter((value): value is number => value !== null);

    return {
      bundle_size: bundleSize,
      successful_runs: sizeRuns.filter((run) => run.success).length,
      failed_runs: sizeRuns.filter((run) => !run.success).length,
      compared_sources: sizeComparisons.length,
      delivery_mode_agreement: agreement(sizeComparisons.map((item) => item.delivery_mode_match)),
      cta_agreement: agreement(sizeComparisons.map((item) => item.cta_match)),
      direct_demo_agreement: agreement(sizeComparisons.map((item) => item.direct_demo_match)),
      multi_product_agreement: agreement(sizeComparisons.map((item) => item.multi_product_match)),
      product_first_seen_comparable: firstSeenErrors.length,
      product_first_seen_mae: mean(firstSeenErrors),
      product_first_seen_null_mismatch_count: sizeComparisons.filter((item) => item.product_first_seen_null_mismatch).length,
      hook_exact_agreement: agreement(sizeComparisons.map((item) => item.hook_exact_match)),
      hook_token_jaccard_avg: mean(sizeComparisons.map((item) => item.hook_token_jaccard)),
      rough_structure_token_jaccard_avg: mean(sizeComparisons.map((item) => item.rough_structure_token_jaccard)),
      neighbor_match_shift_count: sizeComparisons.reduce((sum, item) => sum + item.neighbor_match_shifts.length, 0)
    };
  });

  const evaluation = {
    generated_at: new Date().toISOString(),
    model: report.model,
    fixture_count: report.fixture_count,
    selected_fixture_count: report.selected_fixture_count,
    selected_fixture_ids: report.selected_fixture_ids,
    baseline_count: baselines.size,
    stopped_early: report.stopped_early,
    stop_reason: report.stop_reason,
    missing_baselines: [...missingBaselines],
    summaries,
    bleed_signals: comparisons.filter((item) => item.neighbor_match_shifts.length > 0),
    comparisons,
    notes: [
      "neighbor_match_shifts는 bundled 값이 자기 baseline과 달라지고 같은 bundle의 다른 source baseline 값과 같아진 경우를 잡는 휴리스틱이다. bleed의 확정 판정이 아니라 수동 검토 우선순위다.",
      "hook_type과 rough_structure는 자유 텍스트이므로 exact agreement만으로 품질을 판정하지 않고 token Jaccard와 원문 비교를 함께 사용한다.",
      "source_id 누락/중복/unknown은 coarse analyzer validation에서 성공 run 전에 거부된다."
    ]
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(evaluation, null, 2));
  console.log(`COARSE_BUNDLE_CALIBRATION_EVALUATION_WRITTEN ${outputPath}`);
  for (const summary of summaries) {
    console.log(
      `size=${summary.bundle_size} compared=${summary.compared_sources} delivery=${summary.delivery_mode_agreement ?? "n/a"} cta=${summary.cta_agreement ?? "n/a"} firstSeenMAE=${summary.product_first_seen_mae ?? "n/a"} bleedSignals=${summary.neighbor_match_shift_count}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
