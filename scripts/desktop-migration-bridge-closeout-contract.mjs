import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const backend = read("desktop/backend/backend.js");
const transition = read("desktop/backend/bridge/transition-provider.js");
const index = read("desktop/index.html");
const app = read("desktop/app.js");
const nativeMigration = read("src-tauri/src/migration_bridge.rs");
const updater = read("desktop/updater.js");
const updaterNative = read("src-tauri/src/updater.rs");
const updaterRelease = read("src-tauri/tauri.windows-independent-updater-release.conf.json");
const ci = read(".github/workflows/ci.yml");
const exit2c = read(".github/workflows/mv-supabase-exit-2c.yml");
const exit2cDoc = read("docs/architecture/MV-SUPABASE-EXIT-2C-VISIBLE-MIGRATION-CUTOVER.md");
const closeout = read("docs/architecture/MV-SUPABASE-0.1.2-MIGRATION-BRIDGE-CLOSEOUT.md");

for (const marker of [
  'adapter_mode: "0.1.2-visible-migration-cutover"',
  "production_ui_cutover_active: true",
  "product_authority_active: true",
  "local_sqlite_authority_active: true",
  "gateway_active: true",
  "polar_active: true",
  "supabase_primary_authority_active: false",
  'legacy_runtime_scope: "existing-data-migration-only"',
  "supabase_runtime_dependency_zero_claimed: false",
  'update_channel: "independent-tauri-signed"'
]) assert(backend.includes(marker), `0.1.2 backend authority drift: ${marker}`);

assert(index.includes('id="activation-form"'), "Product Key activation must remain visible");
assert(index.includes('id="legacy-migration-form"'), "explicit legacy migration UI missing");
assert(!index.includes('id="login-form"'), "normal email/password login must not return");
assert(app.includes('kind: "product_key"'), "Product Key activation wiring missing");
assert(app.includes('kind: "resume"'), "device resume wiring missing");
assert(app.includes("migrateLegacyReferenceLibrary"), "explicit legacy migration consumer missing");
assert(!app.includes("localStorage") && !app.includes("sessionStorage"), "Product Key/session must not use browser persistent storage");

for (const marker of [
  'primary: "local-sqlite"',
  'fallback: "none-for-normal-work-data"',
  'legacy_scope: "existing-data-migration-only"',
  'migration_policy: "backup-first+transactional+local-wins+idempotent+post-import-integrity"',
  'primary: "masterv-gateway"',
  'reference_compare: "local-canonical"',
  "background_job_restart_durability: false",
  'background_result_persistence: "local-sqlite"',
  "user_work_data_transport_to_gateway: false",
  'legacy_scope: "0.1.2-migration-only"'
]) assert(transition.includes(marker), `0.1.2 transition authority drift: ${marker}`);

const legacyRead = transition.indexOf("exportReferenceLibraryForMigration");
const localImport = transition.indexOf("localWorkData.migrateLegacyReferenceLibrary");
assert(legacyRead >= 0 && localImport > legacyRead, "legacy export must precede verified local import");
assert(transition.includes('openSession({ kind: "email_password", email, password })'), "migration-only legacy session bootstrap missing");
assert(transition.includes("await legacySession.closeSession(migrationSession)"), "legacy migration session must be discarded");

for (const marker of [
  "state.migrate_legacy_reference_library(&records)?",
  "let status = state.status()?",
  "integrity_verified: true"
]) assert(nativeMigration.includes(marker), `verified native migration boundary drift: ${marker}`);

assert(updater.includes("MASTERV_UPDATER_CONFIG"), "independent updater config missing");
assert(!updater.includes("MASTERV_BACKEND"), "updater must not depend on application backend session");
assert(!updater.includes("NEXT_PUBLIC_SUPABASE"), "updater must not depend on Supabase runtime config");
assert(!updaterNative.includes("Authorization"), "native updater must not send application authorization");
assert(!updaterNative.includes("apikey"), "native updater must not send Supabase API key");
const updaterConfig = JSON.parse(updaterRelease);
assert(updaterConfig.version === "0.1.2", "independent updater release config must target 0.1.2");
assert(updaterConfig.bundle?.createUpdaterArtifacts === true, "0.1.2 updater artifacts must remain enabled");
assert(updaterConfig.plugins?.updater?.endpoints?.[0] === "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json", "independent updater endpoint drift");
assert(String(updaterConfig.plugins?.updater?.pubkey || "").length > 0, "updater verification public key missing");

assert(ci.includes("NEXT_PUBLIC_SUPABASE_URL"), "0.1.2 migration-era Supabase config unexpectedly removed before EXIT-3");
assert(ci.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "0.1.2 migration-era publishable key unexpectedly removed before EXIT-3");
assert(ci.includes('if ($env:SUPABASE_SERVICE_ROLE_KEY) { throw'), "desktop CI must reject Supabase admin credentials");
assert(!ci.includes("feat/mvp-foundation"), "feature-branch push trigger must not return to CI");
assert(exit2c.includes("pull_request:"), "EXIT-2C PR regression gate missing");
assert(!exit2c.includes("feat/mvp-foundation"), "feature-branch push trigger must not return to EXIT-2C");
assert(exit2c.includes("desktop-migration-bridge-closeout-contract.mjs"), "0.1.2 closeout freeze step missing from EXIT-2C workflow");

assert(exit2cDoc.includes("Status: CLOSED"), "EXIT-2C must remain closed");
assert(closeout.includes("Status: CLOSED"), "0.1.2 Migration Bridge closeout document must remain closed");
assert(closeout.includes("0.1.2 Migration Bridge = STRICT SUCCESS / CLOSED"), "0.1.2 closeout classification missing");
assert(closeout.includes("SUPABASE_RUNTIME_DEPENDENCY = ZERO = NOT CLAIMED"), "0.1.2 must explicitly preserve the no-zero-claim boundary");
assert(closeout.includes("EXIT-3 / 0.1.3        = READY TO START / NOT STARTED"), "0.1.3 handoff boundary missing");

console.log(JSON.stringify({
  status: "MASTERV_0_1_2_MIGRATION_BRIDGE_CLOSEOUT_PASS",
  release_track: "0.1.2",
  product_key_activation: true,
  polar_authority: true,
  gateway_authority: "stateless-masterv-gateway",
  local_sqlite_authority: true,
  existing_data_migration: "backup-first+transactional+local-wins+idempotent+post-import-integrity",
  updater_channel: "independent-tauri-signed",
  legacy_supabase_scope: "migration/fallback-only",
  supabase_runtime_dependency_zero_claimed: false,
  clean_cut_stage: "0.1.3-not-started"
}));
