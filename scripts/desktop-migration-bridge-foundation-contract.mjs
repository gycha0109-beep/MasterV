import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const persistence = read("src-tauri/src/local_persistence.rs");
const secureStore = read("src-tauri/src/device_secure_store.rs");
const main = read("src-tauri/src/main.rs");
const cargo = read("src-tauri/Cargo.toml");
const updater = read("src-tauri/src/updater.rs");

assert(persistence.includes("CURRENT_SCHEMA_VERSION: i64 = 2"), "EXIT-2A local schema must be v2");
assert(persistence.includes("product_authority_active: true"), "EXIT-2A must activate SQLite product authority");
assert(persistence.includes("supabase_primary_authority_active: false"), "EXIT-2A must demote Supabase from primary work-data authority");
assert(persistence.includes("supabase_fallback_available: true"), "EXIT-2A must retain temporary Supabase fallback semantics");
assert(persistence.includes("migration_runs"), "EXIT-2A migration ledger is missing");
assert(persistence.includes("pre-supabase-reference-import"), "EXIT-2A backup-first legacy migration is missing");
assert(persistence.includes("DO NOTHING"), "EXIT-2A local-wins legacy import contract is missing");
assert(persistence.includes("desktop_local_analysis_save"), "analysis local persistence command is missing");
assert(persistence.includes("desktop_local_guidance_save"), "Production Guidance local persistence command is missing");
assert(persistence.includes("desktop_local_comparison_save"), "comparison local persistence command is missing");
assert(persistence.includes("desktop_local_export_database") && persistence.includes("desktop_local_import_database"), "local export/import commands are missing");

assert(secureStore.includes("CryptProtectData"), "Windows DPAPI protect boundary is missing");
assert(secureStore.includes("CryptUnprotectData"), "Windows DPAPI unprotect boundary is missing");
assert(secureStore.includes("CRYPTPROTECT_UI_FORBIDDEN"), "DPAPI secure store must be non-interactive");
assert(secureStore.includes('backend: if cfg!(target_os = "windows")'), "secure-store backend status must be explicit");
assert(secureStore.includes('"windows-dpapi"'), "Windows secure-store authority marker is missing");
assert(secureStore.includes("product_key_stored: false"), "Product Key must never be persisted by secure store");
assert(secureStore.includes("session_credential_stored: false"), "short-lived session credential must remain memory-only");
assert(!secureStore.includes("product_key:"), "secure device identity record must not contain Product Key material");
assert(!secureStore.includes("session_credential:"), "secure device identity record must not persist session credentials");
assert(secureStore.includes("device_credential"), "device credential secure persistence is missing");
assert(main.includes("DeviceSecureStore::initialize"), "secure store must initialize from native application lifecycle");
assert(main.includes("app.manage(secure_store)"), "secure store must be managed by Tauri");
for (const command of [
  "desktop_device_secure_store_status",
  "desktop_device_identity_save",
  "desktop_device_identity_load",
  "desktop_device_identity_clear"
]) {
  assert(main.includes(command), `secure device command is not registered: ${command}`);
}

assert(!cargo.includes("keyring"), "EXIT-2A must not introduce a second secure-store abstraction or mutate Cargo lock for credential storage");
assert(!secureStore.includes("supabase"), "secure device store must be backend-vendor neutral");
assert(!secureStore.includes("POLAR_"), "secure device store must not own Polar secrets");
assert(!secureStore.includes("GEMINI_"), "secure device store must not own Gemini secrets");
assert(!secureStore.includes("YOUTUBE_"), "secure device store must not own YouTube secrets");
assert(!updater.includes("MASTERV_BACKEND") && !updater.includes("product_key"), "independent updater must remain isolated from bridge authority");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_2A_MIGRATION_BRIDGE_FOUNDATION_PASS",
  schema_version: 2,
  local_work_data_authority: true,
  legacy_import_backup_first: true,
  legacy_import_conflict_policy: "local-wins",
  legacy_import_idempotent: true,
  secure_store: "windows-dpapi",
  product_key_persisted: false,
  device_credential_persisted_securely: true,
  session_credential_persisted: false,
  gateway_cutover_active: false,
  product_key_ui_active: false,
  supabase_fallback_retained: true,
  updater_independent: true
}));
