import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) { if (!condition) throw new Error(message); }
const root = process.cwd();
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env: { ...process.env }, encoding: "utf8" });
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);
const outputDir = path.join(root, "desktop-dist");
const indexText = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
const localWorkText = fs.readFileSync(path.join(outputDir, "backend", "local", "local-work-data-provider.js"), "utf8");
const transitionText = fs.readFileSync(path.join(outputDir, "backend", "bridge", "transition-provider.js"), "utf8");
const compilerText = fs.readFileSync(path.join(outputDir, "reference-compiler.js"), "utf8");
const gatewayCoreText = fs.readFileSync(path.join(root, "gateway", "core.ts"), "utf8");

for (const id of ["library-selected-count", "library-compare", "reference-detail-panel", "reference-detail-status", "reference-detail-content", "reference-detail-close", "reference-compare-panel", "reference-compare-status", "reference-compare-count", "reference-compare-content", "reference-compare-clear"]) {
  assert(indexText.includes(`id="${id}"`), `desktop Reference Detail/Compare UI element missing: ${id}`);
}
assert(appText.includes("backend.workData.fetchReferenceDetail(null, workspaceId, sourceId)"), "detail must read Local SQLite without Gateway session");
assert(localWorkText.includes("desktop_local_reference_detail"), "native local detail command missing");
assert(appText.includes("sourceIds.length < 2"), "compare must require at least two selected references");
assert(appText.includes("backend.remoteOperations.compileReferenceWorkflow(null, sourceIds)"), "compare must remain local/session-independent");
assert(transitionText.includes("localWorkData.fetchReferenceDetail(null, workspaceId, sourceId)"), "compare must load selected records from Local SQLite");
assert(transitionText.includes("requireCompiler().compile(records)"), "compare must use local canonical compiler");
assert(transitionText.includes("localWorkData.saveComparisonEntry"), "comparison result must persist to Local SQLite");
assert(transitionText.includes('reference_compare: "local-canonical"'), "local Reference Compare authority marker missing");
assert(transitionText.includes("user_work_data_transport_to_gateway: false"), "Reference work data must not cross Gateway boundary");
assert(transitionText.includes("gateway_requests: 0"), "local compare must expose zero Gateway requests");
assert(compilerText.includes("compareVideoAnalyses"), "canonical compare implementation missing from Desktop bundle");
assert(compilerText.includes("compileEvidenceRules"), "evidence rules implementation missing from Desktop bundle");
assert(compilerText.includes("MASTERV_LOCAL_REFERENCE_COMPILER"), "local compiler export missing");
assert(!gatewayCoreText.includes('url.pathname === "/v1/reference'), "Gateway must not add user work-data routes");
assert(appText.includes("dataset.compareSourceId") && appText.includes("dataset.detailSourceId"), "selection/detail semantics missing");
assert(!appText.includes("localStorage") && !appText.includes("sessionStorage"), "compare/detail must not introduce browser auth persistence");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_REFERENCE_DETAIL_COMPARE_CLEAN_CUT_PASS",
  detail_transport: "local-work-data-provider",
  compare_minimum_selection: 2,
  compare_transport: "local-canonical",
  canonical_compiler_reused: true,
  evidence_rules_reused: true,
  comparison_persistence: "local-sqlite",
  gateway_work_data_routes: 0
}));
