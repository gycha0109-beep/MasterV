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
const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");
for (const id of ["reference-library-panel", "library-status", "library-workspace", "library-count", "reference-library-list", "library-refresh"]) assert(indexText.includes(`id="${id}"`), `desktop Reference Library UI element missing: ${id}`);
assert(indexText.includes("REFERENCE LIBRARY / 보관함"), "desktop Reference Library heading missing");

const projectionBlock = appText.match(/const REFERENCE_LIBRARY_LIST_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
assert(projectionBlock, "Reference Library metadata projection constant missing");
const projection = [...projectionBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const expectedProjection = ["source_id", "canonical_url", "label", "analysis_provenance", "revision", "first_saved_at", "updated_at"];
assert(JSON.stringify(projection) === JSON.stringify(expectedProjection), `unexpected desktop list projection: ${JSON.stringify(projection)}`);
assert(!projection.includes("analysis"), "desktop list projection must not select full analysis JSON");
assert(!projection.includes("analysis_cache_key"), "desktop list projection must not select analysis cache payload metadata unnecessarily");

assert(appText.includes("backend.workData.bootstrapPersonalWorkspace(session)"), "desktop must delegate workspace bootstrap through WorkDataProvider");
assert(appText.includes("backend.workData.listReferenceLibrary("), "desktop must delegate Reference Library list through WorkDataProvider");
assert(appText.includes("backend.workData.deleteReferenceLibraryEntry(session, workspaceId, sourceId)"), "desktop must delegate delete through WorkDataProvider");
assert(!appText.includes("/rest/v1/"), "desktop app consumer must not know PostgREST paths");
assert(!appText.includes("Authorization"), "desktop app consumer must not construct backend auth headers");
assert(workDataText.includes("Authorization: `Bearer ${session.credential}`"), "legacy work-data adapter must retain authenticated access-token transport");
assert(workDataText.includes("`user:${session.subject_id}`"), "legacy personal workspace scope must derive from provider subject id");
assert(workDataText.includes("/rest/v1/masterv_workspace_members"), "legacy adapter must retain workspace bootstrap authority");
assert(workDataText.includes("/rest/v1/reference_library_entries"), "legacy adapter must retain Reference Library REST authority");
assert(workDataText.includes('params.set("order", "updated_at.desc,source_id.asc")'), "legacy adapter Reference Library ordering changed");

const deleteStart = appText.indexOf("async function deleteReferenceLibraryEntry");
const deleteEnd = appText.indexOf("async function connect", deleteStart);
assert(deleteStart >= 0 && deleteEnd > deleteStart, "desktop delete function missing");
const deleteBlock = appText.slice(deleteStart, deleteEnd);
assert(deleteBlock.includes("backend.workData.deleteReferenceLibraryEntry"), "desktop delete must delegate provider mutation");
assert(deleteBlock.includes("await loadReferenceLibrary()"), "desktop delete must converge UI with persisted list state");
const logoutStart = appText.indexOf("async function logout()");
const logoutEnd = appText.indexOf('form.addEventListener("submit"', logoutStart);
assert(logoutStart >= 0 && logoutEnd > logoutStart, "desktop logout function missing");
const logoutBlock = appText.slice(logoutStart, logoutEnd);
assert(logoutBlock.includes("session = null"), "desktop logout must clear in-memory session");
assert(logoutBlock.includes("backend.session.closeSession"), "desktop logout must delegate session close");
assert(logoutBlock.includes("clearReferenceLibraryState()"), "desktop logout must clear Reference Library UI state");
assert(appText.includes("libraryPanel.hidden = true"), "signed-out Reference Library surface must be hidden");
assert(appText.includes("libraryList.replaceChildren()"), "signed-out Reference Library contents must be cleared");
assert(!appText.includes('fetch("/api/'), "desktop Reference Library must not depend on local Next /api routes");
assert(!appText.includes("localStorage"), "desktop Reference Library must not persist auth session in localStorage");
assert(!appText.includes("refresh_token"), "desktop Reference Library must not persist or depend on refresh token storage");
for (const forbidden of ["service_role", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "SUPABASE_TEST_PASSWORD"]) { assert(!appText.includes(forbidden), `desktop app bundle contains forbidden secret marker: ${forbidden}`); assert(!configText.includes(forbidden), `desktop public config contains forbidden secret marker: ${forbidden}`); }

console.log(JSON.stringify({ status: "MASTERV_DESKTOP_REFERENCE_LIBRARY_CONTRACT_PASS", workspace_scope: "authenticated-personal-workspace", metadata_projection: projection, analysis_payload_selected: false, consumer_transport: "work-data-provider", local_next_api_required: false, persistent_auth_storage: false, provider_secrets_embedded: 0 }));
