import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) { if (!condition) throw new Error(message); }
const root = process.cwd();
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_contract_fixture", NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1", MASTERV_DESKTOP_REQUIRE_CONFIG: "1" };
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);
const outputDir = path.join(root, "desktop-dist");
const indexText = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
const localWorkText = fs.readFileSync(path.join(outputDir, "backend", "local", "local-work-data-provider.js"), "utf8");
const transitionText = fs.readFileSync(path.join(outputDir, "backend", "bridge", "transition-provider.js"), "utf8");
const compilerText = fs.readFileSync(path.join(outputDir, "reference-compiler.js"), "utf8");
const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");
const gatewayCoreText = fs.readFileSync(path.join(root, "gateway", "core.ts"), "utf8");

for (const id of ["library-selected-count","library-compare","reference-detail-panel","reference-detail-status","reference-detail-content","reference-detail-close","reference-compare-panel","reference-compare-status","reference-compare-count","reference-compare-content","reference-compare-clear"]) assert(indexText.includes(`id="${id}"`), `desktop Reference Detail/Compare UI element missing: ${id}`);

const listProjectionBlock = appText.match(/const REFERENCE_LIBRARY_LIST_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
const detailProjectionBlock = appText.match(/const REFERENCE_LIBRARY_DETAIL_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
assert(listProjectionBlock && detailProjectionBlock, "Reference Library projection constants missing");
const projectionValues = (block) => [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const listProjection = projectionValues(listProjectionBlock), detailProjection = projectionValues(detailProjectionBlock);
assert(!listProjection.includes("analysis"), "desktop list must remain metadata-only");
assert(detailProjection.includes("analysis") && detailProjection.filter((field) => field === "analysis").length === 1, "desktop detail must load analysis exactly once");
assert(!detailProjection.includes("analysis_cache_key"), "detail surface must not load analysis cache key");

const detailStart = appText.indexOf("async function loadReferenceDetail");
const detailEnd = appText.indexOf("async function deleteReferenceLibraryEntry", detailStart);
assert(detailStart >= 0 && detailEnd > detailStart, "loadReferenceDetail function missing");
const detailBlock = appText.slice(detailStart, detailEnd);
assert(detailBlock.includes("backend.workData.fetchReferenceDetail(null, workspaceId, sourceId"), "detail must read Local SQLite without Gateway session");
assert(detailBlock.includes("REFERENCE_LIBRARY_DETAIL_PROJECTION"), "detail must preserve bounded detail projection");
assert(!detailBlock.includes("/rest/v1/"), "detail consumer must not know PostgREST path");
assert(localWorkText.includes("desktop_local_reference_detail"), "local detail native command missing");

const compareStart = appText.indexOf("async function loadReferenceComparison");
const compareEnd = appText.indexOf("function renderDiscoveryCandidates", compareStart);
assert(compareStart >= 0 && compareEnd > compareStart, "loadReferenceComparison function missing");
const compareBlock = appText.slice(compareStart, compareEnd);
assert(compareBlock.includes("sourceIds.length < 2"), "compare surface must require at least two selected references");
assert(compareBlock.includes("backend.remoteOperations.compileReferenceWorkflow(null, sourceIds)"), "compare surface must remain session-independent/local");
assert(transitionText.includes("localWorkData.fetchReferenceDetail(null, workspaceId, sourceId)"), "transition compare must load selected analysis from SQLite");
assert(transitionText.includes("requireCompiler().compile(records)"), "transition compare must use local canonical compiler");
assert(transitionText.includes("localWorkData.saveComparisonEntry"), "comparison result must persist to SQLite");
assert(transitionText.includes('reference_compare: "local-canonical"'), "Reference Compare authority marker missing");
assert(transitionText.includes("user_work_data_transport_to_gateway: false"), "Reference work data must not cross Gateway boundary");
assert(transitionText.includes("gateway_requests: 0"), "local Reference Compare must expose zero Gateway request evidence");
assert(compilerText.includes("compareVideoAnalyses"), "canonical aggregate compiler missing from Desktop bundle");
assert(compilerText.includes("compileEvidenceRules"), "canonical evidence-rule compiler missing from Desktop bundle");
assert(compilerText.includes("MASTERV_LOCAL_REFERENCE_COMPILER"), "Desktop canonical compiler export missing");
assert(!gatewayCoreText.includes('url.pathname === "/v1/reference'), "Gateway must not add a Reference Library/Compare work-data route");
assert(appText.includes("dataset.compareSourceId") && appText.includes("dataset.detailSourceId"), "desktop selection/detail semantics missing");
assert(appText.includes("clearReferenceDetailState()") && appText.includes("clearReferenceCompareState"), "desktop clear semantics missing");
assert(appText.includes("detailPanel.hidden = true") && appText.includes("comparePanel.hidden = true"), "detail/compare surface clear semantics missing");
assert(!appText.includes('fetch("/api/') && !appText.includes("localStorage") && !appText.includes("refresh_token"), "desktop Reference Detail/Compare boundary violated");
for (const forbidden of ["service_role","GEMINI_API_KEY","YOUTUBE_DATA_API_KEY","SUPABASE_TEST_PASSWORD"]) { assert(!appText.includes(forbidden), `desktop app bundle contains forbidden secret marker: ${forbidden}`); assert(!configText.includes(forbidden), `desktop public config contains forbidden secret marker: ${forbidden}`); }

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_REFERENCE_DETAIL_COMPARE_CONTRACT_PASS",
  list_projection_metadata_only: true,
  detail_projection: detailProjection,
  detail_transport: "local-work-data-provider",
  detail_lazy_load: true,
  compare_minimum_selection: 2,
  compare_transport: "local-canonical",
  canonical_compiler_reused: true,
  evidence_rules_reused: true,
  comparison_persistence: "local-sqlite",
  gateway_work_data_routes: 0,
  local_next_api_required: false,
  provider_secrets_embedded: 0
}));
