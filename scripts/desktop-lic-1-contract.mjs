import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const boundaryPath = "desktop/backend/provider-boundary.js";
const sessionProviderPath = "desktop/backend/gateway/gateway-session-provider.js";
const entitlementPath = "desktop/entitlement.js";
const indexPath = "desktop/index.html";
const appPath = "desktop/app.js";
const buildPath = "scripts/build-desktop-static.mjs";
const secureStorePath = "src-tauri/src/device_secure_store.rs";
const transportPath = "src-tauri/src/gateway_transport.rs";

for (const relative of [boundaryPath, sessionProviderPath, entitlementPath, indexPath, appPath, buildPath, secureStorePath, transportPath]) {
  assert(exists(relative), `MV-DESKTOP-LIC-1 required file missing: ${relative}`);
}

const boundary = read(boundaryPath);
const sessionProvider = read(sessionProviderPath);
const entitlementUi = read(entitlementPath);
const index = read(indexPath);
const app = read(appPath);
const build = read(buildPath);
const secureStore = read(secureStorePath);
const transport = read(transportPath);

for (const marker of [
  "SESSION_REFRESH_SKEW_MS = 60_000",
  'session_credential_persistence: "memory-only"',
  'session_refresh_authority: "device-credential-via-gateway"',
  'entitlement_projection_authority: "gateway-polar-readback"',
  "postPaidOperationReadback",
  "ensureActiveSession",
  "refreshActiveSession",
  "GATEWAY_USAGE_DENIED",
  "GATEWAY_LICENSE_INACTIVE"
]) assert(boundary.includes(marker), `MV-DESKTOP-LIC-1 provider boundary marker missing: ${marker}`);

for (const marker of [
  'id="entitlement-panel"',
  'id="entitlement-plan"',
  'id="entitlement-license"',
  'id="entitlement-subscription"',
  'id="entitlement-credits"',
  'id="entitlement-device-limit"',
  'id="entitlement-period-end"',
  'id="entitlement-session-expiry"',
  'src="./entitlement.js"'
]) assert(index.includes(marker), `MV-DESKTOP-LIC-1 entitlement surface marker missing: ${marker}`);

for (const marker of [
  'panel.dataset.authority = "gateway-polar-readback"',
  'panel.dataset.desktopAuthority = "projection-only"',
  'panel.dataset.localDataAuthority = "local-sqlite"',
  "backend.session.subscribe",
  "backend.remoteOperations.subscribeCapabilities",
  "backend.remoteOperations.probeCapabilities",
  "usage_remaining",
  "UNLIMITED"
]) assert(entitlementUi.includes(marker), `MV-DESKTOP-LIC-1 entitlement projection marker missing: ${marker}`);

assert(build.includes('"entitlement.js"'), "Desktop static builder must package entitlement.js");
assert(app.includes('establishGatewaySession({ kind: "resume" }, { silent: true })'), "Desktop startup must retain automatic device-session resume");
assert(sessionProvider.includes('invoke("desktop_gateway_resume_session")'), "Desktop session provider must resume via native device credential");
assert(!sessionProvider.includes("localStorage") && !sessionProvider.includes("sessionStorage"), "Session provider must not persist auth material in browser storage");
assert(secureStore.includes('backend: if cfg!(target_os = "windows")'), "Windows secure-store backend contract is missing");
assert(secureStore.includes('"windows-dpapi"'), "Device credential must remain Windows DPAPI protected");
assert(secureStore.includes("product_key_stored: false"), "Product Key persistence boundary regressed");
assert(secureStore.includes("session_credential_stored: false"), "Session credential persistence boundary regressed");
assert(transport.includes("product_key_bearer_allowed: false"), "Product Key must not become a normal bearer credential");
assert(transport.includes("session_credential_persisted: false"), "Native transport must keep session credential memory-only");

for (const [relative, source] of [[boundaryPath, boundary], [entitlementPath, entitlementUi], [appPath, app]]) {
  assert(!source.includes("localStorage") && !source.includes("sessionStorage"), `${relative} regained browser auth persistence`);
}

for (const forbiddenCredential of [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "POLAR_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET"
]) {
  assert.equal(process.env[forbiddenCredential], undefined, `MV-DESKTOP-LIC-1 deterministic contract must not receive credential: ${forbiddenCredential}`);
}

const context = {
  window: {},
  console,
  Date,
  Error,
  TypeError,
  Object,
  Set,
  String,
  Number
};
vm.createContext(context);
vm.runInContext(boundary, context, { filename: boundaryPath });
const contract = context.window.MASTERV_BACKEND_PROVIDER_CONTRACT;
assert(contract, "Backend provider contract failed to initialize in deterministic runtime");
assert.equal(contract.session_refresh_skew_ms, 60_000, "Session refresh skew contract changed unexpectedly");

let resumeCount = 0;
let usageRemaining = 30;
let capabilityProbeCount = 0;
const seenSessions = [];
const capabilityReadbacks = [];

const fakeSessionProvider = {
  configured: () => true,
  async openSession(credentials = {}) {
    if (credentials.kind === "product_key") {
      return Object.freeze({
        provider: "masterv-gateway",
        credential: "memory-session-1",
        expires_at: new Date(Date.now() + 30_000).toISOString(),
        entitlement: Object.freeze({ usage_remaining: usageRemaining })
      });
    }
    if (credentials.kind === "resume") {
      resumeCount += 1;
      return Object.freeze({
        provider: "masterv-gateway",
        credential: `memory-session-${resumeCount + 1}`,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        entitlement: Object.freeze({ usage_remaining: usageRemaining })
      });
    }
    throw new Error("unexpected credential kind");
  },
  async closeSession() {},
  describeSession(session) {
    return Object.freeze({ authenticated: Boolean(session?.credential), entitlement: session?.entitlement ?? null });
  }
};

const fakeWorkData = {
  configured: () => true,
  bootstrapPersonalWorkspace: async () => "local:masterv",
  listReferenceLibrary: async () => [],
  fetchReferenceDetail: async () => ({}),
  deleteReferenceLibraryEntry: async () => undefined
};

const fakeRemote = {
  configured: () => true,
  async probeCapabilities(session) {
    capabilityProbeCount += 1;
    return Object.freeze({
      entitlement: Object.freeze({
        plan: "BASIC",
        license_status: "active",
        subscription_status: "active",
        grace_active: false,
        owner: false,
        current_period_end: null,
        device_limit: 1,
        usage_remaining: usageRemaining,
        capabilities: Object.freeze({ discovery: true, analyze: true, guidance: true })
      }),
      capabilities: Object.freeze({ boundary_probe: true, analyze: true, youtube_discovery: true }),
      seen_session: session.credential
    });
  },
  async compileReferenceWorkflow() { return Object.freeze({ provider: "local-canonical" }); },
  async discoverYouTube(session) { return Object.freeze({ seen_session: session.credential }); },
  async analyzeYouTube(session) {
    usageRemaining -= 5;
    return Object.freeze({ seen_session: session.credential, usage: Object.freeze({ charged_units: 5 }) });
  },
  async generateProductionGuidance(session) {
    usageRemaining -= 1;
    return Object.freeze({ seen_session: session.credential, usage: Object.freeze({ charged_units: 1 }) });
  },
  async probeBackgroundBatch() { return Object.freeze({}); },
  async listBackgroundBatchJobs() { return Object.freeze({ jobs: [] }); },
  async submitBackgroundBatchJob() { return Object.freeze({}); },
  async checkBackgroundBatchJob() { return Object.freeze({}); }
};

const backend = contract.createBackendProvider({
  session: fakeSessionProvider,
  workData: fakeWorkData,
  remoteOperations: fakeRemote,
  authority: { test_only: true }
});

backend.session.subscribe((session) => seenSessions.push(session?.credential ?? null));
backend.remoteOperations.subscribeCapabilities((body) => capabilityReadbacks.push(body?.entitlement?.usage_remaining ?? null));

const localCompile = await backend.remoteOperations.compileReferenceWorkflow(null, ["a", "b"]);
assert.equal(localCompile.provider, "local-canonical", "Local-only comparison must remain usable without Gateway entitlement");

await backend.session.openSession({ kind: "product_key", product_key: "redacted-test-only" });
const firstProbe = await backend.remoteOperations.probeCapabilities();
assert.equal(resumeCount, 1, "Near-expiry session must refresh via device resume before remote operation");
assert.equal(firstProbe.seen_session, "memory-session-2", "Remote operation used stale pre-refresh session credential");
assert.equal(backend.session.current().credential, "memory-session-2", "Refreshed session was not promoted to active memory authority");

const analyze = await backend.remoteOperations.analyzeYouTube(backend.session.current(), "https://example.invalid/video");
assert.equal(analyze.seen_session, "memory-session-2", "Analyze did not use current memory-only session");
assert.equal(usageRemaining, 25, "Analyze usage fixture did not decrement expected units");
assert.equal(backend.remoteOperations.currentCapabilities().entitlement.usage_remaining, 25, "Analyze success did not trigger entitlement readback");

const guidance = await backend.remoteOperations.generateProductionGuidance(backend.session.current(), {}, {});
assert.equal(guidance.seen_session, "memory-session-2", "Guidance did not use current memory-only session");
assert.equal(usageRemaining, 24, "Guidance usage fixture did not decrement expected units");
assert.equal(backend.remoteOperations.currentCapabilities().entitlement.usage_remaining, 24, "Guidance success did not trigger entitlement readback");
assert(capabilityProbeCount >= 3, "Expected initial and post-paid-operation entitlement readbacks were not observed");

assert.equal(
  backend.formatError(new Error("GATEWAY_USAGE_DENIED: AI credit balance is insufficient.")),
  "[GATEWAY_USAGE_DENIED] AI 크레딧이 부족합니다. Local SQLite 데이터는 계속 사용할 수 있습니다.",
  "Usage exhaustion user projection changed unexpectedly"
);
assert.equal(
  backend.formatError(new Error("GATEWAY_LICENSE_INACTIVE: The Polar license is not active.")),
  "[GATEWAY_LICENSE_INACTIVE] 라이선스가 비활성 상태입니다. Local SQLite 데이터는 계속 사용할 수 있습니다.",
  "Inactive-license user projection changed unexpectedly"
);

await backend.session.closeSession();
await assert.rejects(
  () => backend.remoteOperations.discoverYouTube(null, "query"),
  /GATEWAY_SESSION_REQUIRED/,
  "Remote operations must fail closed after Desktop Gateway session close"
);

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_LIC_1_CONTRACT_PASS",
  starting_main_sha: "2a0a5b055622d4492f511b3bc1080c447ed58293",
  session_refresh_skew_ms: contract.session_refresh_skew_ms,
  near_expiry_device_resume_verified: true,
  refreshed_session_memory_only: true,
  entitlement_projection_surface: true,
  analyze_post_usage_readback: 25,
  guidance_post_usage_readback: 24,
  local_sqlite_pre_activation_access_preserved: true,
  product_key_persisted: false,
  session_credential_persisted: false,
  gateway_final_paid_authority_preserved: true,
  application_credentials_used: false,
  production_polar_mutation: false,
  production_signing_mutation: false,
  release_mutation: false,
  live_sandbox_desktop_e2e_executed: false,
  seen_sessions: seenSessions,
  entitlement_readbacks: capabilityReadbacks
}));