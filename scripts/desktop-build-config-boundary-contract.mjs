import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const buildSource = read("scripts/build-desktop-static.mjs");
const bridgeSource = read("scripts/desktop-legacy-config-bridge.mjs");
const backendSource = read("desktop/backend/backend.js");
const updaterSource = read("desktop/updater.js");
const updaterPrepareSource = read("scripts/prepare-desktop-updater-bootstrap.mjs");
const sessionProvider = read("desktop/backend/legacy/supabase-session-provider.js");
const workDataProvider = read("desktop/backend/legacy/supabase-work-data-provider.js");
const hostedClient = read("desktop/backend/legacy/hosted-api-client.js");
const persistence = read("src-tauri/src/local_persistence.rs");

for (const [label, source] of [
  ["generic desktop builder", buildSource],
  ["backend composition", backendSource],
  ["updater UI", updaterSource],
  ["updater preparation", updaterPrepareSource]
]) {
  for (const forbidden of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "supabase_url", "supabase_publishable_key"]) {
    assert.equal(source.includes(forbidden), false, `${label} still owns vendor config detail: ${forbidden}`);
  }
}

for (const required of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_MASTERV_API_BASE_URL", "supabase_url", "supabase_publishable_key", "api_base_url", "api_contract_version"]) {
  assert.equal(bridgeSource.includes(required), true, `legacy config bridge must own transitional mapping: ${required}`);
}
for (const source of [sessionProvider, workDataProvider]) {
  assert.equal(source.includes("config.supabase_url"), true, "legacy Supabase provider must retain current vendor config ownership");
  assert.equal(source.includes("config.supabase_publishable_key"), true, "legacy Supabase provider must retain current publishable-key ownership");
}
assert.equal(hostedClient.includes("config.api_base_url"), true, "legacy hosted client must retain API base config ownership");
assert.equal(hostedClient.includes("config.supabase_publishable_key"), true, "legacy hosted client must retain current client-key ownership");
assert.equal(backendSource.includes("window.MASTERV_LEGACY_RUNTIME_CONFIG"), true, "backend composition must consume isolated legacy runtime config");
assert.equal(backendSource.includes("window.MASTERV_DESKTOP_CONFIG"), false, "backend composition must not consume generic desktop config");
assert.match(backendSource, /migration_stage:\s*"MV-SUPABASE-EXIT-1B-5"/);
assert.match(backendSource, /build_config_boundary:\s*"legacy-runtime-config"/);
assert.match(backendSource, /desktop_config_vendor_neutral:\s*true/);
assert.match(backendSource, /legacy_runtime_config_isolated:\s*true/);
assert.match(backendSource, /supabase_authority_unchanged:\s*true/);
assert.match(backendSource, /local_sqlite_authority_active:\s*false/);
assert.match(backendSource, /gateway_active:\s*false/);
assert.match(backendSource, /polar_active:\s*false/);

const localAuthorityPromoted = /product_authority_active:\s*true/.test(persistence);
if (localAuthorityPromoted) {
  assert.match(persistence, /supabase_primary_authority_active:\s*false/);
  assert.match(persistence, /supabase_fallback_available:\s*true/);
} else {
  assert.match(persistence, /product_authority_active:\s*false/);
  assert.match(persistence, /supabase_authority_unchanged:\s*true/);
}

assert.equal(updaterSource.includes("window.MASTERV_BACKEND"), false, "EXIT-1E updater UI must not consume backend session runtime");
assert.equal(updaterSource.includes("backend.session"), false, "EXIT-1E updater UI must not subscribe to backend sessions");
assert.equal(updaterSource.includes("window.MASTERV_UPDATER_CONFIG"), true, "EXIT-1E updater UI must consume independent updater config");
assert.equal(updaterSource.includes("subscription_independent"), true, "EXIT-1E updater must declare subscription independence");
for (const forbidden of ["MASTERV_SESSION_BRIDGE", "getAccessToken", "session-bridge.js", "client_key"]) {
  assert.equal(updaterSource.includes(forbidden), false, `updater UI still owns removed or legacy session path: ${forbidden}`);
}
assert.equal(updaterPrepareSource.includes("desktop-legacy-config-bridge.mjs"), false, "EXIT-1E updater preparation must not delegate to legacy backend config");
assert.equal(updaterPrepareSource.includes("MASTERV_UPDATER_CONFIG"), true, "EXIT-1E updater preparation must emit independent updater config");
assert.equal(updaterPrepareSource.includes("client_key"), false, "EXIT-1E updater preparation must not emit a client key");

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_contract_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(build.status, 0, `desktop static builder failed: ${build.stderr || build.stdout}`);
assert.equal(build.stdout.includes('"legacy_runtime_config_isolated":true'), true, "builder must report isolated legacy runtime config");
assert.equal(build.stdout.includes('"desktop_config_vendor_neutral":true'), true, "builder must report vendor-neutral desktop config");

const dist = path.join(root, "desktop-dist");
const genericConfig = read(path.relative(root, path.join(dist, "config.js")));
const legacyRuntimeConfig = read(path.relative(root, path.join(dist, "backend", "legacy", "runtime-config.js")));
const runtimeIndex = read(path.relative(root, path.join(dist, "index.html")));

assert.equal(genericConfig.includes('"surface":"desktop"'), true, "generic desktop config surface missing");
assert.equal(genericConfig.includes('"runtime_contract_version":"mv-desktop-runtime-v1"'), true, "generic runtime contract missing");
assert.equal(genericConfig.includes('"backend_provider_contract_version":"mv-backend-provider-v1"'), true, "generic provider contract missing");
for (const forbidden of ["supabase_url", "supabase_publishable_key", "api_base_url", "api_contract_version", "example.supabase.co", "sb_publishable_contract_fixture"]) {
  assert.equal(genericConfig.includes(forbidden), false, `generic desktop config leaked legacy vendor config: ${forbidden}`);
}
assert.equal(legacyRuntimeConfig.includes("MASTERV_LEGACY_RUNTIME_CONFIG"), true, "generated legacy runtime config global missing");
assert.equal(legacyRuntimeConfig.includes('"supabase_url":"https://example.supabase.co"'), true, "generated legacy Supabase URL missing");
assert.equal(legacyRuntimeConfig.includes('"supabase_publishable_key":"sb_publishable_contract_fixture"'), true, "generated legacy publishable key missing");
assert.equal(legacyRuntimeConfig.includes('"api_base_url":"https://example.supabase.co/functions/v1"'), true, "generated legacy API base missing");
assert.equal(legacyRuntimeConfig.includes('"api_contract_version":"mv-hosted-api-v1"'), true, "generated legacy API contract missing");

const order = [
  "./backend/provider-boundary.js",
  "./backend/legacy/runtime-config.js",
  "./backend/legacy/supabase-session-provider.js",
  "./backend/legacy/supabase-work-data-provider.js",
  "./backend/legacy/hosted-api-client.js",
  "./backend/backend.js",
  "./app.js"
];
let last = -1;
for (const asset of order) {
  const index = runtimeIndex.indexOf(asset);
  assert.notEqual(index, -1, `runtime asset missing: ${asset}`);
  assert.ok(index > last, `runtime asset order invalid at ${asset}`);
  last = index;
}
assert.equal(runtimeIndex.includes("session-bridge.js"), false, "runtime must not resurrect session bridge");

const prepare = spawnSync(process.execPath, ["scripts/prepare-desktop-updater-bootstrap.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(prepare.status, 0, `updater preparation failed: ${prepare.stderr || prepare.stdout}`);
const preparedConfig = read(path.relative(root, path.join(dist, "config.js")));
const preparedIndex = read(path.relative(root, path.join(dist, "index.html")));
assert.equal(preparedConfig.includes("MASTERV_UPDATER_CONFIG"), true, "independent updater config missing");
assert.equal(preparedConfig.includes('"subscription_independent":true'), true, "independent updater config must declare subscription independence");
assert.equal(preparedConfig.includes("client_key"), false, "independent updater config must not expose a client key");
assert.equal(preparedConfig.includes("supabase_publishable_key"), false, "updater config must not expose vendor field names");
assert.equal(preparedIndex.includes("session-bridge.js"), false, "updater preparation must not resurrect session bridge");
assert.ok(preparedIndex.indexOf("./backend/backend.js") < preparedIndex.indexOf("./app.js"), "backend must load before app");
assert.ok(preparedIndex.indexOf("./app.js") < preparedIndex.indexOf("./updater.js"), "updater UI must load after app");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_5_BUILD_CONFIG_BOUNDARY_CONTRACT_PASS",
  generic_desktop_vendor_config_fields: 0,
  generic_builder_vendor_env_names: 0,
  backend_generic_config_dependency: false,
  legacy_runtime_config_asset: "backend/legacy/runtime-config.js",
  updater_session_authority: "none-independent-exit-1e",
  updater_bootstrap_config: "independent-neutral",
  desktop_provider_local_sqlite_authority_active: false,
  native_local_work_data_authority_active: localAuthorityPromoted,
  supabase_fallback_available: localAuthorityPromoted,
  gateway_active: false,
  polar_active: false,
  historical_config_boundary_preserved: true
}));
