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
const legacyWorkText = fs.readFileSync(path.join(outputDir, "backend", "legacy", "supabase-work-data-provider.js"), "utf8");
const transitionText = fs.readFileSync(path.join(outputDir, "backend", "bridge", "transition-provider.js"), "utf8");
const configText = fs.readFileSync(path.join(outputDir, "config.js"), "utf8");

for (const id of ["reference-library-panel", "library-status", "library-workspace", "library-count", "reference-library-list", "library-refresh"]) assert(indexText.includes(`id="${id}"`), `desktop Reference Library UI element missing: ${id}`);
assert(indexText.includes("Local SQLite Reference Library"), "desktop Reference Library local-authority heading missing");

const projectionBlock = appText.match(/const REFERENCE_LIBRARY_LIST_PROJECTION\s*=\s*\[([\s\S]*?)\];/);
assert(projectionBlock, "Reference Library metadata projection constant missing");
const projection = [...projectionBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const expectedProjection = ["source_id", "canonical_url", "label", "analysis_provenance", "revision", "first_saved_at", "updated_at"];
assert(JSON.stringify(projection) === JSON.stringify(expectedProjection), `unexpected desktop list projection: ${JSON.stringify(projection)}`);
assert(!projection.includes("analysis"), "desktop list projection must not select full analysis JSON");
assert(!projection.includes("analysis_cache_key"), "desktop list projection must not select analysis cache payload metadata unnecessarily");

assert(appText.includes("backend.workData.bootstrapPersonalWorkspace(null)"), "local workspace bootstrap must not require a paid Gateway session");
assert(appText.includes("backend.workData.listReferenceLibrary(null, workspaceId"), "Reference Library list must remain local and session-independent");
assert(appText.includes("backend.workData.deleteReferenceLibraryEntry(null, workspaceId, sourceId)"), "Reference Library delete must remain local and session-independent");
assert(appText.includes("backend.workData.migrateLegacyReferenceLibrary({ email, password })"), "legacy data recovery must be explicit migration-only action");
assert(!appText.includes("/rest/v1/"), "desktop app consumer must not know PostgREST paths");
assert(!appText.includes("Authorization"), "desktop app consumer must not construct backend auth headers");
assert(!appText.includes('kind: "email_password"'), "visible Desktop entry must not use email/password session");
assert(localWorkText.includes("desktop_local_reference_library_list"), "local work-data adapter list command missing");
assert(localWorkText.includes("desktop_local_reference_detail"), "local work-data adapter detail command missing");
assert(localWorkText.includes("desktop_local_reference_delete"), "local work-data adapter delete command missing");
assert(localWorkText.includes('persistence: "local-sqlite"'), "local work-data persistence authority missing");
assert(transitionText.includes('primary: "local-sqlite"'), "transition work-data primary must be local SQLite");
assert(transitionText.includes('fallback: "none-for-normal-work-data"'), "normal work-data must not silently fall back to Supabase");
assert(transitionText.includes('legacy_scope: "existing-data-migration-only"'), "legacy work-data scope must be migration-only");

assert(legacyWorkText.includes("Authorization: `Bearer ${session.credential}`"), "legacy migration adapter must retain authenticated access-token transport");
assert(legacyWorkText.includes("`user:${session.subject_id}`"), "legacy migration workspace scope must derive from provider subject id");
assert(legacyWorkText.includes("/rest/v1/masterv_workspace_members"), "legacy migration adapter workspace bootstrap missing");
assert(legacyWorkText.includes("/rest/v1/reference_library_entries"), "legacy migration adapter Reference Library read missing");
assert(legacyWorkText.includes("exportReferenceLibraryForMigration"), "legacy migration export contract missing");
assert(legacyWorkText.includes('scope: "0.1.2-existing-data-migration-only"'), "legacy adapter migration-only scope marker missing");

const deleteStart = appText.indexOf("async function deleteReferenceLibraryEntry");
const deleteEnd = appText.indexOf("function renderReferenceComparison", deleteStart);
assert(deleteStart >= 0 && deleteEnd > deleteStart, "desktop local delete function missing");
const deleteBlock = appText.slice(deleteStart, deleteEnd);
assert(deleteBlock.includes("backend.workData.deleteReferenceLibraryEntry"), "desktop delete must delegate provider mutation");
assert(deleteBlock.includes("await loadReferenceLibrary()"), "desktop delete must converge UI with persisted list state");
const logoutStart = appText.indexOf("async function logout()");
const logoutEnd = appText.indexOf("async function tryDeviceResume", logoutStart);
assert(logoutStart >= 0 && logoutEnd > logoutStart, "desktop logout function missing");
const logoutBlock = appText.slice(logoutStart, logoutEnd);
assert(logoutBlock.includes("session = null"), "desktop logout must clear in-memory Gateway session");
assert(logoutBlock.includes("backend.session.closeSession"), "desktop logout must delegate Gateway session close");
assert(!logoutBlock.includes("workspaceId = null"), "Gateway logout must not revoke local workspace authority");
assert(!logoutBlock.includes("libraryPanel.hidden = true"), "Gateway logout must not hide local Reference Library");
assert(!appText.includes('fetch("/api/'), "desktop Reference Library must not depend on local Next /api routes");
assert(!appText.includes("localStorage"), "desktop Reference Library must not persist auth session in localStorage");
assert(!appText.includes("refresh_token"), "desktop Reference Library must not persist or depend on refresh token storage");
for (const forbidden of ["service_role", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "SUPABASE_TEST_PASSWORD"]) { assert(!appText.includes(forbidden), `desktop app bundle contains forbidden secret marker: ${forbidden}`); assert(!configText.includes(forbidden), `desktop public config contains forbidden secret marker: ${forbidden}`); }

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_REFERENCE_LIBRARY_CONTRACT_PASS",
  workspace_scope: "local:masterv",
  authority: "local-sqlite",
  local_access_subscription_gated: false,
  metadata_projection: projection,
  analysis_payload_selected: false,
  consumer_transport: "local-work-data-provider",
  legacy_scope: "existing-data-migration-only",
  local_next_api_required: false,
  persistent_auth_storage: false,
  provider_secrets_embedded: 0
}));
