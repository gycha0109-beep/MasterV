import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

const releaseVersion = "0.1.3";
const releaseTag = "v0.1.3";
const canonicalInstaller = "MasterV_0.1.3_x64-setup.exe";
const canonicalSignature = `${canonicalInstaller}.sig`;
const latestEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";
const canonicalInstallerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${releaseTag}/${canonicalInstaller}`;

const packageJson = json("package.json");
const cargo = read("src-tauri/Cargo.toml");
const releaseConfig = json("src-tauri/tauri.windows-independent-updater-release.conf.json");
const updater = read("src-tauri/src/updater.rs");
const manifestBuilder = read("scripts/desktop-independent-update-manifest.mjs");
const publishedSmoke = read("scripts/desktop-published-updater-windows.mjs");
const workflow = read(".github/workflows/desktop-production-release.yml");

assert.equal(releaseConfig.version, releaseVersion, "MV-REL-1 release config must target 0.1.3");
assert.equal(releaseConfig.bundle?.active, true, "MV-REL-1 release bundle must remain active");
assert.equal(releaseConfig.bundle?.createUpdaterArtifacts, true, "MV-REL-1 must create Tauri updater artifacts and signatures");
assert.deepEqual(releaseConfig.plugins?.updater?.endpoints, [latestEndpoint], "MV-REL-1 must publish through the stable static GitHub latest.json channel");
assert.equal(releaseConfig.plugins?.updater?.windows?.installMode, "passive", "MV-REL-1 Windows updater install mode must remain passive");
assert(cargo.includes('independent-updater = ["dep:tauri-plugin-updater"]'), "MV-REL-1 independent-updater feature is missing");

const publicKeyMatch = updater.match(/UPDATE_PUBLIC_KEY:\s*&str\s*=\s*"([^"]+)"/);
const rustPublicKey = publicKeyMatch?.[1] || "";
assert(rustPublicKey.length > 0, "MV-REL-1 updater public key authority is missing");
assert.equal(releaseConfig.plugins?.updater?.pubkey, rustPublicKey, "MV-REL-1 release config public key must match native updater authority");

assert.equal(
  packageJson.scripts?.["desktop:build:windows-updater-release"],
  "tauri build --features independent-updater --bundles nsis --config src-tauri/tauri.windows-independent-updater-release.conf.json",
  "MV-REL-1 signed updater build command is missing or changed"
);
assert.equal(packageJson.scripts?.["test:desktop-published-updater-windows"], "node scripts/desktop-published-updater-windows.mjs", "MV-REL-1 published updater runtime smoke command is missing");
assert.equal(packageJson.scripts?.["test:rel-1"], "node scripts/desktop-rel-1-contract.mjs", "MV-REL-1 contract command is missing");

for (const marker of [
  "workflow_dispatch:",
  "source_sha:",
  "allow_production_signing:",
  "allow_release_publication:",
  "permissions:\n  contents: write",
  "environment: masterv-production-release",
  "git rev-parse origin/main",
  "Production release source must equal current origin/main",
  "secrets.TAURI_SIGNING_PRIVATE_KEY",
  "secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "npm run desktop:build:windows-updater-release",
  canonicalInstaller,
  canonicalSignature,
  "desktop-independent-update-manifest.mjs",
  "gh release create",
  "--draft",
  "gh release upload",
  "gh release edit",
  "--draft=false --latest",
  "releases/latest/download/latest.json",
  "npm run test:desktop-published-updater-windows"
]) {
  assert(workflow.includes(marker), `MV-REL-1 workflow contract marker missing: ${marker}`);
}

assert(!/^\s*pull_request\s*:/m.test(workflow), "Production release activation workflow must never run on pull_request");
assert(!/^\s*push\s*:/m.test(workflow), "Production release activation workflow must never run automatically on push");
assert(workflow.includes("if: ${{ inputs.allow_production_signing == true }}"), "Production signing must require an explicit boolean opt-in");
assert(workflow.includes("inputs.allow_release_publication == true"), "Release publication must require an explicit boolean opt-in");
assert(workflow.indexOf("gh release create") < workflow.indexOf("gh release edit"), "MV-REL-1 must create a draft release before stable publication");
assert(workflow.indexOf("signed-release-candidate:") < workflow.indexOf("publish-release:"), "Signed artifact generation must precede publication");
assert(workflow.indexOf("publish-release:") < workflow.indexOf("verify-published-updater:"), "Published updater verification must run only after publication");

for (const forbiddenCredential of ["GEMINI_API_KEY: ${{ secrets.", "YOUTUBE_DATA_API_KEY: ${{ secrets.", "POLAR_ACCESS_TOKEN: ${{ secrets."]) {
  assert(!workflow.includes(forbiddenCredential), `MV-REL-1 release activation must not consume application credential: ${forbiddenCredential}`);
}

for (const marker of [
  'const baselineVersion = "0.1.2"',
  '"MASTERV_REL_1_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS"',
  latestEndpoint,
  "const expectedInstallerUrl =",
  "desktop-updater-install",
  "tauri_signature_verified_by_successful_install: true",
  "installed_version_after_update",
  'post_update_check: "LATEST"',
  "application_credentials_used: false",
  "supabase_required: false"
]) {
  assert(publishedSmoke.includes(marker), `Published updater runtime verification marker missing: ${marker}`);
}

const syntax = spawnSync(process.execPath, ["--check", "scripts/desktop-published-updater-windows.mjs"], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `Published updater runtime smoke syntax check failed: ${syntax.stderr || syntax.stdout}`);

for (const marker of [
  "MASTERV_UPDATE_VERSION",
  "MASTERV_UPDATE_INSTALLER_URL",
  "MASTERV_UPDATE_SIGNATURE_PATH",
  '"windows-x86_64"',
  "signature",
  "https:"
]) {
  assert(manifestBuilder.includes(marker), `MV-REL-1 manifest builder marker missing: ${marker}`);
}

assert(!canonicalInstaller.includes(" "), "Canonical production release installer name must be URL-stable and contain no spaces");
assert(!canonicalSignature.includes(" "), "Canonical production release signature name must be URL-stable and contain no spaces");

console.log(JSON.stringify({
  status: "MASTERV_REL_1_RELEASE_ACTIVATION_PLANE_PASS",
  source_authority: "CURRENT_MAIN_EXACT_SHA_REQUIRED",
  version: releaseVersion,
  tag: releaseTag,
  installer: canonicalInstaller,
  signature: canonicalSignature,
  stable_manifest_endpoint: latestEndpoint,
  installer_url: canonicalInstallerUrl,
  tauri_updater_signature_required: true,
  production_signing_opt_in_required: true,
  release_publication_opt_in_required: true,
  production_signing_exercised_by_contract: false,
  production_release_published_by_contract: false,
  live_signature_acceptance_gate: "REQUIRED_AFTER_PUBLICATION"
}));
