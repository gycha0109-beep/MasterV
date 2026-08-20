import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const cargo = read("src-tauri/Cargo.toml");
const main = read("src-tauri/src/main.rs");
const updater = read("src-tauri/src/updater.rs");
const updaterUi = read("desktop/updater.js");
const prepare = read("scripts/prepare-desktop-updater-bootstrap.mjs");
const appConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
const baseline = JSON.parse(read("src-tauri/tauri.windows-updater-bootstrap.conf.json"));
const rc = JSON.parse(read("src-tauri/tauri.windows-updater-rc.conf.json"));
const release = JSON.parse(read("src-tauri/tauri.windows-independent-updater-release.conf.json"));
const installedLaunch = read("scripts/desktop-independent-updater-installed-launch-windows.mjs");
const upgradeDryRun = read("scripts/desktop-upgrade-dry-run-windows.mjs");
const workflow = read(".github/workflows/desktop-private-updater-bootstrap.yml");
const manifestBuilder = read("scripts/desktop-independent-update-manifest.mjs");

const publicKeyMatch = updater.match(/UPDATE_PUBLIC_KEY:\s*&str\s*=\s*"([^"]+)"/);
const rustPublicKey = publicKeyMatch?.[1] || "";
const staticEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";

assert.equal(appConfig.version, "0.1.3", "Tauri application release authority must be 0.1.3");
assert(cargo.includes('independent-updater = ["dep:tauri-plugin-updater"]'), "independent updater Cargo feature is missing");
assert(!cargo.includes("private-updater ="), "legacy private-updater Cargo feature must be retired");
assert(cargo.includes('tauri-plugin-updater = { version = "2", optional = true }'), "Tauri updater dependency must remain optional");
assert(/#\[cfg\(feature\s*=\s*"independent-updater"\)\]\s*mod\s+updater;/.test(main), "independent updater module must be feature-gated");
assert(/#\[cfg\(feature\s*=\s*"independent-updater"\)\]\s*let\s+builder\s*=\s*builder/.test(main), "independent updater plugin registration must be feature-gated");
assert(main.includes("tauri_plugin_updater::Builder::new()"), "Tauri updater plugin registration is missing");
assert(main.includes("desktop_update_check") && main.includes("desktop_update_install"), "native updater commands are not registered");

for (const forbidden of ["supabase", "Authorization", "apikey", "access_token", "publishable", "product_key", "POLAR_", "GATEWAY_"]) {
  assert.equal(updater.includes(forbidden), false, `native updater must not depend on application authority: ${forbidden}`);
}
assert(updater.includes("download_and_install"), "native updater install path is missing");
assert(updater.includes('UPDATE_TARGET: &str = "windows-x86_64"'), "independent updater target must remain explicit");
assert(rustPublicKey.length > 0, "Tauri updater public key authority is missing");
assert(!updater.includes("header("), "independent updater must not attach application auth headers");

for (const config of [baseline, rc, release]) {
  assert.equal(config.plugins?.updater?.pubkey, rustPublicKey, "Tauri updater config public key must match Rust authority");
  assert.deepEqual(config.plugins?.updater?.endpoints, [staticEndpoint], "independent updater must use the static GitHub release manifest endpoint");
  assert.equal(config.plugins?.updater?.windows?.installMode, "passive", "Windows updater install mode must remain passive");
}
assert.equal(baseline.version, "0.1.2", "post-exit upgrade baseline must be the 0.1.2 migration bridge");
assert.equal(baseline.bundle?.active, true, "0.1.2 updater baseline bundle must be active");
assert.equal(baseline.bundle?.createUpdaterArtifacts, false, "0.1.2 baseline must not emit new release updater artifacts");
assert.equal(rc.version, "0.1.3", "unsigned updater RC must target 0.1.3");
assert.equal(rc.bundle?.active, true, "0.1.3 updater RC bundle must be active");
assert.equal(rc.bundle?.createUpdaterArtifacts, false, "unsigned 0.1.3 RC must not require the production signing private key");
assert.equal(release.version, "0.1.3", "signed updater release config must target 0.1.3");
assert.equal(release.bundle?.active, true, "signed updater release bundle must be active");
assert.equal(release.bundle?.createUpdaterArtifacts, true, "signed 0.1.3 release config must create Tauri updater artifacts");

assert(updaterUi.includes("window.MASTERV_UPDATER_CONFIG"), "updater UI must consume the independent updater config");
assert(updaterUi.includes('invoke("desktop_update_check")') && updaterUi.includes('invoke("desktop_update_install")'), "updater UI must use native Tauri commands");
assert(updaterUi.includes("subscription_independent"), "updater UI must expose subscription-independent authority");
assert(updaterUi.includes("로그인·구독 상태와 무관"), "updater UI must clearly state login/subscription independence");
assert(!updaterUi.includes("window.MASTERV_BACKEND"), "updater UI must not depend on backend session authority");
assert(!updaterUi.includes("backend.session"), "updater UI must not depend on backend session lifecycle");
assert(!updaterUi.includes("client_key"), "updater UI must not carry a legacy client key");
assert(!updaterUi.includes("fetch("), "updater UI must not bypass native signature verification with direct download logic");
for (const forbidden of ["supabase", "Authorization", "apikey", "MASTERV_SESSION_BRIDGE", "getAccessToken", "localStorage", "sessionStorage", "indexedDB"]) {
  assert.equal(updaterUi.includes(forbidden), false, `updater UI contains forbidden updater coupling: ${forbidden}`);
}

assert(prepare.includes("MASTERV_UPDATER_CONFIG"), "updater preparation must emit independent updater config");
assert(prepare.includes('channel: "stable"'), "updater preparation must use the stable channel label");
assert(prepare.includes('transport: "tauri-static-signed"'), "updater preparation must declare the Tauri static signed transport");
assert(prepare.includes("subscription_independent: true"), "updater preparation must declare subscription independence");
assert(!prepare.includes("desktop-legacy-config-bridge"), "updater preparation must not read legacy backend config");
assert(!prepare.includes("client_key"), "updater preparation must not emit a client key");
assert(!prepare.includes("NEXT_PUBLIC_SUPABASE"), "updater preparation must not read Supabase environment variables");

assert(workflow.includes("source_sha"), "manual updater validation must require an exact source SHA");
assert(workflow.includes("0.1.2"), "manual updater validation must build the 0.1.2 baseline");
assert(workflow.includes("0.1.3"), "manual updater validation must build the 0.1.3 RC");
assert(workflow.includes("desktop-independent-updater-contract.mjs"), "manual updater validation must run the updater contract");
assert(workflow.includes("desktop-upgrade-dry-run-windows.mjs"), "manual updater validation must exercise the installer upgrade dry-run");
for (const forbidden of ["NEXT_PUBLIC_SUPABASE", "SUPABASE_TEST_", "masterv-update-channel", "desktop-private-updater-channel-smoke.mjs", "--features private-updater", "MasterV_0.1.1"] ) {
  assert.equal(workflow.includes(forbidden), false, `manual updater workflow still owns legacy updater coupling: ${forbidden}`);
}

assert(installedLaunch.includes("MASTERV_DESKTOP_INDEPENDENT_UPDATER_INSTALLED_LAUNCH_PASS"), "installed updater baseline launch evidence marker is missing");
assert(installedLaunch.includes('version: "0.1.2"'), "installed updater baseline launch must record version 0.1.2");
assert(installedLaunch.includes("/json/version") && installedLaunch.includes("/json/list"), "installed updater launch must verify WebView2 CDP readiness");
assert(upgradeDryRun.includes("MASTERV_POST_EXIT_1_UPGRADE_DRY_RUN_PASS"), "0.1.2 -> 0.1.3 upgrade evidence marker is missing");
assert(upgradeDryRun.includes("local_sqlite_survived_upgrade"), "upgrade dry-run must verify Local SQLite survival");

assert(manifestBuilder.includes('"windows-x86_64"'), "static update manifest builder must emit the custom Windows target");
assert(manifestBuilder.includes("signature"), "static update manifest builder must embed the Tauri signature content");
assert(manifestBuilder.includes("https:"), "static update manifest builder must enforce HTTPS installer URLs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "masterv-updater-contract-"));
try {
  const signaturePath = path.join(tmp, "MasterV Desktop_0.1.3_x64-setup.exe.sig");
  const outputPath = path.join(tmp, "latest.json");
  const syntheticSignature = "synthetic-tauri-signature-content";
  fs.writeFileSync(signaturePath, `${syntheticSignature}\n`, "utf8");
  const env = {
    ...process.env,
    MASTERV_UPDATE_VERSION: "0.1.3",
    MASTERV_UPDATE_INSTALLER_URL: "https://github.com/gycha0109-beep/MasterV/releases/download/v0.1.3/MasterV%20Desktop_0.1.3_x64-setup.exe",
    MASTERV_UPDATE_SIGNATURE_PATH: signaturePath,
    MASTERV_UPDATE_MANIFEST_PATH: outputPath,
    MASTERV_UPDATE_NOTES: "Synthetic MV-POST-EXIT-1 manifest contract",
    MASTERV_UPDATE_PUB_DATE: "2026-08-20T00:00:00Z"
  };
  const generated = spawnSync(process.execPath, ["scripts/desktop-independent-update-manifest.mjs"], { cwd: root, env, encoding: "utf8" });
  assert.equal(generated.status, 0, `static update manifest generation failed: ${generated.stderr || generated.stdout}`);
  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(manifest.version, "0.1.3");
  assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64"]);
  assert.equal(manifest.platforms["windows-x86_64"].signature, syntheticSignature, "latest.json must embed signature contents, not a .sig path");
  assert.equal(manifest.platforms["windows-x86_64"].url, env.MASTERV_UPDATE_INSTALLER_URL, "latest.json installer URL mismatch");

  const insecure = spawnSync(process.execPath, ["scripts/desktop-independent-update-manifest.mjs"], {
    cwd: root,
    env: { ...env, MASTERV_UPDATE_INSTALLER_URL: "http://example.invalid/MasterV.exe" },
    encoding: "utf8"
  });
  assert.notEqual(insecure.status, 0, "manifest builder must reject insecure installer URLs");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: "MASTERV_POST_EXIT_1_INDEPENDENT_UPDATER_PASS",
  application_version: "0.1.3",
  upgrade_baseline_version: "0.1.2",
  unsigned_rc_version: "0.1.3",
  signed_release_target_version: "0.1.3",
  static_manifest_endpoint: staticEndpoint,
  updater_session_authority: "none",
  subscription_independent: true,
  supabase_updater_dependency: false,
  gateway_dependency: false,
  polar_dependency: false,
  product_key_dependency: false,
  tauri_signature_required: true,
  production_signature_exercised: false,
  production_release_published: false
}));
