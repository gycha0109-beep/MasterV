import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_contract_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};

const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], {
  cwd: root,
  env,
  encoding: "utf8"
});
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);

const outputDir = path.join(root, "desktop-dist");
const indexText = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
const appText = fs.readFileSync(path.join(outputDir, "app.js"), "utf8");
const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");

for (const id of [
  "library-selected-count",
  "library-compare",
  "reference-detail-panel",
  "reference-detail-status",
  "reference-detail-content",
  "reference-detail-close",
  "reference-compare-panel",
  "reference-compare-status",
  "reference-compare-count",
  "reference-compare-content",
  "reference-compare-clear"
]) {
  assert(indexText.includes(`id="${id}"`), `desktop 3E UI element missing: ${id}`);
}

const listProjectionBlock = appText.match(/const REFERENCE_LIBRARY_LIST_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
const detailProjectionBlock = appText.match(/const REFERENCE_LIBRARY_DETAIL_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
assert(listProjectionBlock, "Reference Library list projection missing");
assert(detailProjectionBlock, "Reference Library detail projection missing");

const projectionValues = (block) => [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const listProjection = projectionValues(listProjectionBlock);
const detailProjection = projectionValues(detailProjectionBlock);

assert(!listProjection.includes("analysis"), "desktop list must remain metadata-only");
assert(detailProjection.includes("analysis"), "desktop detail must explicitly select persisted analysis");
assert(detailProjection.filter((field) => field === "analysis").length === 1, "detail projection must select analysis exactly once");
assert(!detailProjection.includes("analysis_cache_key"), "detail surface must not load analysis cache key unnecessarily");

const detailStart = appText.indexOf("async function fetchReferenceDetail");
const detailEnd = appText.indexOf("async function loadReferenceLibrary", detailStart);
assert(detailStart >= 0 && detailEnd > detailStart, "fetchReferenceDetail function missing");
const detailBlock = appText.slice(detailStart, detailEnd);
assert(detailBlock.includes('params.set("workspace_id"'), "detail fetch must scope by workspace_id");
assert(detailBlock.includes('params.set("source_id"'), "detail fetch must scope by source_id");
assert(detailBlock.includes('params.set("limit", "1")'), "detail fetch must be bounded to one record");
assert(detailBlock.includes("REFERENCE_LIBRARY_DETAIL_PROJECTION.join"), "detail fetch must use explicit detail projection");
assert(detailBlock.includes("/rest/v1/reference_library_entries"), "detail fetch must use Supabase RLS authority");

const compareStart = appText.indexOf("async function loadReferenceComparison");
const compareEnd = appText.indexOf("async function deleteReferenceLibraryEntry", compareStart);
assert(compareStart >= 0 && compareEnd > compareStart, "loadReferenceComparison function missing");
const compareBlock = appText.slice(compareStart, compareEnd);
assert(compareBlock.includes("sourceIds.length < 2"), "compare surface must require at least two selected references");
assert(compareBlock.includes("Promise.all"), "compare surface must lazy-load only selected references");
assert(compareBlock.includes("fetchReferenceDetail"), "compare surface must reuse scoped detail fetch");
assert(!appText.includes("compareVideoAnalyses("), "canonical aggregate comparison compiler must not be duplicated into static desktop app");

assert(appText.includes("dataset.compareSourceId"), "desktop compare selection semantics missing");
assert(appText.includes("dataset.detailSourceId"), "desktop detail action semantics missing");
assert(appText.includes("clearReferenceDetailState()"), "desktop detail clear semantics missing");
assert(appText.includes("clearReferenceCompareState"), "desktop compare clear semantics missing");

const logoutStart = appText.indexOf("function logout()");
const logoutEnd = appText.indexOf('form.addEventListener("submit"', logoutStart);
assert(logoutStart >= 0 && logoutEnd > logoutStart, "desktop logout function missing");
const logoutBlock = appText.slice(logoutStart, logoutEnd);
assert(logoutBlock.includes("clearReferenceLibraryState()"), "logout must clear list/detail/compare state");
assert(appText.includes("detailPanel.hidden = true"), "detail surface must be hidden when cleared");
assert(appText.includes("comparePanel.hidden = true"), "compare surface must be hidden when cleared");

assert(!appText.includes('fetch("/api/'), "desktop 3E must not depend on local Next /api routes");
assert(!appText.includes("localStorage"), "desktop 3E must not persist auth in localStorage");
assert(!appText.includes("refresh_token"), "desktop 3E must not persist or depend on refresh token storage");

for (const forbidden of ["service_role", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "SUPABASE_TEST_PASSWORD"]) {
  assert(!appText.includes(forbidden), `desktop app bundle contains forbidden secret marker: ${forbidden}`);
  assert(!configText.includes(forbidden), `desktop public config contains forbidden secret marker: ${forbidden}`);
}

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_REFERENCE_DETAIL_COMPARE_CONTRACT_PASS",
  list_projection_metadata_only: true,
  detail_projection: detailProjection,
  detail_fetch_scope: ["workspace_id", "source_id"],
  detail_lazy_load: true,
  compare_minimum_selection: 2,
  aggregate_compare_compiler_migrated: false,
  local_next_api_required: false,
  provider_secrets_embedded: 0
}));
