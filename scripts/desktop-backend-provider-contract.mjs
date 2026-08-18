import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const backendDir = path.join(root, "desktop", "backend");
const files = {
  boundary: path.join(backendDir, "provider-boundary.js"),
  session: path.join(backendDir, "legacy", "supabase-session-provider.js"),
  workData: path.join(backendDir, "legacy", "supabase-work-data-provider.js"),
  remote: path.join(backendDir, "legacy", "hosted-api-client.js"),
  composition: path.join(backendDir, "backend.js")
};
for (const [name, file] of Object.entries(files)) assert.equal(fs.existsSync(file), true, `${name} backend provider asset is missing`);
const sources = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, "utf8")]));
for (const forbidden of ["supabase_url", "supabase_publishable_key", "/auth/v1", "/rest/v1", "/functions/v1", "publishable_key"]) assert.equal(sources.boundary.toLowerCase().includes(forbidden), false, `provider boundary must remain vendor-neutral: ${forbidden}`);
assert.match(sources.session, /\/auth\/v1\/token\?grant_type=password/);
assert.match(sources.workData, /\/rest\/v1\/reference_library_entries/);
assert.match(sources.remote, /masterv-api-boundary/);
assert.match(sources.remote, /masterv-background-batch-boundary/);
assert.match(sources.composition, /legacy-supabase-hosted/);
assert.match(sources.composition, /local_sqlite_authority_active:\s*false/);
assert.match(sources.composition, /gateway_active:\s*false/);
assert.match(sources.composition, /polar_active:\s*false/);
assert.equal(sources.composition.includes("MASTERV_DESKTOP_CONFIG"), false, "backend composition must not consume generic Desktop config after 1B-5");
assert.equal(sources.composition.includes("MASTERV_LEGACY_RUNTIME_CONFIG"), true, "backend composition must consume isolated legacy runtime config");

let fetchCalls = 0;
const fakeFetch = async () => { fetchCalls += 1; throw new Error("provider construction must not perform network I/O"); };
const window = {
  MASTERV_DESKTOP_CONFIG: {
    surface: "desktop",
    runtime_contract_version: "mv-desktop-runtime-v1",
    backend_provider_contract_version: "mv-backend-provider-v1"
  },
  MASTERV_LEGACY_RUNTIME_CONFIG: {
    supabase_url: "https://legacy.example.test",
    supabase_publishable_key: "legacy-public-key",
    api_base_url: "https://api-legacy.example.test/functions/v1",
    api_contract_version: "mv-hosted-api-v1"
  },
  fetch: fakeFetch
};
window.window = window;
const context = vm.createContext({ window, Object, TypeError, Error, String, Boolean, Array, JSON, URLSearchParams, console });
for (const name of ["boundary", "session", "workData", "remote", "composition"]) vm.runInContext(sources[name], context, { filename: path.basename(files[name]) });

const backend = window.MASTERV_BACKEND;
assert.ok(backend, "composed backend provider is not exposed");
assert.equal(backend.contract_version, "mv-backend-provider-v1");
assert.equal(Object.isFrozen(backend), true);
assert.equal(Object.isFrozen(backend.authority), true);
assert.match(backend.authority.migration_stage, /^MV-SUPABASE-EXIT-1B(?:-\d+)?$/);
assert.equal(backend.authority.provider_boundary_active, true);
assert.equal(backend.authority.product_authority_active, false);
assert.equal(backend.authority.supabase_authority_unchanged, true);
assert.equal(backend.authority.local_sqlite_authority_active, false);
assert.equal(backend.authority.gateway_active, false);
assert.equal(backend.authority.polar_active, false);
assert.equal(backend.configured(), true);
assert.equal(fetchCalls, 0, "provider construction performed network I/O");
for (const method of window.MASTERV_BACKEND_PROVIDER_CONTRACT.required_methods.session) assert.equal(typeof backend.session[method], "function", `session provider method missing: ${method}`);
for (const method of window.MASTERV_BACKEND_PROVIDER_CONTRACT.required_methods.workData) assert.equal(typeof backend.workData[method], "function", `work-data provider method missing: ${method}`);
for (const method of window.MASTERV_BACKEND_PROVIDER_CONTRACT.required_methods.remoteOperations) assert.equal(typeof backend.remoteOperations[method], "function", `remote-operation method missing: ${method}`);

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_1_PROVIDER_BOUNDARY_CONTRACT_PASS",
  contract_version: backend.contract_version,
  adapter_mode: backend.authority.adapter_mode,
  consumer_wired: backend.authority.consumer_wired,
  product_authority_active: backend.authority.product_authority_active,
  supabase_authority_unchanged: backend.authority.supabase_authority_unchanged,
  generic_desktop_config_vendor_neutral: true,
  legacy_runtime_config_isolated: true,
  construction_network_requests: fetchCalls
}));
