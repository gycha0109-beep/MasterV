import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
function assertNodeSyntax(path) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(result.status, 0, `${path} must parse under the pinned Node runtime: ${result.stderr || result.stdout}`);
}

const pkg = JSON.parse(read("package.json"));
const ci = read(".github/workflows/ci.yml");
const helper = read("scripts/windows-webview2-attach.mjs");
const runtime = read("scripts/desktop-windows-runtime-smoke.mjs");
const prepare = read("scripts/desktop-installed-prepare-windows.mjs");
const lifecycle = read("scripts/desktop-installed-session-uninstall-windows.mjs");
const defaultTauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const smokeTauri = JSON.parse(read("src-tauri/tauri.windows-smoke.conf.json"));

for (const script of [
  "scripts/desktop-windows-runtime-smoke.mjs",
  "scripts/desktop-installed-prepare-windows.mjs",
  "scripts/desktop-installed-session-uninstall-windows.mjs"
]) assertNodeSyntax(script);

assert.equal(pkg.scripts?.["test:desktop-installed-quality-contract"], "node scripts/desktop-installed-quality-contract.mjs");
assert.equal(pkg.scripts?.["test:desktop-windows-runtime"], "node scripts/desktop-windows-runtime-smoke.mjs");
assert.equal(pkg.scripts?.["test:desktop-installed-session-uninstall-windows"], "node scripts/desktop-installed-session-uninstall-windows.mjs");
assert.equal(defaultTauri.app?.withGlobalTauri, true, "vanilla Desktop runtime requires the Tauri global invoke bridge");
assert.equal(defaultTauri.bundle?.active, false, "Default Tauri bundle must remain inactive");
assert.equal(smokeTauri.bundle?.active, true, "Windows smoke override must remain installer-only authority");
assert.equal(defaultTauri.productName, "MasterV Desktop", "installed package authority must remain bound to the canonical Tauri product name");

assert(helper.includes("MASTERV_DESKTOP_APP_BINARY") && helper.includes("fs.existsSync(installed)"), "Windows launcher must support installed-binary authority");
assert(helper.includes("reuseDataDir") && helper.includes("options.dataDir"), "restart verification requires a reusable WebView profile");

for (const token of [
  'auth === "LOCAL ONLY"',
  'libraryStatus === "READY / LOCAL"',
  'libraryWorkspace === "local:masterv"',
  "desktop_local_reference_upsert",
  "desktop_local_reference_delete",
  "local canonical compare",
  "window.__TAURI__.core.invoke",
  "local_sqlite_process_restart_persistence",
  "legacy_login_ui_present",
  "legacy_migration_ui_present"
]) assert(runtime.includes(token), `EXIT-2C native runtime invariant missing: ${token}`);
assert(!runtime.includes("SUPABASE_TEST_EMAIL") && !runtime.includes("SUPABASE_TEST_PASSWORD"), "active Windows runtime smoke must not require legacy login credentials");
assert(!runtime.includes("/auth/v1/token") && !runtime.includes("/rest/v1/reference_library_entries"), "active Windows runtime smoke must not directly seed Supabase");

for (const token of ["/S", "Tauri productName", "uninstall registry entry not found after install", "uninstall registry entry is ambiguous", "installer_sha256", "installed_exe_sha256", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_TEST_PASSWORD", "TAURI_SIGNING_PRIVATE_KEY", "autorun_entries", "scheduled_tasks"]) {
  assert(prepare.includes(token), `installer preparation invariant missing: ${token}`);
}
assert(prepare.includes('tauriConfig.productName'), "installer registry authority must be derived from Tauri productName rather than a duplicated display-name literal");
assert(prepare.includes('registry.DisplayName === productName'), "installed registry DisplayName must be verified against Tauri productName");
assert(!prepare.includes("Where-Object { $_.DisplayName -eq 'MasterV' }"), "installer registry lookup must not use the obsolete MasterV display name");
assert(prepare.includes("GITHUB_ENV") && prepare.includes("MASTERV_DESKTOP_UNINSTALLER"), "installed authority must be exported only through CI process environment");

for (const token of [
  "process_restart_without_logout",
  "local_data_survived_process_restart",
  "local_data_access_without_gateway_session",
  "persistent_auth_storage",
  "localStorage",
  "sessionStorage",
  "direct_gemini_requests",
  "direct_youtube_data_api_requests",
  "local_next_api_requests",
  "desktop_local_reference_upsert",
  "desktop_local_reference_delete",
  "uninstall_registry_removed",
  "autorun_residue",
  "service_residue",
  "scheduled_task_residue",
  "waitForUninstallCleanup",
  "60_000",
  "uninstall_cleanup_wait_ms"
]) assert(lifecycle.includes(token), `installed local-first lifecycle invariant missing: ${token}`);
assert(lifecycle.includes("reuseDataDir: true"), "restart must reuse the same WebView profile");
assert(lifecycle.includes('spawnSync(uninstaller, ["/S"]'), "generated uninstaller must be exercised");
assert(!lifecycle.includes("SUPABASE_TEST_EMAIL") && !lifecycle.includes("SUPABASE_TEST_PASSWORD"), "installed lifecycle must not require legacy login credentials");

const nativeBuild = ci.indexOf("Build native Windows Tauri executable");
const nativeSmoke = ci.indexOf("Run native local-first Windows runtime smoke");
const installer = ci.indexOf("Build unsigned NSIS installer smoke");
const install = ci.indexOf("Install and audit unsigned NSIS quality candidate");
const installedLifecycle = ci.indexOf("Run installed local-first restart and uninstall quality smoke");
assert(nativeBuild >= 0 && nativeSmoke > nativeBuild, "native local-first smoke must run after executable build");
assert(installer > nativeSmoke && install > installer, "installer candidate must be built and installed after native runtime verification");
assert(installedLifecycle > install, "installed local-first lifecycle must run against the installed candidate");
for (const forbiddenStep of [
  "Hosted YouTube Discovery runtime smoke",
  "Guarded Background Batch runtime smoke",
  "Observe Hosted Deep Analysis provider health",
  "Observe Product Truth Production Guidance provider health"
]) assert(!ci.includes(forbiddenStep), `active 2C Windows quality job still runs legacy visible-runtime smoke: ${forbiddenStep}`);
assert(ci.includes("artifacts/desktop-installed-quality") && ci.includes("artifacts/desktop-windows-runtime"), "local-first runtime evidence must be uploaded");
assert(ci.includes("npm run test:desktop-installed-quality-contract"), "installed quality static contract must run in CI");

for (const forbidden of ["TAURI_SIGNING_PRIVATE_KEY:", "tauri signer", "actions/create-release", "softprops/action-gh-release", "tauri-action"]) {
  assert(!ci.toLowerCase().includes(forbidden.toLowerCase()), `quality CI must not activate release/signing behavior: ${forbidden}`);
}

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_INSTALLED_QUALITY_CONTRACT_PASS",
  migration_stage: "MV-SUPABASE-EXIT-2C",
  install_candidate: "unsigned-nsis",
  product_name_authority: "tauri.conf.json:productName",
  visible_auth: "product-key+device-resume",
  local_data_authority: "local-sqlite",
  restart_local_data_persistence_required: true,
  restart_auth_persistence_required: false,
  legacy_visible_runtime_smokes_active: false,
  uninstall_required: true,
  uninstall_cleanup_bounded: true,
  syntax_guarded: true,
  activation: false
}));
