import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const sessionBridgePath = path.join(root, "desktop", "session-bridge.js");
const app = read("desktop/app.js");
const deep = read("desktop/deep-analysis.js");
const batch = read("desktop/background-batch.js");
const index = read("desktop/index.html");
const buildSource = read("scripts/build-desktop-static.mjs");
const backend = read("desktop/backend/backend.js");
const boundary = read("desktop/backend/provider-boundary.js");
const legacySession = read("desktop/backend/legacy/supabase-session-provider.js");
const persistence = read("src-tauri/src/local_persistence.rs");

assert.equal(fs.existsSync(sessionBridgePath), false, "legacy desktop/session-bridge.js must be removed");
for (const [label, source] of [["desktop index", index], ["desktop builder", buildSource], ["app", app], ["Deep Analysis", deep], ["Background Batch", batch]]) {
  assert.equal(source.includes("session-bridge.js"), false, `${label} still references the removed session bridge`);
  assert.equal(source.includes("MASTERV_SESSION_BRIDGE"), false, `${label} still references the removed session bridge API`);
  assert.equal(source.includes("getAccessToken"), false, `${label} still reads credentials through the removed session bridge`);
}

for (const [label, source] of [["app", app], ["Deep Analysis", deep], ["Background Batch", batch]]) {
  assert.equal(source.includes("/auth/v1/token"), false, `${label} must not observe the legacy auth token endpoint`);
  assert.equal(source.includes("/auth/v1/logout"), false, `${label} must not observe the legacy auth logout endpoint`);
  assert.equal(/window\.fetch\s*=/.test(source), false, `${label} must not monkey-patch window.fetch`);
}

assert.match(boundary, /let activeSession = null/);
assert.match(boundary, /openSession\(credentials\)/);
assert.match(boundary, /closeSession\(sessionToClose = activeSession\)/);
assert.match(boundary, /current\(\)/);
assert.match(boundary, /subscribe\(listener\)/);
assert.match(deep, /backend\.session\.subscribe/);
assert.match(batch, /backend\.session\.subscribe/);
assert.match(backend, /migration_stage:\s*"MV-SUPABASE-EXIT-1B-4"/);
assert.match(backend, /session_bridge_active:\s*false/);
assert.match(backend, /session_credential_observer_active:\s*false/);
assert.match(backend, /fetch_monkey_patch_active:\s*false/);
assert.match(backend, /supabase_authority_unchanged:\s*true/);
assert.match(backend, /local_sqlite_authority_active:\s*false/);
assert.match(legacySession, /\/auth\/v1\/token\?grant_type=password/);
assert.match(legacySession, /access_token/);
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
assert.equal(fs.existsSync(path.join(dist, "session-bridge.js")), false, "desktop-dist must not contain the removed session bridge");
const runtimeIndex = fs.readFileSync(path.join(dist, "index.html"), "utf8");
assert.equal(runtimeIndex.includes("session-bridge.js"), false, "runtime index must not load the removed session bridge");
assert.equal(runtimeIndex.includes("MASTERV_SESSION_BRIDGE"), false, "runtime index must not expose the removed session bridge API");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_4_SESSION_RUNTIME_CLEANUP_CONTRACT_PASS",
  session_bridge_files: 0,
  session_bridge_runtime_references: 0,
  credential_observer_paths: 0,
  fetch_monkey_patches_in_consumers: 0,
  session_runtime_authority: "backend-provider",
  legacy_session_adapter_retained: true,
  product_authority_active: false,
  supabase_authority_unchanged: true
}));
