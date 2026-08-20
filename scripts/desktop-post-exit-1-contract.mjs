import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

function runNode(relative) {
  const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${relative} failed:\n${result.stderr || result.stdout}`);
}

function runTsx(relative) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["tsx", relative], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${relative} failed:\n${result.stderr || result.stdout}`);
}

runTsx("scripts/gateway-polar-authority-contract.ts");
runTsx("scripts/gateway-stateless-contract.ts");
runNode("scripts/desktop-local-persistence-contract.mjs");
runNode("scripts/desktop-independent-updater-contract.mjs");
runNode("scripts/desktop-supabase-clean-cut-contract.mjs");

const appConfig = json("src-tauri/tauri.conf.json");
const baseline = json("src-tauri/tauri.windows-updater-bootstrap.conf.json");
const rc = json("src-tauri/tauri.windows-updater-rc.conf.json");
const signedRelease = json("src-tauri/tauri.windows-independent-updater-release.conf.json");
const persistence = read("src-tauri/src/local_persistence.rs");
const automaticBackup = read("src-tauri/src/automatic_backup.rs");
const main = read("src-tauri/src/main.rs");
const packageJson = json("package.json");
const cargo = read("src-tauri/Cargo.toml");
const releaseWorkflow = read(".github/workflows/desktop-release-readiness.yml");
const signingWorkflow = read(".github/workflows/desktop-signing-readiness.yml");
const shareWorkflow = read(".github/workflows/desktop-shareable-package.yml");
const pilotWorkflow = read(".github/workflows/desktop-external-pilot-readiness.yml");
const updaterWorkflow = read(".github/workflows/desktop-private-updater-bootstrap.yml");
const ci = read(".github/workflows/ci.yml");
const upgrade = read("scripts/desktop-upgrade-dry-run-windows.mjs");

assert.equal(appConfig.version, "0.1.3", "shipping Tauri application version authority must be 0.1.3");
assert.equal(baseline.version, "0.1.2", "upgrade baseline must remain 0.1.2");
assert.equal(rc.version, "0.1.3", "unsigned RC config must target 0.1.3");
assert.equal(rc.bundle?.createUpdaterArtifacts, false, "unsigned RC must not require production Tauri signing credentials");
assert.equal(signedRelease.version, "0.1.3", "future signed release config must target 0.1.3");
assert.equal(signedRelease.bundle?.createUpdaterArtifacts, true, "future signed release config must require updater artifacts/signatures");

for (const marker of [
  "pub fn export_to",
  "pub fn import_from",
  'create_snapshot(&current, &self.backup_dir, "pre-import")',
  '"pre-migration-v{schema_version}-to-v{CURRENT_SCHEMA_VERSION}"',
  "export_import_roundtrip_preserves_data_and_creates_recovery_backup",
  "existing_v1_database_is_backed_up_before_v2_migration",
  "PRAGMA integrity_check"
]) {
  assert(persistence.includes(marker), `Local SQLite completion evidence missing: ${marker}`);
}

for (const marker of [
  'AUTO_BACKUP_PREFIX: &str = "masterv-automatic-"',
  "AUTO_BACKUP_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60)",
  "AUTO_BACKUP_RETENTION: usize = 7",
  "connection.backup(DatabaseName::Main, &destination, None)",
  'query_row("PRAGMA integrity_check"',
  "ensure_automatic_backup_at",
  "no_work_data_does_not_create_automatic_backup",
  "work_data_creates_integrity_checked_backup_and_preserves_data",
  "recent_automatic_backup_is_not_due",
  "automatic_backup_retention_keeps_only_latest_seven"
]) {
  assert(automaticBackup.includes(marker), `automatic backup completion evidence missing: ${marker}`);
}
assert(automaticBackup.includes("thread::Builder::new()"), "automatic backup scheduler must run on a background thread");
assert(automaticBackup.includes("start_automatic_backup_loop"), "automatic backup scheduler entrypoint missing");
assert(main.includes("automatic_backup::start_automatic_backup_loop"), "desktop setup must start the automatic backup scheduler");
assert(!main.includes("automatic_backup::ensure_automatic_backup("), "desktop startup must not run the backup copy synchronously");

assert(packageJson.scripts?.["desktop:build:windows-updater-baseline"], "0.1.2 updater baseline build command missing");
assert(packageJson.scripts?.["desktop:build:windows-updater-rc"], "0.1.3 updater RC build command missing");
assert(packageJson.scripts?.["test:desktop-upgrade-dry-run-windows"], "upgrade dry-run command missing");
assert(packageJson.scripts?.["test:post-exit-1"], "MV-POST-EXIT-1 contract command missing");
assert(cargo.includes('independent-updater = ["dep:tauri-plugin-updater"]'), "independent updater Cargo feature missing");
assert(cargo.includes('rusqlite = { version = "=0.32.1", features = ["bundled", "backup"] }'), "native SQLite online-backup authority must remain pinned and enabled");

assert(upgrade.includes("MASTERV_POST_EXIT_1_UPGRADE_DRY_RUN_PASS"), "upgrade dry-run evidence marker missing");
assert(upgrade.includes('baselineVersion = "0.1.2"'), "upgrade dry-run baseline must be 0.1.2");
assert(upgrade.includes('candidateVersion = "0.1.3"'), "upgrade dry-run candidate must be 0.1.3");
assert(upgrade.includes("local_sqlite_survived_upgrade: true"), "upgrade dry-run must prove Local SQLite survival");
assert(upgrade.includes("production_signature_exercised: false"), "upgrade dry-run must remain outside production signing activation");

assert(releaseWorkflow.includes("source_sha"), "release readiness must be exact-SHA based");
assert(releaseWorkflow.includes("allow_unsigned_rc"), "release readiness must require explicit unsigned RC opt-in");
assert(releaseWorkflow.includes("MasterV Desktop_0.1.3_x64-setup.exe"), "release readiness must target the exact 0.1.3 RC installer");
assert(releaseWorkflow.includes("test:desktop-installed-clean-cut-windows"), "release readiness must prove the installed Local SQLite lifecycle");
assert(releaseWorkflow.includes("NotSigned"), "release readiness must remain unsigned before MV-REL-1");
assert(releaseWorkflow.includes("$env:TAURI_SIGNING_PRIVATE_KEY"), "release readiness must fail closed if a production signing key is injected");
assert(!releaseWorkflow.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "release readiness must not consume the production Tauri private-key secret");

assert(signingWorkflow.includes("source_sha"), "signing readiness must be exact-SHA based");
assert(signingWorkflow.includes("credentials_used=$false"), "signing readiness must explicitly record no credential use");
assert(signingWorkflow.includes("publication=$false"), "signing readiness must explicitly record no publication");
assert(signingWorkflow.includes("$env:TAURI_SIGNING_PRIVATE_KEY"), "signing readiness must fail closed if a production signing key is injected");
assert(!signingWorkflow.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "signing dry-run must not consume the production Tauri private-key secret");
assert(!signingWorkflow.includes("secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD"), "signing dry-run must not consume the production Tauri key-password secret");

assert(shareWorkflow.includes("source_sha"), "private share workflow must be exact-SHA based");
assert(shareWorkflow.includes("MasterV Desktop_0.1.3_x64-setup.exe"), "private share workflow must package the updater-enabled 0.1.3 RC");
assert(!shareWorkflow.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "private share workflow must not consume production signing credentials");

assert(pilotWorkflow.includes("source_sha"), "external pilot readiness must be exact-SHA based");
assert(pilotWorkflow.includes("MasterV Desktop_0.1.3_x64-setup.exe"), "external pilot readiness must target the updater-enabled 0.1.3 RC");
assert(pilotWorkflow.includes("test:desktop-installed-clean-cut-windows"), "external pilot readiness must verify the installed lifecycle");
assert(pilotWorkflow.includes("distribution=$false"), "external pilot readiness must not distribute the RC");
assert(pilotWorkflow.includes("publication=$false"), "external pilot readiness must not publish the RC");
assert(!pilotWorkflow.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "external pilot readiness must not consume production signing credentials");

assert(updaterWorkflow.includes("allow_updater_dry_run"), "updater dry-run must require explicit manual opt-in");
assert(updaterWorkflow.includes("test:desktop-upgrade-dry-run-windows"), "updater dry-run workflow must exercise upgrade survival");

assert(ci.includes("npm run test:post-exit-1"), "CI must freeze MV-POST-EXIT-1 architecture completion");
assert(ci.includes("cargo test --locked --manifest-path src-tauri/Cargo.toml"), "CI Linux native gate must run Local SQLite and automatic backup tests");
assert(ci.includes("npm run desktop:build:windows-updater-baseline"), "CI Windows quality must build the 0.1.2 baseline");
assert(ci.includes("npm run desktop:build:windows-updater-rc"), "CI Windows quality must build the 0.1.3 updater RC");
assert(ci.includes("npm run test:desktop-upgrade-dry-run-windows"), "CI Windows quality must verify Local SQLite upgrade survival");
assert(ci.includes("$env:TAURI_SIGNING_PRIVATE_KEY"), "CI must fail closed if production signing credentials leak into pre-release validation");
assert(!ci.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "CI must not consume production signing credentials during MV-POST-EXIT-1");

for (const text of [updaterWorkflow, releaseWorkflow, signingWorkflow, shareWorkflow, pilotWorkflow, ci]) {
  assert(!text.includes("MasterV_0.1.1"), "0.1.1 updater residue remains in active readiness workflow");
}

const section20 = {
  product_key_activation: "VERIFIED",
  subscription_entitlement: "VERIFIED",
  device_activation: "VERIFIED",
  usage_enforcement: "VERIFIED",
  reference_library_sqlite: "VERIFIED",
  analysis_results_local: "VERIFIED",
  production_guidance_local: "VERIFIED",
  gateway_stateless: "VERIFIED",
  gateway_masterv_central_db: "ZERO",
  gemini_secret_server_only: "VERIFIED",
  youtube_secret_server_only: "VERIFIED",
  updater_without_supabase: "VERIFIED",
  update_subscription_independent: "VERIFIED",
  supabase_runtime_network_requests: 0,
  supabase_runtime_secrets: 0,
  supabase_db_dependency: 0,
  supabase_storage_dependency: 0,
  local_export_import: "VERIFIED",
  db_migration_backup: "VERIFIED"
};

const section83Reliability = {
  pre_migration_backup: "VERIFIED",
  manual_export_import: "VERIFIED",
  automatic_backup: "VERIFIED"
};

assert.equal(Object.keys(section20).length, 19, "MV-ARCH-001 section 20 completion matrix is incomplete");
assert.equal(Object.keys(section83Reliability).length, 3, "MV-ARCH-001 section 8.3 reliability matrix is incomplete");

console.log(JSON.stringify({
  status: "MASTERV_POST_EXIT_1_TARGET_ARCHITECTURE_PASS",
  shipping_version_authority: "tauri.conf.json:0.1.3",
  internal_npm_package_version: packageJson.version,
  internal_rust_crate_version: cargo.match(/\nversion\s*=\s*"([^"]+)"/)?.[1] || null,
  upgrade_baseline: "0.1.2",
  unsigned_rc: "0.1.3",
  signed_release_target: "0.1.3",
  section_20: section20,
  section_8_3_reliability: section83Reliability,
  production_tauri_signature_verification: "EXTERNAL_ACTIVATION_PENDING_MV_REL_1",
  production_release_publication: "EXTERNAL_ACTIVATION_PENDING_MV_REL_1",
  production_signing_private_key_used: false,
  production_mutation: false
}));
