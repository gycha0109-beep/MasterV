import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const backendDir = path.join(root, "desktop", "backend");
const files = {
  boundary: path.join(backendDir, "provider-boundary.js"),
  legacySession: path.join(backendDir, "legacy", "supabase-session-provider.js"),
  legacyWorkData: path.join(backendDir, "legacy", "supabase-work-data-provider.js"),
  legacyRemote: path.join(backendDir, "legacy", "hosted-api-client.js"),
  gatewaySession: path.join(backendDir, "gateway", "gateway-session-provider.js"),
  gatewayRemote: path.join(backendDir, "gateway", "gateway-remote-provider.js"),
  localWorkData: path.join(backendDir, "local", "local-work-data-provider.js"),
  transition: path.join(backendDir, "bridge", "transition-provider.js"),
  composition: path.join(backendDir, "backend.js")
};
for (const [name, file] of Object.entries(files)) assert.equal(fs.existsSync(file), true, `${name} backend provider asset is missing`);
const sources = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, "utf8")]));

for (const forbidden of ["supabase_url", "supabase_publishable_key", "/auth/v1", "/rest/v1", "/functions/v1", "publishable_key"]) {
  assert.equal(sources.boundary.toLowerCase().includes(forbidden), false, `provider boundary must remain vendor-neutral: ${forbidden}`);
}
assert.match(sources.legacySession, /\/auth\/v1\/token\?grant_type=password/);
assert.match(sources.legacyWorkData, /\/rest\/v1\/reference_library_entries/);
assert.match(sources.legacyRemote, /masterv-api-boundary/);
for (const [label, source] of [["gateway session", sources.gatewaySession], ["gateway remote", sources.gatewayRemote], ["local work-data", sources.localWorkData], ["transition", sources.transition]]) {
  assert.equal(/\bfetch\s*\(/.test(source), false, `${label} must stay behind native/provider boundaries`);
  assert.equal(source.includes(".supabase.co"), false, `${label} must remain vendor-host neutral`);
}
assert.match(sources.composition, /gatewaySessionFactory\.create\(\)/);
assert.match(sources.composition, /gatewayRemoteFactory\.create\(\)/);
assert.match(sources.composition, /localWorkDataFactory\.create\(\)/);
assert.match(sources.composition, /transitionFactory\.create/);
assert.match(sources.composition, /migration_stage:\s*"MV-SUPABASE-EXIT-2C"/);
assert.match(sources.composition, /product_authority_active:\s*true/);
assert.match(sources.composition, /legacy_authority_unchanged:\s*false/);
assert.match(sources.composition, /supabase_authority_unchanged:\s*false/);
assert.match(sources.composition, /supabase_primary_authority_active:\s*false/);
assert.match(sources.composition, /local_sqlite_authority_active:\s*true/);
assert.match(sources.composition, /gateway_active:\s*true/);
assert.match(sources.composition, /polar_active:\s*true/);
assert.match(sources.composition, /legacy_runtime_scope:\s*"existing-data-migration-only"/);
assert.equal(sources.composition.includes("MASTERV_DESKTOP_CONFIG"), false, "backend composition must not consume generic Desktop config");
assert.equal(sources.composition.includes("MASTERV_LEGACY_RUNTIME_CONFIG"), true, "0.1.2 composition must retain isolated migration config");

let fetchCalls = 0;
let invokeCalls = 0;
const fakeFetch = async () => { fetchCalls += 1; throw new Error("provider construction must not perform network I/O"); };
const fakeInvoke = async () => { invokeCalls += 1; throw new Error("provider construction must not invoke native operations"); };
const window = {
  MASTERV_LEGACY_RUNTIME_CONFIG: {
    supabase_url: "https://legacy.example.test",
    supabase_publishable_key: "legacy-public-key",
    api_base_url: "https://api-legacy.example.test/functions/v1",
    api_contract_version: "mv-hosted-api-v1"
  },
  __TAURI__: { core: { invoke: fakeInvoke } },
  fetch: fakeFetch
};
window.window = window;
const context = vm.createContext({ window, Object, TypeError, Error, String, Boolean, Array, JSON, URLSearchParams, Set, console });
for (const name of ["boundary", "legacySession", "legacyWorkData", "legacyRemote", "gatewaySession", "gatewayRemote", "localWorkData", "transition", "composition"]) {
  vm.runInContext(sources[name], context, { filename: path.basename(files[name]) });
}

const backend = window.MASTERV_BACKEND;
assert.ok(backend, "composed backend provider is not exposed");
assert.equal(backend.contract_version, "mv-backend-provider-v1");
assert.equal(Object.isFrozen(backend), true);
assert.equal(Object.isFrozen(backend.authority), true);
assert.equal(backend.authority.migration_stage, "MV-SUPABASE-EXIT-2C");
assert.equal(backend.authority.provider_boundary_active, true);
assert.equal(backend.authority.product_authority_active, true);
assert.equal(backend.authority.legacy_authority_unchanged, false);
assert.equal(backend.authority.supabase_primary_authority_active, false);
assert.equal(backend.authority.local_sqlite_authority_active, true);
assert.equal(backend.authority.gateway_active, true);
assert.equal(backend.authority.polar_active, true);
assert.equal(backend.authority.legacy_runtime_scope, "existing-data-migration-only");
assert.equal(backend.configured(), true);
assert.equal(fetchCalls, 0, "provider construction performed network I/O");
assert.equal(invokeCalls, 0, "provider construction performed native I/O");
for (const method of window.MASTERV_BACKEND_PROVIDER_CONTRACT.required_methods.session) assert.equal(typeof backend.session[method], "function", `session provider method missing: ${method}`);
for (const method of window.MASTERV_BACKEND_PROVIDER_CONTRACT.required_methods.workData) assert.equal(typeof backend.workData[method], "function", `work-data provider method missing: ${method}`);
for (const method of window.MASTERV_BACKEND_PROVIDER_CONTRACT.required_methods.remoteOperations) assert.equal(typeof backend.remoteOperations[method], "function", `remote-operation method missing: ${method}`);

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_1_PROVIDER_BOUNDARY_CONTRACT_PASS",
  contract_version: backend.contract_version,
  migration_stage: backend.authority.migration_stage,
  provider_boundary_preserved: true,
  visible_primary: "gateway+local-sqlite",
  legacy_scope: backend.authority.legacy_runtime_scope,
  construction_network_requests: fetchCalls,
  construction_native_requests: invokeCalls
}));
