import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

const tauriMain = read("src-tauri/src/main.rs");
const webviewAttach = read("scripts/windows-webview2-attach.mjs");
const sandboxHarness = read("scripts/desktop-lic-1-sandbox-e2e-windows.mjs");

for (const marker of [
  'MASTERV_DESKTOP_TEST_APP_DATA_DIR',
  'MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT',
  'requires MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT'
]) {
  assert(tauriMain.includes(marker), `Tauri test-only AppData isolation marker missing: ${marker}`);
}

for (const marker of [
  'options.appDataDir',
  'MASTERV_DESKTOP_TEST_APP_DATA_DIR',
  'appDataDir'
]) {
  assert(webviewAttach.includes(marker), `WebView harness AppData override marker missing: ${marker}`);
}

for (const marker of [
  'masterv-lic1-sandbox-appdata-',
  'appDataDir: localDataDir',
  'device-identity.dpapi',
  'MASTERV_DESKTOP_LIC_1_SANDBOX_E2E_LOCAL_STATE_PRESERVED',
  'desktop_app_data_isolated: true'
]) {
  assert(sandboxHarness.includes(marker), `Sandbox AppData isolation marker missing: ${marker}`);
}

assert(!sandboxHarness.includes("LOCALAPPDATA"), "Sandbox E2E must not delete or repurpose the real Windows LOCALAPPDATA authority");
assert(!sandboxHarness.includes("resetEphemeralLocalState"), "Sandbox E2E must not reset the real Tauri app-local-data directory");
assert(!sandboxHarness.includes('path.join(localAppData, identifier)'), "Sandbox E2E regained real app-data path construction");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_LIC_1_APPDATA_ISOLATION_CONTRACT_PASS",
  real_local_app_data_touched: false,
  test_app_data_authority: "process-temp-override",
  override_requires_test_remote_debugging: true,
  failed_activation_recovery_state_preserved: true
}));
