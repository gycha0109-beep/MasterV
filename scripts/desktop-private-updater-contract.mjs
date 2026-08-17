import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cargo = read("src-tauri/Cargo.toml");
const main = read("src-tauri/src/main.rs");
const updater = read("src-tauri/src/updater.rs");
const bootstrap = JSON.parse(read("src-tauri/tauri.windows-updater-bootstrap.conf.json"));
const baseConfig = read("src-tauri/tauri.conf.json");
const releaseConfig = read("src-tauri/tauri.windows-release.conf.json");
const sessionBridge = read("desktop/session-bridge.js");
const updaterUi = read("desktop/updater.js");
const prepare = read("scripts/prepare-desktop-updater-bootstrap.mjs");
const installedLaunch = read("scripts/desktop-updater-installed-launch-windows.mjs");
const workflow = read(".github/workflows/desktop-private-updater-bootstrap.yml");
const publicKeyMatch = updater.match(/UPDATE_PUBLIC_KEY:\s*&str\s*=\s*"([^"]+)"/);
const rustPublicKey = publicKeyMatch?.[1] || "";

assert(cargo.includes('private-updater = ["dep:tauri-plugin-updater"]'), "private updater Cargo feature is missing");
assert(cargo.includes('tauri-plugin-updater = { version = "2", optional = true }'), "Rust updater dependency must be optional");
assert(/#\[cfg\(feature\s*=\s*"private-updater"\)\]\s*mod\s+updater;/.test(main), "updater module must be feature-gated");
assert(/#\[cfg\(feature\s*=\s*"private-updater"\)\]\s*let\s+builder\s*=\s*builder/.test(main), "updater plugin registration must be feature-gated");
assert(main.includes("tauri_plugin_updater::Builder::new()"), "native updater plugin is not registered in updater feature path");
assert(main.includes("desktop_update_check") && main.includes("desktop_update_install"), "native updater commands are not registered");
assert(workflow.includes("--features private-updater"), "bootstrap workflow must explicitly activate the private-updater Cargo feature");
assert(workflow.includes("Launch updater-enabled native runtime"), "bootstrap workflow must launch the updater-enabled runtime");
assert(workflow.includes("Capture updater runtime crash diagnostics"), "bootstrap workflow must preserve launch crash diagnostics");
assert(workflow.includes("Verify installed updater bootstrap launch and uninstall"), "bootstrap workflow must launch the installed updater-enabled runtime");
assert(workflow.includes("updater_installed_launch_verified = $true"), "bootstrap manifest must record installed runtime verification");
assert(installedLaunch.includes("MASTERV_DESKTOP_PRIVATE_UPDATER_INSTALLED_LAUNCH_PASS"), "installed updater launch smoke evidence marker is missing");
assert(installedLaunch.includes("/json/version") && installedLaunch.includes("/json/list"), "installed updater launch smoke must verify WebView2 CDP readiness");
assert(installedLaunch.includes('spawnSync(uninstaller, ["/S"]'), "installed updater launch smoke must uninstall the bootstrap candidate");
assert(updater.includes("masterv-update-channel?current_version={{current_version}}&target={{target}}"), "private dynamic updater endpoint is missing");
assert(updater.includes('UPDATE_TARGET: &str = "windows-x86_64"'), "private updater target is not frozen");
assert(updater.includes("Authorization") && updater.includes("apikey"), "authenticated updater request headers are missing");
assert(updater.includes("download_and_install"), "native updater install path is missing");
assert(!updater.includes("encrypted secret key"), "private updater signing key must never be embedded in source");
assert(bootstrap.version === "0.1.1", "bootstrap version must be 0.1.1");
assert(bootstrap.app?.withGlobalTauri === true, "bootstrap config must expose Tauri invoke only for updater UI build");
assert(bootstrap.bundle?.active === true, "bootstrap installer bundle must be active");
assert(bootstrap.bundle?.createUpdaterArtifacts === false, "bootstrap installer itself must not require updater signing artifacts");
assert(rustPublicKey.length > 0, "Rust updater public key authority is missing");
assert(bootstrap.plugins?.updater?.pubkey === rustPublicKey, "bootstrap plugins.updater.pubkey must match the Rust public key authority");
assert(Array.isArray(bootstrap.plugins?.updater?.endpoints) && bootstrap.plugins.updater.endpoints.length === 0, "bootstrap plugin config must not contain an unauthenticated static endpoint");
assert(bootstrap.plugins?.updater?.windows?.installMode === "passive", "Windows updater install mode must be passive");
assert(!baseConfig.includes("withGlobalTauri") && !baseConfig.includes("createUpdaterArtifacts"), "default desktop authority must remain updater-inactive");
assert(!releaseConfig.includes("withGlobalTauri") && !releaseConfig.includes("createUpdaterArtifacts"), "existing release readiness config must remain updater-inactive");
assert(sessionBridge.includes("let accessToken = null"), "session bridge must keep auth token in memory only");
for (const forbidden of ["localStorage", "sessionStorage", "indexedDB"]) {
  assert(!sessionBridge.includes(forbidden), `session bridge must not persist access token via ${forbidden}`);
}
assert(updaterUi.includes('invoke("desktop_update_check"') && updaterUi.includes('invoke("desktop_update_install"'), "updater UI must use native commands");
assert(!updaterUi.includes("fetch("), "updater UI must not bypass native updater verification with direct downloads");
assert(updaterUi.includes("업데이트 설치") && updaterUi.includes("자동 확인"), "updater user controls are incomplete");
assert(prepare.includes("session-bridge.js") && prepare.includes("updater.js"), "bootstrap static preparation is incomplete");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_PRIVATE_UPDATER_CONTRACT_PASS",
  bootstrap_version: bootstrap.version,
  channel: "private-test",
  cargo_feature: "private-updater",
  plugin_config_present: true,
  raw_runtime_launch_required: true,
  installed_runtime_launch_required: true,
  installed_uninstall_required: true,
  ordinary_runtime_updater_feature: false,
  authenticated_manifest: true,
  token_persistence: false,
  auto_install: false,
  bootstrap_create_updater_artifacts: false,
  existing_release_authority_changed: false
}));
