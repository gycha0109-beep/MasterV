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
const workDataText = fs.readFileSync(path.join(outputDir, "backend", "legacy", "supabase-work-data-provider.js"), "utf8");
const remoteText = fs.readFileSync(path.join(outputDir, "backend", "legacy", "hosted-api-client.js"), "utf8");
const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");
for (const id of ["library-selected-count","library-compare","reference-detail-panel","reference-detail-status","reference-detail-content","reference-detail-close","reference-compare-panel","reference-compare-status","reference-compare-count","reference-compare-content","reference-compare-clear"]) assert(indexText.includes(`id="${id}"`), `desktop 3E UI element missing: ${id}`);

const listProjectionBlock = appText.match(/const REFERENCE_LIBRARY_LIST_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
const detailProjectionBlock = appText.match(/const REFERENCE_LIBRARY_DETAIL_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
assert(listProjectionBlock && detailProjectionBlock, "Reference Library projection constants missing");
const projectionValues = (block) => [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const listProjection = projectionValues(listProjectionBlock), detailProjection = projectionValues(detailProjectionBlock);
assert(!listProjection.includes("analysis"), "desktop list must remain metadata-only");
assert(detailProjection.includes("analysis") && detailProjection.filter((f) => f === "analysis").length === 1, "desktop detail must select analysis exactly once");
assert(!detailProjection.includes("analysis_cache_key"), "detail surface must not load analysis cache key");

const detailStart = appText.indexOf("async function loadReferenceDetail");
const detailEnd = appText.indexOf("function renderReferenceComparison", detailStart);
assert(detailStart >= 0 && detailEnd > detailStart, "loadReferenceDetail function missing");
const detailBlock = appText.slice(detailStart, detailEnd);
assert(detailBlock.includes("backend.workData.fetchReferenceDetail("), "detail must delegate persisted read through WorkDataProvider");
assert(detailBlock.includes("REFERENCE_LIBRARY_DETAIL_PROJECTION"), "detail must preserve bounded detail projection");
assert(!detailBlock.includes("/rest/v1/"), "detail consumer must not know PostgREST path");
assert(workDataText.includes('params.set("workspace_id"') && workDataText.includes('params.set("source_id"') && workDataText.includes('params.set("limit", "1")'), "legacy detail adapter scope changed");
assert(workDataText.includes("/rest/v1/reference_library_entries"), "legacy detail persisted authority missing");

const compareStart = appText.indexOf("async function loadReferenceComparison");
const compareEnd = appText.indexOf("async function deleteReferenceLibraryEntry", compareStart);
assert(compareStart >= 0 && compareEnd > compareStart, "loadReferenceComparison function missing");
const compareBlock = appText.slice(compareStart, compareEnd);
assert(compareBlock.includes("sourceIds.length < 2"), "compare surface must require at least two selected references");
assert(compareBlock.includes("backend.remoteOperations.compileReferenceWorkflow(session, sourceIds)"), "compare surface must use RemoteOperationClient");
assert(!compareBlock.includes("fetchReferenceDetail"), "compare must not repurpose detail raw-analysis transport");
assert(remoteText.includes('operation: "reference_workflow"'), "legacy hosted adapter must retain canonical reference operation");
assert(!appText.includes("compareVideoAnalyses("), "canonical aggregate comparison compiler must not be duplicated into static desktop app");
assert(appText.includes("dataset.compareSourceId") && appText.includes("dataset.detailSourceId"), "desktop selection/detail semantics missing");
assert(appText.includes("clearReferenceDetailState()") && appText.includes("clearReferenceCompareState"), "desktop clear semantics missing");
const logoutStart = appText.indexOf("async function logout()"), logoutEnd = appText.indexOf('form.addEventListener("submit"', logoutStart);
const logoutBlock = appText.slice(logoutStart, logoutEnd);
assert(logoutStart >= 0 && logoutEnd > logoutStart && logoutBlock.includes("clearReferenceLibraryState()"), "logout must clear list/detail/compare state");
assert(appText.includes("detailPanel.hidden = true") && appText.includes("comparePanel.hidden = true"), "detail/compare surface clear semantics missing");
assert(!appText.includes('fetch("/api/') && !appText.includes("localStorage") && !appText.includes("refresh_token"), "desktop 3E regression boundary violated");
for (const forbidden of ["service_role","GEMINI_API_KEY","YOUTUBE_DATA_API_KEY","SUPABASE_TEST_PASSWORD"]) { assert(!appText.includes(forbidden), `desktop app bundle contains forbidden secret marker: ${forbidden}`); assert(!configText.includes(forbidden), `desktop public config contains forbidden secret marker: ${forbidden}`); }
console.log(JSON.stringify({ status: "MASTERV_DESKTOP_REFERENCE_DETAIL_COMPARE_CONTRACT_PASS", list_projection_metadata_only: true, detail_projection: detailProjection, detail_transport: "work-data-provider", detail_lazy_load: true, compare_minimum_selection: 2, compare_transport: "remote-operation-provider", aggregate_compare_compiler_copied_to_desktop: false, local_next_api_required: false, provider_secrets_embedded: 0 }));
