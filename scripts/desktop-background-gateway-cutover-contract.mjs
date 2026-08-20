import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const transitionSource = read("desktop/backend/bridge/transition-provider.js");
const backgroundSource = read("desktop/background-batch.js");
const indexSource = read("desktop/index.html");
const gatewayCore = read("gateway/core.ts");

assert.match(transitionSource, /BACKGROUND_BATCH_CONTRACT_VERSION = "background-batch-local-gateway-v1"/);
assert.match(transitionSource, /background_operations: "local-session-orchestrated\+gateway-executed"/);
assert.match(transitionSource, /background_job_restart_durability: false/);
assert.match(transitionSource, /background_result_persistence: "local-sqlite"/);
assert.match(transitionSource, /gatewayRemote\.analyzeYouTube\(requireGatewaySession\(activeSession\), current\.canonical_url\)/);
assert.match(transitionSource, /localWorkData\.saveAnalysisResult/);
assert.equal(transitionSource.includes("legacyRemote.probeBackgroundBatch"), false, "Product-Key background operations must not delegate to legacy hosted batch");
assert.equal(transitionSource.includes("legacyRemote.submitBackgroundBatchJob"), false, "Product-Key background submit must not delegate to legacy hosted batch");
assert.equal(transitionSource.includes("legacyRemote.listBackgroundBatchJobs"), false, "Product-Key background list must not delegate to legacy hosted batch");
assert.equal(transitionSource.includes("legacyRemote.checkBackgroundBatchJob"), false, "Product-Key background check must not delegate to legacy hosted batch");
assert.equal(gatewayCore.includes('url.pathname === "/v1/background'), false, "EXIT-2C must not add a DB-backed Gateway background route");

assert.match(backgroundSource, /providerAuthority = "masterv-gateway"/);
assert.match(backgroundSource, /persistenceAuthority = "local-sqlite-analysis-results"/);
assert.match(backgroundSource, /jobLedgerAuthority = "desktop-session-memory"/);
assert.match(backgroundSource, /restartDurability = "false"/);
assert.match(backgroundSource, /background-batch-local-gateway-v1/);
assert.equal(backgroundSource.includes("durable_ledger"), false, "Desktop must not advertise the removed Supabase durable ledger");
assert.equal(backgroundSource.includes("hosted-admin-only"), false, "Desktop must not advertise hosted admin ledger authority");
assert.match(indexSource, /LOCAL ORCHESTRATION · GATEWAY EXECUTION/);
assert.match(indexSource, /job queue 자체의 재시작 내구성을 주장하지 않습니다/);
assert.equal(indexSource.includes("Product-Key session에서는 차단됩니다"), false, "visible 2C UI must not claim background operations are blocked");

const calls = [];
const fakeGatewaySession = {
  configured: () => true,
  openSession: async () => ({ provider: "masterv-gateway", credential: "session" }),
  closeSession: async () => undefined,
  describeSession: () => ({ authenticated: true })
};
const fakeLegacySession = { configured: () => true, openSession: async () => ({ provider: "legacy-supabase", credential: "legacy", subject_id: "legacy" }), closeSession: async () => undefined, describeSession: () => ({ authenticated: true }) };
const fakeLocalWork = {
  configured: () => true,
  bootstrapPersonalWorkspace: async () => "local:masterv",
  listReferenceLibrary: async () => [],
  fetchReferenceDetail: async () => ({}),
  deleteReferenceLibraryEntry: async () => 0,
  upsertReferenceLibraryEntry: async () => undefined,
  saveAnalysisResult: async (input) => { calls.push({ kind: "save-analysis", input }); },
  saveComparisonEntry: async () => undefined,
  saveProductionGuidance: async () => undefined,
  migrateLegacyReferenceLibrary: async () => ({ imported_count: 0 })
};
const fakeLegacyWork = { configured: () => true, bootstrapPersonalWorkspace: async () => "legacy", exportReferenceLibraryForMigration: async () => [] };
const fakeGatewayRemote = {
  configured: () => true,
  probeCapabilities: async () => ({ capabilities: {} }),
  discoverYouTube: async () => ({}),
  analyzeYouTube: async (_session, url) => {
    calls.push({ kind: "gateway-analyze", url });
    return { request_id: "gw-1", model: "fixture", source: { platform: "youtube", source_id: "yt:test" }, analysis: { summary: "ok" }, diagnostics: { persistence_writes: 0 } };
  },
  generateProductionGuidance: async () => ({})
};
const fakeLegacyRemote = {};
const window = { MASTERV_LOCAL_REFERENCE_COMPILER: { compile: () => ({ comparison: {}, evidence_rules: {} }) } };
window.window = window;
const context = vm.createContext({ window, Object, Error, TypeError, String, Boolean, Array, JSON, Map, Date, Promise, console, setTimeout, clearTimeout });
vm.runInContext(transitionSource, context, { filename: "transition-provider.js" });
const provider = window.MASTERV_TRANSITION_PROVIDER.create({ gatewaySession: fakeGatewaySession, legacySession: fakeLegacySession, localWorkData: fakeLocalWork, legacyWorkData: fakeLegacyWork, gatewayRemote: fakeGatewayRemote, legacyRemote: fakeLegacyRemote });
const session = { provider: "masterv-gateway", credential: "session" };
const probe = await provider.remoteOperations.probeBackgroundBatch(session);
assert.equal(probe.contract_version, "background-batch-local-gateway-v1");
assert.equal(probe.capabilities.gateway_execution, true);
assert.equal(probe.capabilities.local_analysis_persistence, true);
assert.equal(probe.capabilities.restart_durability, false);
const queued = await provider.remoteOperations.submitBackgroundBatchJob(session, "request-1", "https://www.youtube.com/watch?v=ABCDEFGHIJK");
assert.equal(queued.request_id, "request-1");
await new Promise((resolve) => setTimeout(resolve, 0));
const checked = await provider.remoteOperations.checkBackgroundBatchJob(session, "request-1");
assert.equal(checked.job.status, "SUCCEEDED");
assert.equal(calls.filter((entry) => entry.kind === "gateway-analyze").length, 1, "background operation must execute exactly one Gateway analyze request");
assert.equal(calls.filter((entry) => entry.kind === "save-analysis").length, 1, "background operation result must persist exactly once to Local SQLite adapter");

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_background_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};
const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(build.status, 0, `desktop static builder failed: ${build.stderr || build.stdout}`);
const copyBackground = spawnSync(process.execPath, ["scripts/copy-desktop-background-batch.mjs"], { cwd: root, env, encoding: "utf8" });
assert.equal(copyBackground.status, 0, `desktop background asset copy failed: ${copyBackground.stderr || copyBackground.stdout}`);
const builtBackground = read("desktop-dist/background-batch.js");
assert.match(builtBackground, /background-batch-local-gateway-v1/);

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_2C_BACKGROUND_GATEWAY_CUTOVER_PASS",
  orchestration_authority: "desktop-session-memory",
  execution_authority: "masterv-gateway",
  paid_authorization_authority: "gateway",
  analysis_result_authority: "local-sqlite",
  central_job_db: false,
  gateway_background_route_added: false,
  supabase_background_primary: false,
  restart_durability_claimed: false
}));
