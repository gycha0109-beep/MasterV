import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const normalize = (value) => value.replace(/\r\n?/g, "\n");

const hotfixVersion = "0.1.4";
const hotfixTag = "v0.1.4";
const baselineVersion = "0.1.3";
const baselineTag = "v0.1.3";
const latestEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";
const canonicalInstaller = `MasterV_${hotfixVersion}_x64-setup.exe`;
const canonicalSignature = `${canonicalInstaller}.sig`;
const productionUpdaterKeyId = "D72C34948864513E";

const updaterUi = read("desktop/updater.js");
const desktopIndex = read("desktop/index.html");
const nativeUpdater = read("src-tauri/src/updater.rs");
const hotfixPrepare = read("scripts/prepare-desktop-rel-1b-hotfix.mjs");
const hotfixRc = json("src-tauri/tauri.windows-updater-hotfix-rc.conf.json");
const hotfixRelease = json("src-tauri/tauri.windows-updater-hotfix-release.conf.json");
const packageJson = json("package.json");
const ci = normalize(read(".github/workflows/ci.yml"));
const workflow = normalize(read(".github/workflows/desktop-production-hotfix-release.yml"));
const rcSmoke = read("scripts/desktop-rel-1b-hotfix-windows.mjs");
const publishedSmoke = read("scripts/desktop-rel-1b-published-updater-windows.mjs");

assert(desktopIndex.includes('<header class="hero">'), "MV-REL-1B requires the real Desktop hero element to remain header.hero");
assert(updaterUi.includes('document.querySelector("header.hero")'), "MV-REL-1B updater bootstrap must target header.hero");
assert(!updaterUi.includes('document.querySelector("section.hero")'), "MV-REL-1B must remove the broken section.hero selector");
assert(updaterUi.includes('panel.id = "desktop-updater-panel"'), "MV-REL-1B updater panel creation marker is missing");
assert(updaterUi.includes('setTimeout(() => checkForUpdate(true), 500)'), "MV-REL-1B automatic updater check marker is missing");

for (const marker of [
  'const hotfixVersion = "0.1.4"',
  'const previousVersion = "0.1.3"',
  'html.replaceAll(previousVersion, hotfixVersion)',
  '"release_track"',
  'MASTERV_REL_1B_DESKTOP_HOTFIX_PREPARE_PASS'
]) {
  assert(hotfixPrepare.includes(marker), `MV-REL-1B hotfix prepare marker missing: ${marker}`);
}

assert.equal(hotfixRc.version, hotfixVersion, "MV-REL-1B unsigned hotfix RC must target 0.1.4");
assert.equal(hotfixRc.bundle?.createUpdaterArtifacts, false, "MV-REL-1B unsigned hotfix RC must not create signed updater artifacts");
assert.equal(hotfixRelease.version, hotfixVersion, "MV-REL-1B production hotfix release must target 0.1.4");
assert.equal(hotfixRelease.bundle?.createUpdaterArtifacts, true, "MV-REL-1B production hotfix release must create Tauri updater artifacts");
assert.deepEqual(hotfixRc.plugins?.updater?.endpoints, [latestEndpoint], "MV-REL-1B RC must use the stable latest.json channel");
assert.deepEqual(hotfixRelease.plugins?.updater?.endpoints, [latestEndpoint], "MV-REL-1B release must use the stable latest.json channel");

const publicKeyMatch = nativeUpdater.match(/UPDATE_PUBLIC_KEY:\s*&str\s*=\s*"([^"]+)"/);
const rustPublicKey = publicKeyMatch?.[1] || "";
assert(rustPublicKey, "MV-REL-1B native updater public key authority is missing");
assert.equal(hotfixRc.plugins?.updater?.pubkey, rustPublicKey, "MV-REL-1B RC public key must match native updater authority");
assert.equal(hotfixRelease.plugins?.updater?.pubkey, rustPublicKey, "MV-REL-1B release public key must match native updater authority");
const publicKeyLines = Buffer.from(rustPublicKey, "base64").toString("utf8").trim().split(/\r?\n/);
assert.equal(publicKeyLines[0], `untrusted comment: minisign public key: ${productionUpdaterKeyId}`, "MV-REL-1B production updater key ID mismatch");

assert.equal(
  packageJson.scripts?.["desktop:build:windows-updater-hotfix-rc"],
  "tauri build --features independent-updater --bundles nsis --config src-tauri/tauri.windows-updater-hotfix-rc.conf.json",
  "MV-REL-1B hotfix RC build command is missing"
);
assert.equal(
  packageJson.scripts?.["desktop:build:windows-updater-hotfix-release"],
  "tauri build --features independent-updater --bundles nsis --config src-tauri/tauri.windows-updater-hotfix-release.conf.json",
  "MV-REL-1B hotfix release build command is missing"
);
assert.equal(packageJson.scripts?.["test:desktop-rel-1b-hotfix-windows"], "node scripts/desktop-rel-1b-hotfix-windows.mjs", "MV-REL-1B RC runtime smoke command is missing");
assert.equal(packageJson.scripts?.["test:desktop-rel-1b-published-updater-windows"], "node scripts/desktop-rel-1b-published-updater-windows.mjs", "MV-REL-1B published runtime smoke command is missing");
assert.equal(packageJson.scripts?.["test:rel-1b"], "node scripts/desktop-rel-1b-contract.mjs", "MV-REL-1B contract command is missing");

for (const marker of [
  "npm run test:rel-1b",
  "npm run desktop:build:windows-updater-hotfix-rc",
  "npm run test:desktop-rel-1b-hotfix-windows",
  "masterv-0.1.4-rel-1b-hotfix-rc"
]) {
  assert(ci.includes(marker), `MV-REL-1B CI marker missing: ${marker}`);
}
assert(!ci.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "MV-REL-1B PR CI must not consume the production Tauri private key");

for (const marker of [
  "workflow_dispatch:",
  "source_sha:",
  "allow_production_signing:",
  "allow_release_publication:",
  `RELEASE_VERSION: ${hotfixVersion}`,
  `RELEASE_TAG: ${hotfixTag}`,
  canonicalInstaller,
  canonicalSignature,
  "environment: masterv-production-release",
  "secrets.TAURI_SIGNING_PRIVATE_KEY",
  "secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "git rev-parse origin/main",
  "npm run test:rel-1b",
  "npm run desktop:build:windows-updater-hotfix-release",
  "gh release create",
  "gh release upload",
  "--draft=false --latest",
  "npm run test:desktop-rel-1b-published-updater-windows",
  "masterv-0.1.4-signed-hotfix-release-candidate",
  "masterv-0.1.4-published-updater-verification"
]) {
  assert(workflow.includes(marker), `MV-REL-1B production workflow marker missing: ${marker}`);
}
assert(!/^\s*pull_request\s*:/m.test(workflow), "MV-REL-1B production workflow must never run on pull_request");
assert(!/^\s*push\s*:/m.test(workflow), "MV-REL-1B production workflow must never run automatically on push");
assert(workflow.includes("if: ${{ inputs.allow_production_signing == true }}"), "MV-REL-1B production signing must require explicit opt-in");
assert(workflow.includes("inputs.allow_release_publication == true"), "MV-REL-1B publication must require explicit opt-in");
assert(workflow.includes(`MasterV ${hotfixVersion} — Updater Bootstrap Hotfix`), "MV-REL-1B release notes title is missing");

for (const marker of [
  'const baselineVersion = "0.1.3"',
  'const baselineTag = "v0.1.3"',
  '"0.1.4"',
  "baselineInstallerUrl",
  "window.__TAURI__.core.invoke('desktop_update_check')",
  "window.__TAURI__.core.invoke('desktop_update_install')",
  "baseline_ui_bootstrap_defect_reproduced: true",
  "tauri_signature_verified_by_successful_install: true",
  "hotfix_updater_panel_created: true",
  'post_update_check: "LATEST"',
  "application_credentials_used: false",
  "supabase_required: false",
  "MASTERV_REL_1B_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS"
]) {
  assert(publishedSmoke.includes(marker), `MV-REL-1B published updater smoke marker missing: ${marker}`);
}

for (const marker of [
  'const hotfixVersion = "0.1.4"',
  "header.hero",
  "updaterPanel",
  "updater_status_observable",
  "MASTERV_REL_1B_UPDATER_BOOTSTRAP_HOTFIX_RC_PASS"
]) {
  assert(rcSmoke.includes(marker), `MV-REL-1B RC smoke marker missing: ${marker}`);
}

for (const relative of [
  "scripts/prepare-desktop-rel-1b-hotfix.mjs",
  "scripts/desktop-rel-1b-hotfix-windows.mjs",
  "scripts/desktop-rel-1b-published-updater-windows.mjs"
]) {
  const syntax = spawnSync(process.execPath, ["--check", relative], { cwd: root, encoding: "utf8" });
  assert.equal(syntax.status, 0, `${relative} syntax check failed: ${syntax.stderr || syntax.stdout}`);
}

console.log(JSON.stringify({
  status: "MASTERV_REL_1B_UPDATER_BOOTSTRAP_HOTFIX_CONTRACT_PASS",
  baseline_release: `${baselineTag} / ${baselineVersion}`,
  hotfix_release: `${hotfixTag} / ${hotfixVersion}`,
  defect: "section.hero selector did not match header.hero",
  remediation: "FORWARD_FIX_ONLY",
  v0_1_3_asset_mutation: false,
  production_updater_key_id: productionUpdaterKeyId,
  production_signing_opt_in_required: true,
  release_publication_opt_in_required: true,
  live_signature_acceptance_gate: "PUBLISHED_0.1.3_NATIVE_BRIDGE_TO_0.1.4"
}));
