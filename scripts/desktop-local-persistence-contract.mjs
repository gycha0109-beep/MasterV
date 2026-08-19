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
const referenceHook = read("lib/use-persistent-reference-library.ts");
const workflow = read(".github/workflows/mv-supabase-exit-1a.yml");

assert(
  cargo.includes('rusqlite = { version = "=0.32.1", features = ["bundled", "backup"] }'),
  "local persistence must pin rusqlite 0.32.1 with bundled SQLite and backup support"
);
assert(cargo.includes('serde = { version = "1", features = ["derive"] }'), "local persistence must use direct serde serialization");
assert(cargo.includes('serde_json = "1"'), "local persistence must use direct serde_json validation");
assert(persistence.includes("CURRENT_SCHEMA_VERSION: i64 = 2"), "migration bridge must promote local schema to v2");
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
assert(persistence.includes("TransactionBehavior::Immediate"), "schema/import migration must acquire an immediate write transaction");
assert(persistence.includes("create_snapshot("), "pre-migration/pre-import snapshot path is missing");
assert(persistence.includes("pre-supabase-reference-import"), "legacy Reference Library migration must be backup-first");
assert(persistence.includes("ON CONFLICT(workspace_id, source_platform, source_id) DO NOTHING"), "legacy import must preserve local-wins conflict semantics");
assert(persistence.includes("LEGACY_REFERENCE_MIGRATION_ID"), "legacy migration idempotency marker is missing");
assert(persistence.includes(".backup(DatabaseName::Main"), "SQLite Online Backup export/snapshot path is missing");
assert(persistence.includes(".restore("), "SQLite restore/import path is missing");
assert(persistence.includes("PRAGMA integrity_check"), "import/export integrity validation is missing");
assert(persistence.includes("pub fn export_to"), "export foundation is missing");
assert(persistence.includes("pub fn import_from"), "import foundation is missing");
assert(persistence.includes("product_authority_active: true"), "0.1.2 bridge must activate local work-data authority");
assert(persistence.includes("supabase_primary_authority_active: false"), "Supabase must no longer be primary work-data authority in the bridge");
assert(persistence.includes("supabase_fallback_available: true"), "0.1.2 bridge must retain a scoped Supabase fallback");
for (const command of [
  "desktop_local_workspace_id",
  "desktop_local_reference_library_list",
  "desktop_local_reference_detail",
  "desktop_local_reference_delete",
  "desktop_local_reference_upsert",
  "desktop_local_analysis_save",
  "desktop_local_comparison_save",
  "desktop_local_guidance_save",
  "desktop_local_migrate_legacy_reference_library",
  "desktop_local_export_database",
  "desktop_local_import_database"
]) {
  assert(main.includes(command), `native local authority command is not registered: ${command}`);
}
assert(main.includes("app.path().app_local_data_dir()"), "local database must use Tauri app-specific local data directory");
assert(!main.includes("app.path().app_data_dir()"), "local database must not use roaming app data on Windows");
assert(main.includes("LocalPersistence::initialize"), "local persistence startup initialization is missing");
assert(main.includes("app.manage(persistence)"), "local persistence state is not managed by Tauri");
assert(referenceHook.includes('from "@/lib/supabase-auth"'), "0.1.2 bridge must not prematurely delete web/Supabase fallback code before EXIT-3");
assert(workflow.includes("ubuntu-22.04") && workflow.includes("windows-2025"), "local persistence CI must preserve Linux and Windows native coverage");
assert(workflow.includes("npm run test:desktop-local-persistence"), "CI must run the local persistence static contract");
assert(workflow.includes("cargo test --locked --manifest-path src-tauri/Cargo.toml local_persistence"), "CI must run native local persistence tests");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1A_LOCAL_SQLITE_FOUNDATION_REGRESSION_PASS",
  schema_version: 2,
  sqlite_mode: "bundled",
  data_directory: "app_local_data_dir",
  migration_transaction: "immediate",
  legacy_import_conflict_policy: "local-wins",
  pre_migration_backup: true,
  export_import_foundation: true,
  cross_platform_native_test: true,
  product_authority_active: true,
  supabase_primary_authority_active: false,
  supabase_fallback_available: true,
  central_database_added: false,
  bridge_stage: "EXIT-2A"
}));
