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
  'const preserveActivationState = fs.existsSync(deviceIdentityPath)',
  'MASTERV_DESKTOP_LIC_1_SANDBOX_E2E_LOCAL_STATE_PRESERVED',
  'desktop_app_data_isolated: true',
  'local_activation_state_preserved: true',
  'Guidance safety requires authoritative pre-charge BASIC credits=29',
  'Guidance authoritative readback expected BASIC credits=28',
  'masterv-lic1-sandbox-post-guidance-resume',
  'Post-Guidance restart must not charge again',
  'post_guidance_restart_verified: guidanceChargeAllowed',
  'credits_before_guidance:',
  'credits_after_guidance_restart:'
]) {
  assert(sandboxHarness.includes(marker), `Sandbox AppData/Guidance safety marker missing: ${marker}`);
}

assert(!sandboxHarness.includes("LOCALAPPDATA"), "Sandbox E2E must not delete or repurpose the real Windows LOCALAPPDATA authority");
assert(!sandboxHarness.includes("resetEphemeralLocalState"), "Sandbox E2E must not reset the real Tauri app-local-data directory");
assert(!sandboxHarness.includes('path.join(localAppData, identifier)'), "Sandbox E2E regained real app-data path construction");
assert(!sandboxHarness.includes('const preserveRecoveryState = !completed'), "Successful activation state must not be deleted merely because the E2E completed");
assert(/if \(guidanceChargeAllowed\) \{[\s\S]*?resumedCredits === 29[\s\S]*?charged_units === 1[\s\S]*?finalCredits === 28[\s\S]*?postGuidanceRestartCredits === finalCredits/.test(sandboxHarness), "Guidance charge lifecycle must prove 29 → 28 and stable post-charge restart readback");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_LIC_1_APPDATA_ISOLATION_CONTRACT_PASS",
  real_local_app_data_touched: false,
  test_app_data_authority: "process-temp-override",
  override_requires_test_remote_debugging: true,
  activation_recovery_state_preserved: true,
  successful_activation_state_preserved: true,
  guidance_precharge_balance_required: 29,
  guidance_charged_units_required: 1,
  guidance_postcharge_balance_required: 28,
  post_guidance_restart_no_double_charge_required: true
}));
