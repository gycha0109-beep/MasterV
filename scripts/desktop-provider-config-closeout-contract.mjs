import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const desktopRoot = path.join(root, "desktop");
const legacyDir = path.join(desktopRoot, "backend", "legacy");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}
function rel(file) { return path.relative(root, file).split(path.sep).join("/"); }

const allowedLegacyRuntimeFiles = new Set([
  "desktop/backend/legacy/hosted-api-client.js",
  "desktop/backend/legacy/supabase-session-provider.js",
  "desktop/backend/legacy/supabase-work-data-provider.js"
]);
const actualLegacyFiles = walk(legacyDir).filter((file) => file.endsWith(".js")).map(rel).sort();
assert.deepEqual(actualLegacyFiles, [...allowedLegacyRuntimeFiles].sort(), "legacy Desktop runtime allowlist drifted");

const runtimeFiles = walk(desktopRoot).filter((file) => /\.(?:js|html)$/i.test(file)).map((file) => ({ file, relative: rel(file), source: fs.readFileSync(file, "utf8") }));
const genericRuntime = runtimeFiles.filter(({ relative }) => !allowedLegacyRuntimeFiles.has(relative));
const forbiddenGenericTokens = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "supabase_url", "supabase_publishable_key",
  ".supabase.co", "/auth/v1", "/rest/v1", "/functions/v1", "MASTERV_SESSION_BRIDGE", "getAccessToken", "session-bridge.js"
];
for (const { relative, source } of genericRuntime) {
  for (const token of forbiddenGenericTokens) assert.equal(source.includes(token), false, `${relative} contains forbidden generic runtime coupling: ${token}`);
  if (relative.endsWith(".js")) {
    assert.equal(/\bfetch\s*\(/.test(source), false, `${relative} performs direct network fetch outside legacy adapters`);
    assert.equal(/window\.fetch\s*=/.test(source), false, `${relative} monkey-patches window.fetch`);
  }
}
assert.equal(fs.existsSync(path.join(desktopRoot, "session-bridge.js")), false, "removed desktop/session-bridge.js reappeared");

const backend = read("desktop/backend/backend.js");
const boundary = read("desktop/backend/provider-boundary.js");
const app = read("desktop/app.js");
const deep = read("desktop/deep-analysis.js");
const batch = read("desktop/background-batch.js");
const updaterUi = read("desktop/updater.js");
const builder = read("scripts/build-desktop-static.mjs");
const bridge = read("scripts/desktop-legacy-config-bridge.mjs");
const updaterPrepare = read("scripts/prepare-desktop-updater-bootstrap.mjs");
const nativeUpdater = read("src-tauri/src/updater.rs");
const updaterBootstrap = JSON.parse(read("src-tauri/tauri.windows-updater-bootstrap.conf.json"));
const persistence = read("src-tauri/src/local_persistence.rs");
const transition = read("desktop/backend/bridge/transition-provider.js");

for (const token of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "supabase_url", "supabase_publishable_key"]) {
  assert.equal(builder.includes(token), false, `generic builder owns vendor config detail: ${token}`);
  assert.equal(updaterPrepare.includes(token), false, `updater preparation owns vendor config detail: ${token}`);
}
for (const token of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_MASTERV_API_BASE_URL", "supabase_url", "supabase_publishable_key", "api_base_url"]) assert.equal(bridge.includes(token), true, `legacy config bridge lost transitional mapping: ${token}`);

assert.equal(backend.includes("window.MASTERV_DESKTOP_CONFIG"), false, "backend composition depends on generic Desktop config");
assert.equal(backend.includes("window.MASTERV_LEGACY_RUNTIME_CONFIG"), true, "backend composition does not consume isolated legacy runtime config");
assert.match(backend, /migration_stage:\s*"MV-SUPABASE-EXIT-2C"/);
assert.match(backend, /desktop_config_vendor_neutral:\s*true/);
assert.match(backend, /legacy_runtime_config_isolated:\s*true/);
assert.match(backend, /session_bridge_active:\s*false/);
assert.match(backend, /session_credential_observer_active:\s*false/);
assert.match(backend, /fetch_monkey_patch_active:\s*false/);
assert.match(backend, /legacy_authority_unchanged:\s*false/);
assert.match(backend, /supabase_authority_unchanged:\s*false/);
assert.match(backend, /local_sqlite_authority_active:\s*true/);
assert.match(backend, /gateway_active:\s*true/);
assert.match(backend, /polar_active:\s*true/);
assert.match(backend, /legacy_runtime_scope:\s*"existing-data-migration-only"/);
assert.match(transition, /user_work_data_transport_to_gateway:\s*false/);
assert.match(transition, /reference_compare:\s*"local-canonical"/);

for (const [label, source] of [["app", app], ["deep", deep], ["batch", batch], ["updater", updaterUi], ["boundary", boundary]]) assert.equal(/\bfetch\s*\(/.test(source), false, `${label} bypasses its authority boundary with direct fetch`);
assert.match(deep, /backend\.session\.subscribe/);
assert.match(batch, /backend\.session\.subscribe/);
assert.equal(updaterUi.includes("backend.session"), false, "EXIT-1E updater must not consume backend session authority");
assert.equal(updaterUi.includes("window.MASTERV_BACKEND"), false, "EXIT-1E updater must not consume backend provider authority");
assert.equal(updaterUi.includes("window.MASTERV_UPDATER_CONFIG"), true, "EXIT-1E updater lost independent config boundary");
assert.equal(updaterUi.includes("subscription_independent"), true, "EXIT-1E updater must remain subscription-independent");

for (const token of [".supabase.co", "Authorization", "apikey", "access_token", "product_key", "POLAR_", "GATEWAY_"]) assert.equal(nativeUpdater.includes(token), false, `native updater still depends on application authority after EXIT-1E: ${token}`);
assert.equal(nativeUpdater.includes("download_and_install"), true, "native updater install path is missing");
assert.deepEqual(updaterBootstrap.plugins?.updater?.endpoints, ["https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json"], "EXIT-1E updater must use an independent static release manifest");
assert.match(persistence, /product_authority_active:\s*true/);
assert.match(persistence, /supabase_primary_authority_active:\s*false/);
assert.match(persistence, /supabase_fallback_available:\s*true/);

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://audit.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_closeout_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://audit.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(build.status, 0, `Desktop static build failed during closeout audit: ${build.stderr || build.stdout}`);
const genericConfig = read("desktop-dist/config.js");
const legacyConfig = read("desktop-dist/backend/legacy/runtime-config.js");
const runtimeIndex = read("desktop-dist/index.html");
for (const token of ["supabase_url", "supabase_publishable_key", "api_base_url", "audit.supabase.co", "sb_publishable_closeout_fixture"]) assert.equal(genericConfig.includes(token), false, `generic generated config leaked legacy detail: ${token}`);
assert.equal(legacyConfig.includes("audit.supabase.co"), true, "legacy generated config did not receive transitional provider config");
assert.equal(legacyConfig.includes("sb_publishable_closeout_fixture"), true, "legacy generated config did not receive transitional client key");
assert.equal(runtimeIndex.includes("session-bridge.js"), false, "built Desktop resurrected removed session bridge");
assert.ok(runtimeIndex.indexOf("./backend/legacy/runtime-config.js") < runtimeIndex.indexOf("./backend/backend.js"), "legacy runtime config must load before backend composition");
assert.ok(runtimeIndex.indexOf("./backend/backend.js") < runtimeIndex.indexOf("./app.js"), "backend composition must load before app consumer");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_CLOSEOUT_AUDIT_PASS",
  audited_generic_runtime_files: genericRuntime.length,
  allowed_legacy_runtime_files: actualLegacyFiles,
  generic_vendor_config_couplings: 0,
  generic_direct_fetch_paths: 0,
  session_bridge_paths: 0,
  generic_builder_vendor_env_names: 0,
  legacy_config_bridge_isolated: true,
  updater_ui_session_authority: "none-independent-exit-1e",
  desktop_provider_local_sqlite_authority_active: true,
  gateway_active: true,
  polar_active: true,
  legacy_runtime_scope: "existing-data-migration-only",
  exit_1b_closeout: "PASS",
  historical_provider_config_boundary_preserved: true
}));
