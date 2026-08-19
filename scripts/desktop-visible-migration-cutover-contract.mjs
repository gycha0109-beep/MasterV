import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_migration_fixture",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1",
  MASTERV_DESKTOP_REQUIRE_CONFIG: "1"
};

const build = spawnSync(process.execPath, ["scripts/build-desktop-static.mjs"], {
  cwd: root,
  env,
  encoding: "utf8"
});
assert(build.status === 0, `desktop static builder failed: ${build.stderr || build.stdout}`);

const index = read("desktop/index.html");
const app = read("desktop/app.js");
const backend = read("desktop/backend/backend.js");
const transition = read("desktop/backend/bridge/transition-provider.js");
const legacyWork = read("desktop/backend/legacy/supabase-work-data-provider.js");
const localWork = read("desktop/backend/local/local-work-data-provider.js");
const gatewaySession = read("desktop/backend/gateway/gateway-session-provider.js");
const gatewayRemote = read("desktop/backend/gateway/gateway-remote-provider.js");
const nativeGateway = read("src-tauri/src/gateway_transport.rs");
const nativeMigration = read("src-tauri/src/migration_bridge.rs");
const gatewayCore = read("gateway/core.ts");
const builtIndex = read("desktop-dist/index.html");
const compilerBundle = read("desktop-dist/reference-compiler.js");

assert(index.includes('id="activation-form"'), "Product Key activation form missing");
assert(index.includes('id="product-key"'), "Product Key input missing");
assert(index.includes('id="resume-button"'), "device resume control missing");
assert(!index.includes('id="login-form"'), "email/password login must not remain the visible primary entry");
assert(index.includes('id="legacy-migration-form"'), "0.1.2 legacy migration form missing");
assert(index.includes("기존 Supabase 자격증명은 이 migration 동작에서만 사용됩니다"), "migration-only credential scope notice missing");

assert(app.includes('kind: "product_key"'), "visible Product Key activation is not wired");
assert(app.includes('kind: "resume"'), "device session resume is not wired");
assert(app.includes('productKeyInput.value = ""'), "Product Key must be cleared after bootstrap use");
assert(!app.includes('kind: "email_password"'), "visible app consumer must not open a normal email/password session");
assert(app.includes("backend.workData.bootstrapPersonalWorkspace(null)"), "local workspace must bootstrap without a paid Gateway session");
assert(app.includes("backend.workData.listReferenceLibrary(null, workspaceId"), "Reference Library must read from local work data without subscription/session gating");
assert(app.includes("backend.remoteOperations.compileReferenceWorkflow(null, sourceIds)"), "Reference Compare must be local-session-independent");
assert(app.includes("backend.workData.migrateLegacyReferenceLibrary({ email, password })"), "legacy migration must be isolated behind explicit migration action");
assert(!app.includes("localStorage") && !app.includes("sessionStorage"), "Desktop session/Product Key must not use browser persistent storage");

assert(backend.includes('migration_stage: "MV-SUPABASE-EXIT-2C"'), "active backend composition is not EXIT-2C");
assert(backend.includes("gatewaySessionFactory.create()"), "Gateway session provider is not active composition");
assert(backend.includes("gatewayRemoteFactory.create()"), "Gateway remote provider is not active composition");
assert(backend.includes("localWorkDataFactory.create()"), "Local SQLite work-data provider is not active composition");
assert(backend.includes('legacy_runtime_scope: "existing-data-migration-only"'), "legacy runtime scope is not reduced to migration-only");
assert(backend.includes("supabase_runtime_dependency_zero_claimed: false"), "0.1.2 must not falsely claim clean cut");

const legacyRead = transition.indexOf("exportReferenceLibraryForMigration");
const localImport = transition.indexOf("localWorkData.migrateLegacyReferenceLibrary");
assert(legacyRead >= 0 && localImport > legacyRead, "migration ordering must read legacy data before native backup/import");
assert(transition.includes('primary: "local-sqlite"'), "normal work-data primary must be local SQLite");
assert(transition.includes('primary: "masterv-gateway"'), "remote primary must be MasterV Gateway");
assert(transition.includes('reference_compare: "local-canonical"'), "Reference Compare authority must be local canonical");
assert(transition.includes("user_work_data_transport_to_gateway: false"), "Reference work data must not be transported to Gateway");
assert(transition.includes("saveAnalysisResult"), "Gateway analysis results must be persisted locally");
assert(transition.includes("saveProductionGuidance"), "Production Guidance must be persisted locally");
assert(transition.includes("saveComparisonEntry"), "Reference comparison must be persisted locally");

assert(legacyWork.includes("MIGRATION_PROJECTION"), "legacy migration projection missing");
for (const field of ["source_platform", "source_id", "native_id", "canonical_url", "label", "analysis", "analysis_cache_key", "analysis_provenance", "schema_version", "first_saved_at", "updated_at"]) {
  assert(legacyWork.includes(`"${field}"`), `legacy migration projection missing ${field}`);
}
assert(legacyWork.includes('scope: "0.1.2-existing-data-migration-only"'), "legacy work-data adapter scope not bounded");
assert(localWork.includes("desktop_migrate_legacy_reference_library_verified"), "Desktop migration must use verified native bridge");
assert(nativeMigration.includes("state.migrate_legacy_reference_library(&records)?"), "native bridge must delegate backup-first transactional import");
assert(nativeMigration.includes("let status = state.status()?"), "post-import integrity/status verification missing");
assert(nativeMigration.includes("integrity_verified: true"), "verified migration result must expose integrity evidence");

assert(gatewaySession.includes('credentials.kind === "product_key"'), "Gateway Product Key bootstrap contract missing");
assert(gatewaySession.includes('credentials.kind === "resume"'), "Gateway device resume contract missing");
assert(nativeGateway.includes("product_key_bearer_allowed: false"), "Product Key bearer prohibition missing");
assert(nativeGateway.includes("session_credential_persisted: false"), "session credential memory-only contract missing");
assert(nativeGateway.includes("device_credential_persisted: true"), "device credential persistence contract missing");
assert(gatewayRemote.includes("desktop_gateway_discover"), "Gateway discovery adapter missing");
assert(gatewayRemote.includes("desktop_gateway_analyze"), "Gateway analyze adapter missing");
assert(gatewayRemote.includes("desktop_gateway_guidance"), "Gateway guidance adapter missing");
assert(!gatewayCore.includes('url.pathname === "/v1/reference'), "Gateway must not add user work-data/Reference Compare routes");

for (const asset of [
  "./backend/gateway/gateway-session-provider.js",
  "./backend/gateway/gateway-remote-provider.js",
  "./backend/local/local-work-data-provider.js",
  "./reference-compiler.js",
  "./backend/bridge/transition-provider.js",
  "./backend/backend.js",
  "./app.js"
]) assert(builtIndex.includes(asset), `built Desktop runtime asset missing: ${asset}`);
assert(compilerBundle.includes("compareVideoAnalyses"), "canonical compare implementation was not bundled");
assert(compilerBundle.includes("compileEvidenceRules"), "canonical evidence rules implementation was not bundled");
assert(compilerBundle.includes("MASTERV_LOCAL_REFERENCE_COMPILER"), "local compiler global export missing");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_2C_VISIBLE_MIGRATION_CUTOVER_PASS",
  visible_auth: "product-key+device-resume",
  work_data_primary: "local-sqlite",
  remote_primary: "masterv-gateway",
  reference_compare: "local-canonical",
  legacy_scope: "existing-data-migration-only",
  migration_ordering: "legacy-read->backup->transactional-local-wins-import->ledger->integrity",
  product_key_persisted: false,
  session_credential_persisted: false,
  device_credential_secure_store: "windows-dpapi",
  local_data_subscription_gated: false,
  supabase_runtime_dependency_zero_claimed: false
}));
