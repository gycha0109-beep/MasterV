import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const read = (path) => fs.readFileSync(path, "utf8");
const packageJson = JSON.parse(read("package.json"));
const defaultTauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const releaseTauri = JSON.parse(read("src-tauri/tauri.windows-release.conf.json"));
const workflow = read(".github/workflows/desktop-shareable-package.yml");
const prepare = read("scripts/prepare-desktop-shareable-package-windows.mjs");
const audit = read("scripts/desktop-shareable-package-audit-windows.mjs");

assert(packageJson.scripts?.["test:desktop-shareable-package"] === "node scripts/desktop-shareable-package-contract.mjs", "3O static contract package wiring missing");
assert(packageJson.scripts?.["desktop:prepare:shareable-package-windows"] === "node scripts/prepare-desktop-shareable-package-windows.mjs", "3O package preparation wiring missing");
assert(packageJson.scripts?.["test:desktop-shareable-package-audit-windows"] === "node scripts/desktop-shareable-package-audit-windows.mjs", "3O package audit wiring missing");
assert(packageJson.version === defaultTauri.version, "package and Tauri versions must match for private distribution identity");
assert(defaultTauri.bundle?.active === false, "Default Tauri bundle must remain inactive");
assert(releaseTauri.bundle?.active === true, "3O must reuse the explicit 3M release bundling authority");
assert(releaseTauri.bundle?.windows?.webviewInstallMode?.type === "downloadBootstrapper", "3O must keep the 3M validated WebView2 bootstrapper mode");
const releaseConfigText = JSON.stringify(releaseTauri).toLowerCase();
for (const forbidden of ["certificatethumbprint", "timestampurl", "signcommand", "updater", "pubkey", "endpoints"]) {
  assert(!releaseConfigText.includes(forbidden), `3O must not add signing/updater authority to the release config: ${forbidden}`);
}

assert(/\bpull_request\s*:/.test(workflow), "3O workflow must verify private-share packaging on pull requests");
assert(/\bworkflow_dispatch\s*:/.test(workflow), "3O workflow must expose an explicit manual exact-SHA package path");
assert(/allow_private_package:[\s\S]*?type:\s*boolean[\s\S]*?default:\s*false/.test(workflow), "Manual private package gate must default closed");
assert(/source_sha:[\s\S]*?type:\s*string/.test(workflow), "Manual private package source SHA input is required");
assert(/permissions:\s*\n\s*contents:\s*read/.test(workflow), "3O workflow must be read-only to repository contents");
assert(!/contents:\s*write/.test(workflow), "3O workflow must not receive repository write authority");
assert(workflow.includes("inputs.allow_private_package == true"), "Manual private package execution must require explicit acknowledgement");
assert(workflow.includes("ref: ${{ inputs.source_sha }}"), "Manual private package path must checkout the explicitly requested SHA");
assert(workflow.includes("git rev-parse HEAD"), "3O must verify actual checkout SHA");
assert(workflow.includes("npm run test:desktop-build-determinism"), "3O workflow must retain 3K build determinism authority");
assert(workflow.includes("npm run test:desktop-release-readiness"), "3O workflow must retain 3M release-readiness authority");
assert(workflow.includes("npm run test:desktop-shareable-package"), "3O workflow must run its static contract");
assert(workflow.includes("npm run desktop:bundle:windows-release-candidate"), "3O must reuse the 3M unsigned NSIS release-candidate bundle path");
assert(workflow.includes("Get-AuthenticodeSignature") && workflow.includes("NotSigned"), "3O must prove the share candidate remains unsigned");
assert(workflow.includes("npm run desktop:prepare:shareable-package-windows"), "3O workflow must materialize the handoff package");
assert(workflow.includes("npm run test:desktop-installed-prepare-windows"), "3O must install the exact candidate it packages");
assert(workflow.includes("npm run test:desktop-installed-session-uninstall-windows"), "3O must verify installed restart/logout/uninstall lifecycle");
assert(workflow.includes("npm run test:desktop-shareable-package-audit-windows"), "3O must close package evidence after installed runtime verification");
assert(workflow.includes("git diff --exit-code -- package-lock.json src-tauri/Cargo.lock"), "3O release build must preserve lockfiles");
assert(workflow.includes("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"), "3O artifact action must remain SHA-pinned");
assert(workflow.includes("name: masterv-windows-private-share-package"), "3O artifact must use the private-share identity");
assert(workflow.includes("artifacts/desktop-shareable-package"), "3O package and evidence must be uploaded as CI artifact only");

for (const forbidden of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY",
  "tauri.windows-signing-readiness",
  "gh release",
  "create-release",
  "softprops/action-gh-release",
  "tauri-action",
  "git tag",
  "git push",
  "drive.google.com",
  "google drive api"
]) {
  assert(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `3O workflow must not publish, sign, or consume protected authority: ${forbidden}`);
}
assert(!/GEMINI_API_KEY\s*:|secrets\.GEMINI_API_KEY/i.test(workflow), "3O workflow must not configure a Gemini credential");
assert(!/YOUTUBE_DATA_API_KEY\s*:|secrets\.YOUTUBE_DATA_API_KEY/i.test(workflow), "3O workflow must not configure a YouTube credential");

for (const token of [
  "MASTERV_PRIVATE_SHARE_PACKAGE_PREPARED",
  "MasterV-v${version}",
  "INSTALL.txt",
  "SHA256.txt",
  "release-manifest.json",
  "private-direct-share",
  "drive_uploaded: false",
  "email_sent: false",
  "github_release_created: false",
  "public_release: false",
  "publish_allowed: false",
  "updater_enabled: false",
  "activation_allowed: false",
  "background_batch_gate_changed: false"
]) {
  assert(prepare.includes(token), `3O preparation invariant missing: ${token}`);
}

for (const token of [
  "MASTERV_DESKTOP_SHAREABLE_PACKAGE_PASS",
  "MASTERV_PRIVATE_SHARE_PACKAGE_VERIFIED",
  "installed_runtime_verified: true",
  "private_distribution_ready: true",
  "signature_status: \"NotSigned\"",
  "public_release: false",
  "publish_allowed: false",
  "updater_enabled: false",
  "activation_allowed: false",
  "background_batch_gate_changed: false"
]) {
  assert(audit.includes(token), `3O audit invariant missing: ${token}`);
}

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_SHAREABLE_PACKAGE_CONTRACT_PASS",
  package_format: "unsigned-nsis-private-share",
  manual_exact_sha_path: true,
  pr_readiness_path: true,
  installed_runtime_verification: true,
  signing_configured: false,
  private_distribution_ready_after_runtime_audit: true,
  public_release: false,
  publish_allowed: false,
  updater_enabled: false,
  activation_allowed: false
}));
