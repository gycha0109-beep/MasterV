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
const updaterUi = read("desktop/updater.js");
const prepare = read("scripts/prepare-desktop-updater-bootstrap.mjs");
const legacyConfigBridge = read("scripts/desktop-legacy-config-bridge.mjs");
const installedLaunch = read("scripts/desktop-updater-installed-launch-windows.mjs");
const workflow = read(".github/workflows/desktop-private-updater-bootstrap.yml");
const publicKeyMatch = updater.match(/UPDATE_PUBLIC_KEY:\s*&str\s*=\s*"([^"]+)"/);
const rustPublicKey = publicKeyMatch?.[1] || "";

assert(!fs.existsSync("desktop/session-bridge.js"), "removed session bridge must not return through updater bootstrap");
assert(cargo.includes('private-updater = ["dep:tauri-plugin-updater"]'), "private updater Cargo feature must include only the optional updater dependency");
assert(cargo.includes('serde_json = "1"'), "serde_json must remain a direct shared dependency for updater config codegen and local persistence");
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
assert(bootstrap.bundle?.createUpdaterArtifacts === false, "bootstrap signer itself must not require updater signing artifacts");
assert(rustPublicKey.length > 0, "Rust updater public key authority is missing");
assert(bootstrap.Plugins?.updater?.pubkey === rustPublicKey, "bootstrap plugins.updater.pubkey must match the Rust public key authority");
assert(Array.isArray(bootstrap.Plugins?.updater?.endpoints) && bootstrap.Plugins.updater.endpoints.length === 0, "bootstrap plugin config must not contain an unauthenticated static endpoint");
assert(bootstrap.Plugins?.updater?.windows?.installMode === "passive", "Windows updater install mode must be passive");
assert(!baseConfig.includes("withGlobalTauri") && !baseConfig.includes("createUpdaterArtifacts"), "default desktop authority must remain updater-inactive");
assert(!releaseConfig.includes("withGlobalTauri") && !releaseConfig.includes("createUpdaterArtifacts"), "existing release readiness config must remain updater-inactive");

assert(updaterUi.includes("window.MASTERV_BACKEND"), "updater UI must consume backend provider session runtime");
assert(updaterUi.includes("backend.session.current()"), "updater UI must read the current provider session through the backend boundary");
assert(updaterUi.includes("backend.session.subscribe"), "updater UI must follow provider session lifecycle through subscription");
assert(updaterUi.includes("window.MASTERV_UPDATER_BOOTSTRAP_CONFIG"), "updater UI must consume neutral updater bootstrap config");
assert(updaterUi.includes('invoke("desktop_update_check"') && updaterUi.includes('invoke("desktop_update_install"'), "updater UI must use native commands");
assert(!updaterUi.includes("fetch("), "updater UI must not bypass native updater verification with direct downloads");
assert(updaterUi.includes("업데이트 설치") && updaterUi.includes("자동 확인"), "updater user controls are incomplete");
for (const forbidden of ["MASTERV_SESSION_BRIDGE", "getAccessToken", "session-bridge.js", "supabase_publishable_key", "NEXT_PUBLIC_SUPABASE", "localStorage", "sessionStorage", "indexedDB"]) {
  assert(!updaterUi.includes(forbidden), `updater UI must not depend on removed/provider-specific client path: ${forbidden}`);
}

assert(prepare.includes("desktop-legacy-config-bridge.mjs"), "updater preparation must obtain transitional client config through the legacy config bridge");
assert(prepare.includes("MASTERV_UPDATER_BOOTSTRAP_CONFIG"), "updater preparation must emit a neutral updater bootstrap config");
assert(prepare.includes("updater.js"), "bootstrap static preparation must include updater.js");
assert(!prepare.includes("session-bridge.js"), "bootstrap preparation must not resurrect the removed session bridge");
for (const forbidden of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "supabase_url", "supabase_publishable_key"]) {
  assert(!prepare.includes(forbidden), `updater preparation must not own vendor config detail: ${forbidden}`);
}
assert(legacyConfigBridge.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "legacy config bridge must own current transitional publishable-key env mapping");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_PRIVATE_UPDATER_CONTRACT_PASS",
  bootstrap_version: bootstrap.version,
  channel: "private-test",
  cargo_feature: "private-updater",
  plugin_config_present: true,
  direct_serde_json_for_codegen: true,
  raw_runtime_launch_required: true,
  installed_runtime_launch_required: true,
  installed_uninstall_required: true,
  ordinary_runtime_updater_feature: false,
  authenticated_manifest: true,
  session_authority: "backend-provider",
  client_config_authority: "legacy-config-bridge",
  session_bridge_active: false,
  token_persistence: false,
  auto_install: false,
  bootstrap_create_updater_artifacts: false,
  existing_release_authority_changed: false
}));
