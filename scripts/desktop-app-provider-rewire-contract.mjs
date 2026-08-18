import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "desktop", "app.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "desktop", "backend", "backend.js"), "utf8");
const workData = fs.readFileSync(path.join(root, "desktop", "backend", "legacy", "supabase-work-data-provider.js"), "utf8");
const remote = fs.readFileSync(path.join(root, "desktop", "backend", "legacy", "hosted-api-client.js"), "utf8");
const deep = fs.readFileSync(path.join(root, "desktop", "deep-analysis.js"), "utf8");
const batch = fs.readFileSync(path.join(root, "desktop", "background-batch.js"), "utf8");
const persistence = fs.readFileSync(path.join(root, "src-tauri", "src", "local_persistence.rs"), "utf8");

for (const forbidden of ["MASTERV_DESKTOP_CONFIG", "supabase_url", "supabase_publishable_key", "/auth/v1", "/rest/v1", "Authorization", "apikey", "masterv-api-boundary", "masterv-background-batch-boundary"]) assert.equal(app.includes(forbidden), false, `desktop/app.js still owns backend implementation detail: ${forbidden}`);
assert.equal(/\bfetch\s*\(/.test(app), false, "desktop/app.js must not issue network fetch directly");
for (const required of [
  "window.MASTERV_BACKEND",
  "backend.configured()",
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

assert.match(backend, /migration_stage:\s*"MV-SUPABASE-EXIT-1B-2"/);
assert.match(backend, /consumer_wired:\s*true/);
assert.match(backend, /consumer_scope:\s*"desktop\/app\.js"/);
assert.match(backend, /deep_analysis_consumer_wired:\s*false/);
assert.match(backend, /background_batch_consumer_wired:\s*false/);
assert.match(backend, /supabase_authority_unchanged:\s*true/);
assert.match(backend, /local_sqlite_authority_active:\s*false/);
assert.match(backend, /gateway_active:\s*false/);
assert.match(backend, /polar_active:\s*false/);
assert.match(workData, /\/rest\/v1\/masterv_workspace_members/);
assert.match(workData, /\/rest\/v1\/reference_library_entries/);
assert.match(remote, /masterv-api-boundary/);
assert.match(remote, /operation:\s*"reference_workflow"/);
assert.match(remote, /operation:\s*"youtube_discovery"/);
assert.match(deep, /supabase_publishable_key/);
assert.match(deep, /window\.fetch\s*=\s*async function masterVDesktopFetch/);
assert.match(batch, /supabase_publishable_key/);
assert.match(batch, /window\.fetch\s*=\s*async function masterVBackgroundBatchFetch/);
assert.match(persistence, /product_authority_active:\s*false/);
assert.match(persistence, /supabase_authority_unchanged:\s*true/);

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
for (const file of ["backend/provider-boundary.js", "backend/legacy/supabase-session-provider.js", "backend/legacy/supabase-work-data-provider.js", "backend/legacy/hosted-api-client.js", "backend/backend.js"]) assert.equal(fs.existsSync(path.join(dist, file)), true, `desktop-dist backend asset missing: ${file}`);
const index = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const order = ["./deep-analysis.js", "./background-batch.js", "./backend/provider-boundary.js", "./backend/legacy/supabase-session-provider.js", "./backend/legacy/supabase-work-data-provider.js", "./backend/legacy/hosted-api-client.js", "./backend/backend.js", "./app.js"].map((needle) => index.indexOf(needle));
assert.equal(order.every((value) => value >= 0), true, `runtime provider script missing: ${JSON.stringify(order)}`);
for (let i = 1; i < order.length; i += 1) assert.equal(order[i] > order[i - 1], true, "runtime provider script order must preserve legacy fetch-wrapper compatibility");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_2_APP_PROVIDER_REWIRE_CONTRACT_PASS",
  app_direct_backend_implementation_details: 0,
  app_direct_network_fetches: 0,
  consumer: "desktop/app.js",
  deep_analysis_consumer_wired: false,
  background_batch_consumer_wired: false,
  product_authority_active: false,
  supabase_authority_unchanged: true
}));
