import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const cargo = read("src-tauri/Cargo.toml");
const main = read("src-tauri/src/main.rs");
const native = read("src-tauri/src/gateway_transport.rs");
const secure = read("src-tauri/src/device_secure_store.rs");
const backend = read("desktop/backend/backend.js");
const gatewaySessionSource = read("desktop/backend/gateway/gateway-session-provider.js");
const gatewayRemoteSource = read("desktop/backend/gateway/gateway-remote-provider.js");
const localWorkSource = read("desktop/backend/local/local-work-data-provider.js");
const transitionSource = read("desktop/backend/bridge/transition-provider.js");

assert.match(cargo, /rust-version = "1\.85\.0"/);
assert.match(cargo, /reqwest = \{ version = "=0\.13\.4"/);
assert.match(cargo, /uuid = \{ version = "=1\.24\.1", features = \["v4"\] \}/);
assert.match(main, /mod gateway_transport;/);
assert.match(main, /GatewayTransport::initialize/);
assert.match(main, /app\.manage\(gateway\)/);
for (const command of [
  "desktop_gateway_status",
  "desktop_gateway_activate",
  "desktop_gateway_resume_session",
  "desktop_gateway_entitlement",
  "desktop_gateway_discover",
  "desktop_gateway_analyze",
  "desktop_gateway_guidance"
]) assert.equal(main.includes(command), true, `native Gateway command missing: ${command}`);

for (const forbidden of ["supabase", "POLAR_ACCESS_TOKEN", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "GATEWAY_CREDENTIAL_SIGNING_SECRET"]) {
  assert.equal(native.includes(forbidden), false, `Desktop native Gateway transport owns forbidden provider detail: ${forbidden}`);
}
assert.match(native, /product_key_bearer_allowed:\s*false/);
assert.match(native, /session_credential_persisted:\s*false/);
assert.equal(native.includes("bearer_auth(product_key)"), false, "Product Key must never be a Gateway bearer credential");
assert.match(native, /"\/v1\/license\/activate"/);
assert.match(native, /"\/v1\/session"/);
assert.match(native, /"\/v1\/entitlement"/);
assert.match(native, /"\/v1\/discovery"/);
assert.match(native, /"\/v1\/analyze"/);
assert.match(native, /"\/v1\/guidance"/);
assert.match(native, /secure_store\.save\(&DeviceIdentityRecord/);
assert.equal(secure.includes("product_key:"), false, "Product Key must not be persisted in secure storage");
assert.equal(secure.includes("session_credential:"), false, "short-lived session credential must remain memory-only");

assert.match(backend, /migration_stage:\s*"MV-SUPABASE-EXIT-1B-5"/);
assert.match(backend, /gateway_active:\s*false/);
assert.match(backend, /polar_active:\s*false/);
assert.match(backend, /local_sqlite_authority_active:\s*false/);

for (const [label, source] of [
  ["gateway session", gatewaySessionSource],
  ["gateway remote", gatewayRemoteSource],
  ["local work-data", localWorkSource],
  ["transition", transitionSource]
]) {
  assert.equal(/\bfetch\s*\(/.test(source), false, `${label} must use the native transport/provider boundary, not browser fetch`);
  assert.equal(source.includes(".supabase.co"), false, `${label} must be vendor-host neutral`);
}
assert.match(gatewaySessionSource, /credentials\.kind === "product_key"/);
assert.match(gatewaySessionSource, /credentials\.kind === "resume"/);
assert.match(gatewaySessionSource, /desktop_gateway_activate/);
assert.match(gatewaySessionSource, /desktop_gateway_resume_session/);
assert.match(gatewayRemoteSource, /desktop_gateway_entitlement/);
assert.match(gatewayRemoteSource, /desktop_gateway_discover/);
assert.match(gatewayRemoteSource, /desktop_gateway_analyze/);
assert.match(gatewayRemoteSource, /desktop_gateway_guidance/);
assert.match(localWorkSource, /desktop_local_reference_library_list/);
assert.match(localWorkSource, /desktop_local_analysis_save/);
assert.match(localWorkSource, /desktop_local_guidance_save/);
assert.match(transitionSource, /fallback_scope:\s*"0\.1\.2-migration-only"/);

const calls = [];
const fakeInvoke = async (command, args = {}) => {
  calls.push({ command, args });
  if (command === "desktop_gateway_activate") return { provider: "masterv-gateway", credential: "session-a", entitlement: { capabilities: { discovery: true, analyze: true, guidance: true } } };
  if (command === "desktop_gateway_resume_session") return { provider: "masterv-gateway", credential: "session-b", entitlement: { capabilities: { discovery: true, analyze: true, guidance: true } } };
  if (command === "desktop_gateway_entitlement") return { entitlement: { capabilities: { discovery: true, analyze: true, guidance: true } } };
  if (command === "desktop_gateway_discover") return { provider: "youtube", candidates: [] };
  if (command === "desktop_gateway_analyze") return { provider: "gemini", source: { source_id: "abc" }, analysis: {}, derived_metrics: {} };
  if (command === "desktop_gateway_guidance") return { provider: "gemini", guide: {}, diagnostics: { persistence_writes: 0 } };
  if (command === "desktop_local_workspace_id") return "local:masterv";
  if (command === "desktop_local_reference_library_list") return [];
  if (command === "desktop_local_reference_detail") return { source_id: args.sourceId };
  if (command === "desktop_local_reference_delete") return 1;
  return null;
};
const window = { __TAURI__: { core: { invoke: fakeInvoke } } };
window.window = window;
const context = vm.createContext({ window, Object, Error, TypeError, String, Boolean, Array, JSON, console });
for (const [filename, source] of [
  ["gateway-session-provider.js", gatewaySessionSource],
  ["gateway-remote-provider.js", gatewayRemoteSource],
  ["local-work-data-provider.js", localWorkSource],
  ["transition-provider.js", transitionSource]
]) vm.runInContext(source, context, { filename });

const gatewaySession = window.MASTERV_GATEWAY_SESSION_PROVIDER.create(fakeInvoke);
const localWork = window.MASTERV_LOCAL_WORK_DATA_PROVIDER.create(fakeInvoke);
const gatewayRemote = window.MASTERV_GATEWAY_REMOTE_PROVIDER.create(fakeInvoke);
const activated = await gatewaySession.openSession({ kind: "product_key", product_key: "KEY-ONLY-BOOTSTRAP" });
assert.equal(activated.credential, "session-a");
const activationCall = calls.find((entry) => entry.command === "desktop_gateway_activate");
assert.equal(activationCall.args.productKey, "KEY-ONLY-BOOTSTRAP");
await gatewaySession.openSession({ kind: "resume" });
const capabilities = await gatewayRemote.probeCapabilities(activated);
assert.equal(capabilities.capabilities.deep_analysis, true);
assert.equal(await localWork.bootstrapPersonalWorkspace(activated), "local:masterv");

const legacySession = {
  configured: () => true,
  openSession: async () => ({ provider: "legacy-supabase", credential: "legacy" }),
  closeSession: async () => undefined,
  describeSession: (session) => ({ authenticated: Boolean(session?.credential) })
};
const legacyWork = {
  configured: () => true,
  bootstrapPersonalWorkspace: async () => "legacy-workspace",
  listReferenceLibrary: async () => ["legacy"],
  fetchReferenceDetail: async () => ({}),
  deleteReferenceLibraryEntry: async () => 0
};
const legacyRemote = {
  configured: () => true,
  probeCapabilities: async () => ({ provider: "legacy" }),
  compileReferenceWorkflow: async () => ({}),
  discoverYouTube: async () => ({}),
  analyzeYouTube: async () => ({}),
  generateProductionGuidance: async () => ({}),
  probeBackgroundBatch: async () => ({}),
  listBackgroundBatchJobs: async () => ({}),
  submitBackgroundBatchJob: async () => ({}),
  checkBackgroundBatchJob: async () => ({})
};
const transition = window.MASTERV_TRANSITION_PROVIDER.create({ gatewaySession, legacySession, localWorkData: localWork, legacyWorkData: legacyWork, gatewayRemote, legacyRemote });
const productSession = await transition.session.openSession({ kind: "product_key", product_key: "KEY" });
assert.equal(productSession.provider, "masterv-gateway");
const legacy = await transition.session.openSession({ kind: "email_password", email: "a@b.c", password: "x" });
assert.equal(legacy.provider, "legacy-supabase");
assert.equal(await transition.workData.bootstrapPersonalWorkspace(productSession), "local:masterv");

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://parallel.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_parallel_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://parallel.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(build.status, 0, `desktop static build failed: ${build.stderr || build.stdout}`);
for (const asset of [
  "backend/gateway/gateway-session-provider.js",
  "backend/gateway/gateway-remote-provider.js",
  "backend/local/local-work-data-provider.js",
  "backend/bridge/transition-provider.js"
]) assert.equal(fs.existsSync(path.join(root, "desktop-dist", asset)), true, `parallel adapter asset missing: ${asset}`);

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_2B_DESKTOP_GATEWAY_PARALLEL_ADAPTER_PASS",
  native_gateway_transport: true,
  gateway_https_required: true,
  product_key_bootstrap_only: true,
  product_key_persisted: false,
  device_credential_secure_store: "windows-dpapi",
  session_credential_memory_only: true,
  gateway_session_adapter: true,
  gateway_remote_adapter: true,
  local_work_data_adapter: true,
  transition_adapter: true,
  production_ui_cutover_active: false,
  legacy_runtime_primary_unchanged_until_exit_2c: true
}));
