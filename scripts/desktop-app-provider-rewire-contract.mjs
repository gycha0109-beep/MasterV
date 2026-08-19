import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "desktop", "app.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "desktop", "backend", "backend.js"), "utf8");
const workData = fs.readFileSync(path.join(root, "desktop", "backend", "legacy", "supabase-work-data-provider.js"), "utf8");
const remote = fs.readFileSync(path.join(root, "desktop", "backend", "legacy", "hosted-api-client.js"), "utf8");
const persistence = fs.readFileSync(path.join(root, "src-tauri", "src", "local_persistence.rs"), "utf8");

for (const forbidden of ["MASTERV_DESKTOP_CONFIG", "supabase_url", "supabase_publishable_key", "/auth/v1", "/rest/v1", "Authorization", "apikey", "masterv-api-boundary", "masterv-background-batch-boundary"]) {
  assert.equal(app.includes(forbidden), false, `desktop/app.js still owns backend implementation detail: ${forbidden}`);
}
assert.equal(/\bfetch\s*\(/.test(app), false, "desktop/app.js must not issue network fetch directly");
for (const required of [
  "window.MASTERV_BACKEND",
  "backend.session.openSession",
  "backend.session.closeSession",
  "backend.workData.bootstrapPersonalWorkspace",
  "backend.workData.listReferenceLibrary",
  "backend.workData.fetchReferenceDetail",
  "backend.workData.deleteReferenceLibraryEntry",
  "backend.remoteOperations.probeCapabilities",
  "backend.remoteOperations.compileReferenceWorkflow",
  "backend.remoteOperations.discoverYouTube"
]) assert.equal(app.includes(required), true, `desktop/app.js provider delegation missing: ${required}`);

assert.match(backend, /consumer_wired:\s*true/);
assert.match(backend, /migration_stage:\s*"MV-SUPABASE-EXIT-2C"/);
assert.match(backend, /production_ui_cutover_active:\s*true/);
assert.match(backend, /product_authority_active:\s*true/);
assert.match(backend, /supabase_authority_unchanged:\s*false/);
assert.match(backend, /supabase_primary_authority_active:\s*false/);
assert.match(backend, /local_sqlite_authority_active:\s*true/);
assert.match(backend, /gateway_active:\s*true/);
assert.match(backend, /polar_active:\s*true/);
assert.match(backend, /legacy_runtime_scope:\s*"existing-data-migration-only"/);
assert.match(workData, /\/rest\/v1\/masterv_workspace_members/);
assert.match(workData, /\/rest\/v1\/reference_library_entries/);
assert.match(workData, /scope:\s*"0\.1\.2-existing-data-migration-only"/);
assert.match(remote, /masterv-api-boundary/);
assert.match(remote, /operation:\s*"reference_workflow"/);
assert.match(remote, /operation:\s*"youtube_discovery"/);

assert.match(app, /kind:\s*"product_key"/);
assert.match(app, /kind:\s*"resume"/);
assert.equal(app.includes('kind: "email_password"'), false, "visible app consumer must not use normal email/password session");
assert.match(app, /backend\.workData\.migrateLegacyReferenceLibrary\(\{ email, password \}\)/);
assert.match(app, /backend\.workData\.bootstrapPersonalWorkspace\(null\)/);
assert.match(app, /backend\.workData\.listReferenceLibrary\(null, workspaceId/);
assert.match(app, /backend\.remoteOperations\.compileReferenceWorkflow\(null, sourceIds\)/);
assert.match(app, /productKeyInput\.value = ""/);

assert.match(persistence, /product_authority_active:\s*true/);
assert.match(persistence, /supabase_primary_authority_active:\s*false/);
assert.match(persistence, /supabase_fallback_available:\s*true/);

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_contract_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(build.status, 0, `desktop static builder failed: ${build.stderr || build.stdout}`);
const dist = path.join(root, "desktop-dist");
for (const file of [
  "backend/provider-boundary.js",
  "backend/legacy/supabase-session-provider.js",
  "backend/legacy/supabase-work-data-provider.js",
  "backend/legacy/hosted-api-client.js",
  "backend/gateway/gateway-session-provider.js",
  "backend/gateway/gateway-remote-provider.js",
  "backend/local/local-work-data-provider.js",
  "backend/bridge/transition-provider.js",
  "reference-compiler.js",
  "backend/backend.js"
]) assert.equal(fs.existsSync(path.join(dist, file)), true, `desktop-dist backend/runtime asset missing: ${file}`);
const index = fs.readFileSync(path.join(dist, "index.html"), "utf8");
for (const asset of [
  "./backend/provider-boundary.js",
  "./backend/legacy/supabase-session-provider.js",
  "./backend/gateway/gateway-session-provider.js",
  "./backend/local/local-work-data-provider.js",
  "./reference-compiler.js",
  "./backend/bridge/transition-provider.js",
  "./backend/backend.js",
  "./app.js"
]) assert.notEqual(index.indexOf(asset), -1, `runtime provider asset missing: ${asset}`);
assert.ok(index.indexOf("./backend/backend.js") < index.indexOf("./app.js"), "backend composition must load before app.js");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_2_APP_PROVIDER_REWIRE_CONTRACT_PASS",
  app_direct_backend_implementation_details: 0,
  app_direct_network_fetches: 0,
  consumer: "desktop/app.js",
  visible_session: "product-key+device-resume",
  desktop_provider_local_sqlite_authority_active: true,
  native_local_work_data_authority_active: true,
  gateway_active: true,
  polar_active: true,
  legacy_scope: "existing-data-migration-only",
  historical_provider_boundary_preserved: true
}));
