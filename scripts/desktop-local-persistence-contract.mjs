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
const desktopApp = read("desktop/app.js");
const ci = read(".github/workflows/ci.yml");

assert(
  cargo.includes('rusqlite = { version = "=0.32.1", features = ["bundled", "backup"] }'),
  "local persistence must pin rusqlite 0.32.1 with bundled SQLite and backup support"
);
assert(cargo.includes('serde = { version = "1", features = ["derive"] }'), "local persistence status must use direct serde serialization");
assert(cargo.includes('serde_json = "1"'), "local persistence must use direct serde_json validation");
assert(persistence.includes("CURRENT_SCHEMA_VERSION: i64 = 1"), "local schema v1 authority is missing");
for (const table of [
  "masterv_schema_meta",
  "reference_library_entries",
  "analysis_results",
  "comparison_entries",
  "production_guidance",
  "settings"
]) {
  assert(persistence.includes(table), `local schema table is missing: ${table}`);
}
assert(persistence.includes("TransactionBehavior::Immediate"), "schema migration must be transactional and acquire an immediate write transaction");
assert(persistence.includes("create_snapshot("), "pre-migration/pre-import snapshot path is missing");
assert(persistence.includes(".backup(DatabaseName::Main"), "SQLite Online Backup export/snapshot path is missing");
assert(persistence.includes(".restore("), "SQLite restore/import path is missing");
assert(persistence.includes("PRAGMA integrity_check"), "import/export integrity validation is missing");
assert(persistence.includes("pub fn export_to"), "export foundation is missing");
assert(persistence.includes("pub fn import_from"), "import foundation is missing");
assert(persistence.includes("product_authority_active: false"), "EXIT-1A must not activate local persistence as product authority");
assert(persistence.includes("supabase_authority_unchanged: true"), "EXIT-1A must declare the existing product authority unchanged");
assert(main.includes("mod local_persistence;"), "native local persistence module is not registered");
assert(main.includes("app.path().app_data_dir()"), "local database must use Tauri app-specific data directory");
assert(main.includes("LocalPersistence::initialize"), "local persistence startup initialization is missing");
assert(main.includes("app.manage(persistence)"), "local persistence state is not managed by Tauri");
assert(main.includes("desktop_local_persistence_status"), "bounded local persistence status command is missing");
assert(referenceHook.includes('from "@/lib/supabase-auth"'), "EXIT-1A must not replace current Supabase product authority");
assert(referenceHook.includes("createSessionReferenceLibraryStore"), "EXIT-1A must leave current Reference Library persistence wiring unchanged");
assert(!desktopApp.includes("desktop_local_persistence_status"), "EXIT-1A must not wire local persistence into product UI authority");
assert(ci.includes("npm run test:desktop-local-persistence"), "CI must run the local persistence static contract");
assert(ci.includes("cargo test --locked --manifest-path src-tauri/Cargo.toml local_persistence"), "CI must run native local persistence tests");

console.log(JSON.stringify({
  status: "MASTERV_SUPABASE_EXIT_1A_LOCAL_SQLITE_CONTRACT_PASS",
  schema_version: 1,
  sqlite_mode: "bundled",
  migration_transaction: "immediate",
  pre_migration_backup: true,
  export_import_foundation: true,
  product_authority_active: false,
  supabase_authority_unchanged: true,
  central_database_added: false,
  activation_allowed: false
}));
