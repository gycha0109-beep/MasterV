import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cargo = read("src-tauri/Cargo.toml");
const main = read("src-tauri/src/main.rs");
const persistence = read("src-tauri/src/local_persistence.rs");
const workflow = read(".github/workflows/mv-exit-3-clean-cut.yml");

assert(
  cargo.includes('rusqlite = { version = "=0.32.1", features = ["bundled", "backup"] }'),
  "local persistence must pin rusqlite 0.32.1 with bundled SQLite and backup support"
);
assert(cargo.includes('serde = { version = "1", features = ["derive"] }'), "local persistence must use direct serde serialization");
assert(cargo.includes('serde_json = "1"'), "local persistence must use direct serde_json validation");
assert(persistence.includes("CURRENT_SCHEMA_VERSION: i64 = 2"), "local schema version 2 authority is missing");
assert(persistence.includes('LOCAL_WORKSPACE_ID: &str = "local:masterv"'), "local workspace authority is missing");
for (const table of [
  "masterv_schema_meta",
  "reference_library_entries",
  "analysis_results",
  "comparison_entries",
  "production_guidance",
  "settings",
  "migration_runs"
]) {
  assert(persistence.includes(table), `local schema table is missing: ${table}`);
}
assert(persistence.includes("TransactionBehavior::Immediate"), "schema migration must acquire an immediate write transaction");
assert(persistence.includes("create_snapshot("), "pre-migration/pre-import snapshot path is missing");
assert(persistence.includes(".backup(DatabaseName::Main"), "SQLite Online Backup export/snapshot path is missing");
assert(persistence.includes(".restore("), "SQLite restore/import path is missing");
assert(persistence.includes("PRAGMA integrity_check"), "import/export integrity validation is missing");
assert(persistence.includes("pub fn export_to"), "export foundation is missing");
assert(persistence.includes("pub fn import_from"), "import foundation is missing");
assert(persistence.includes("product_authority_active: true"), "Local SQLite product authority must be active");
assert(persistence.includes("local_sqlite_authority_active: true"), "Local SQLite authority status marker is missing");
assert(persistence.includes("remote_fallback_available: false"), "clean cut must not expose a remote persistence fallback");

for (const command of [
  "desktop_local_workspace_id",
  "desktop_local_reference_library_list",
  "desktop_local_reference_detail",
  "desktop_local_reference_delete",
  "desktop_local_reference_upsert",
  "desktop_local_analysis_save",
  "desktop_local_comparison_save",
  "desktop_local_guidance_save",
  "desktop_local_export_database",
  "desktop_local_import_database"
]) {
  assert(main.includes(command), `native local authority command is not registered: ${command}`);
}
assert(main.includes("app.path().app_local_data_dir()"), "local database must use Tauri app-specific local data directory");
assert(!main.includes("app.path().app_data_dir()"), "local database must not use roaming app data on Windows");
assert(main.includes("LocalPersistence::initialize"), "local persistence startup initialization is missing");
assert(main.includes("app.manage(persistence)"), "local persistence state is not managed by Tauri");
assert(workflow.includes("ubuntu-22.04") && workflow.includes("windows-2025"), "EXIT-3 local persistence validation must preserve Linux and Windows native coverage");
assert(workflow.includes("npm run test:desktop-local-persistence"), "EXIT-3 must run the local persistence static contract");
assert(workflow.includes("cargo test --locked --manifest-path src-tauri/Cargo.toml local_persistence"), "EXIT-3 must run native local persistence tests");

console.log(JSON.stringify({
  status: "MASTERV_EXIT_3_LOCAL_SQLITE_AUTHORITY_REGRESSION_PASS",
  schema_version: 2,
  sqlite_mode: "bundled",
  data_directory: "app_local_data_dir",
  schema_migration_transaction: "immediate",
  export_import_foundation: true,
  cross_platform_native_test: true,
  product_authority_active: true,
  local_sqlite_authority_active: true,
  remote_persistence_fallback: false,
  central_database_added: false,
  architecture_stage: "MV-EXIT-3-CLEAN-CUT"
}));
