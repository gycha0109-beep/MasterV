import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const boundary = read("desktop/backend/provider-boundary.js");
const backend = read("desktop/backend/backend.js");
const app = read("desktop/app.js");
const deep = read("desktop/deep-analysis.js");
const batch = read("desktop/background-batch.js");
const remote = read("desktop/backend/legacy/hosted-api-client.js");
const persistence = read("src-tauri/src/local_persistence.rs");

for (const [label, source] of [["Deep Analysis", deep], ["Background Batch", batch]]) {
  for (const forbidden of ["MASTERV_DESKTOP_CONFIG", "supabase_url", "supabase_publishable_key", "/auth/v1", "/rest/v1", "Authorization", "apikey", "originalFetch"]) {
    assert.equal(source.includes(forbidden), false, `${label} consumer still owns backend implementation detail: ${forbidden}`);
  }
  assert.equal(/window\.fetch\s*=/.test(source), false, `${label} must not monkey-patch window.fetch`);
  assert.equal(/\bfetch\s*\(/.test(source), false, `${label} must not issue direct fetch`);
  assert.match(source, /backend\.session\.subscribe/);
  assert.match(source, /masterv:backend-ready/);
}

for (const required of [
  "backend.remoteOperations.analyzeYouTube(session, url)",
  "backend.remoteOperations.generateProductionGuidance(session, request.analysis, request.product_truth)",
  "backend.remoteOperations.subscribeCapabilities"
]) assert.equal(deep.includes(required), true, `Deep Analysis provider delegation missing: ${required}`);
for (const required of [
  "backend.remoteOperations.probeBackgroundBatch(session)",
  "backend.remoteOperations.listBackgroundBatchJobs(session)",
  "backend.remoteOperations.submitBackgroundBatchJob(session, request.request_id, request.url)",
  "backend.remoteOperations.checkBackgroundBatchJob(session, request.request_id)"
]) assert.equal(batch.includes(required), true, `Background Batch provider delegation missing: ${required}`);

assert.match(boundary, /let activeSession = null/);
assert.match(boundary, /let capabilitySnapshot = null/);
assert.match(boundary, /current\(\)/);
assert.match(boundary, /subscribe\(listener\)/);
assert.match(boundary, /currentCapabilities\(\)/);
assert.match(boundary, /subscribeCapabilities\(listener\)/);
assert.match(backend, /migration_stage:\s*"MV-SUPABASE-EXIT-1B-3"/);
assert.match(backend, /deep_analysis_consumer_wired:\s*true/);
assert.match(backend, /background_batch_consumer_wired:\s*true/);
assert.match(backend, /fetch_monkey_patch_active:\s*false/);
assert.match(backend, /supabase_authority_unchanged:\s*true/);
assert.match(backend, /local_sqlite_authority_active:\s*false/);
assert.match(remote, /masterv-api-boundary/);
assert.match(remote, /masterv-background-batch-boundary/);
assert.match(persistence, /product_authority_active:\s*false/);
assert.match(persistence, /supabase_authority_unchanged:\s*true/);
assert.equal(app.includes("supabase_publishable_key"), false, "app consumer regression reintroduced Supabase coupling");

const window = {};
window.window = window;
const context = vm.createContext({ window, Object, TypeError, Error, String, Boolean, Array, JSON, URLSearchParams, Set, console });
vm.runInContext(boundary, context, { filename: "provider-boundary.js" });
const contract = window.MASTERV_BACKEND_PROVIDER_CONTRACT;
let closed = 0;
const fakeSession = {
  configured: () => true,
  openSession: async () => ({ credential: "opaque-session", subject_id: "user-1" }),
  closeSession: async () => { closed += 1; },
  describeSession: (session) => ({ authenticated: Boolean(session) })
};
const fakeWorkData = {
  configured: () => true,
  bootstrapPersonalWorkspace: async () => "user:user-1",
  listReferenceLibrary: async () => [],
  fetchReferenceDetail: async () => ({}),
  deleteReferenceLibraryEntry: async () => undefined
};
const capabilityBody = { contract_version: "test", capabilities: { boundary_probe: true, deep_analysis_route: true, deep_analysis: true } };
const fakeRemote = {
  configured: () => true,
  probeCapabilities: async () => capabilityBody,
  compileReferenceWorkflow: async () => ({}),
  discoverYouTube: async () => ({}),
  analyzeYouTube: async () => ({}),
  generateProductionGuidance: async () => ({}),
  probeBackgroundBatch: async () => ({}),
  listBackgroundBatchJobs: async () => ({}),
  submitBackgroundBatchJob: async () => ({}),
  checkBackgroundBatchJob: async () => ({})
};
const runtime = contract.createBackendProvider({ session: fakeSession, workData: fakeWorkData, remoteOperations: fakeRemote });
const sessions = [];
const capabilities = [];
runtime.session.subscribe((value) => sessions.push(value?.subject_id || null));
runtime.remoteOperations.subscribeCapabilities((value) => capabilities.push(value?.capabilities?.deep_analysis ?? null));
const opened = await runtime.session.openSession({ kind: "test" });
assert.equal(runtime.session.current(), opened);
await runtime.remoteOperations.probeCapabilities(opened);
assert.equal(runtime.remoteOperations.currentCapabilities(), capabilityBody);
await runtime.session.closeSession(opened);
assert.deepEqual(sessions, [null, "user-1", null]);
assert.deepEqual(capabilities, [null, null, true, null]);
assert.equal(runtime.session.current(), null);
assert.equal(runtime.remoteOperations.currentCapabilities(), null);
assert.equal(closed, 1);

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1B_3_REMOTE_CONSUMER_REWIRE_CONTRACT_PASS",
  deep_analysis_direct_fetches: 0,
  background_batch_direct_fetches: 0,
  fetch_monkey_patches: 0,
  session_runtime: "provider-boundary",
  capability_runtime: "provider-boundary",
  product_authority_active: false,
  supabase_authority_unchanged: true
}));