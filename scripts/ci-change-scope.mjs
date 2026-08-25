import assert from "node:assert/strict";
import fs from "node:fs";

function isServerOnlyPath(path) {
  return path === "deno.json"
    || path.startsWith("gateway/")
    || path.startsWith("docs/")
    || path.startsWith("scripts/gateway-");
}

function isDesktopNativePath(path) {
  return path.startsWith("desktop/")
    || path.startsWith("src-tauri/src/")
    || path === "src-tauri/Cargo.toml"
    || path === "src-tauri/Cargo.lock"
    || path === "package.json"
    || path === "package-lock.json"
    || path === "scripts/build-desktop-static.mjs"
    || path.startsWith("scripts/copy-desktop-")
    || path.startsWith("scripts/desktop-lic-")
    || path === "scripts/windows-webview2-attach.mjs"
    || path === "scripts/run-desktop-lic-1-sandbox-e2e.ps1";
}

function isInstallerPath(path) {
  return path === "src-tauri/tauri.conf.json"
    || path === "src-tauri/tauri.windows-smoke.conf.json"
    || path.startsWith("src-tauri/icons/")
    || path === "scripts/desktop-installed-clean-cut-windows.mjs"
    || path === "scripts/desktop-windows-clean-cut-smoke.mjs";
}

function isReleaseRegressionPath(path) {
  return path === "src-tauri/src/updater.rs"
    || path.startsWith("src-tauri/tauri.windows-updater-")
    || path === "src-tauri/tauri.windows-independent-updater-release.conf.json"
    || path.startsWith("scripts/desktop-independent-updater")
    || path.startsWith("scripts/desktop-upgrade-dry-run")
    || path.startsWith("scripts/desktop-rel-1")
    || path.startsWith("scripts/desktop-pilot-1-first-run")
    || path.startsWith("scripts/desktop-pilot-1-gateway-preflight")
    || path === ".github/workflows/desktop-signing-readiness.yml"
    || path === ".github/workflows/desktop-release-readiness.yml"
    || path === ".github/workflows/desktop-rel-1c-published-updater-verification.yml"
    || path === ".github/workflows/desktop-private-updater-bootstrap.yml"
    || path === ".github/workflows/desktop-production-release.yml"
    || path === ".github/workflows/desktop-production-hotfix-release.yml";
}

function isSigningReadinessPath(path) {
  return isReleaseRegressionPath(path)
    || path.includes("signing")
    || path.includes("updater") && path.startsWith("src-tauri/");
}

function isCleanCutNativePath(path) {
  return path === "src-tauri/src/local_persistence.rs"
    || path === "src-tauri/src/automatic_backup.rs"
    || path === "src-tauri/Cargo.toml"
    || path === "src-tauri/Cargo.lock"
    || path.startsWith("desktop/backend/local/")
    || path === "desktop/backend/bridge/transition-provider.js"
    || path === "scripts/desktop-local-persistence-contract.mjs"
    || path === "scripts/desktop-supabase-clean-cut-contract.mjs"
    || path === ".github/workflows/mv-exit-3-clean-cut.yml";
}

export function classifyChangedFiles(paths) {
  const normalized = paths.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return Object.freeze({
      server_only: false,
      desktop_heavy_required: true,
      desktop_native_required: true,
      desktop_installer_required: true,
      desktop_release_required: true,
      signing_readiness_required: true,
      clean_cut_native_required: true,
      paths: []
    });
  }

  const serverOnly = normalized.every(isServerOnlyPath);
  const desktopNativeRequired = normalized.some(isDesktopNativePath);
  const desktopInstallerRequired = normalized.some(isInstallerPath);
  const desktopReleaseRequired = normalized.some(isReleaseRegressionPath);
  const signingReadinessRequired = normalized.some(isSigningReadinessPath);
  const cleanCutNativeRequired = normalized.some(isCleanCutNativePath);

  return Object.freeze({
    server_only: serverOnly,
    // Backward-compatible alias for older workflows while tier migration lands.
    desktop_heavy_required: desktopNativeRequired || desktopInstallerRequired || desktopReleaseRequired,
    desktop_native_required: desktopNativeRequired,
    desktop_installer_required: desktopInstallerRequired,
    desktop_release_required: desktopReleaseRequired,
    signing_readiness_required: signingReadinessRequired,
    clean_cut_native_required: cleanCutNativeRequired,
    paths: normalized
  });
}

function selfTest() {
  const gateway = classifyChangedFiles(["gateway/core.ts"]);
  assert.equal(gateway.server_only, true);
  assert.equal(gateway.desktop_native_required, false);
  assert.equal(gateway.desktop_release_required, false);

  const runtime = classifyChangedFiles(["desktop/backend/provider-boundary.js", "src-tauri/src/gateway_transport.rs"]);
  assert.equal(runtime.desktop_native_required, true);
  assert.equal(runtime.desktop_installer_required, false);
  assert.equal(runtime.desktop_release_required, false);
  assert.equal(runtime.signing_readiness_required, false);
  assert.equal(runtime.clean_cut_native_required, false);

  const harness = classifyChangedFiles(["scripts/desktop-lic-1-sandbox-e2e-windows.mjs"]);
  assert.equal(harness.desktop_native_required, true);
  assert.equal(harness.desktop_release_required, false);

  const installer = classifyChangedFiles(["src-tauri/tauri.windows-smoke.conf.json"]);
  assert.equal(installer.desktop_native_required, false);
  assert.equal(installer.desktop_installer_required, true);
  assert.equal(installer.desktop_release_required, false);

  const updater = classifyChangedFiles(["src-tauri/src/updater.rs"]);
  assert.equal(updater.desktop_release_required, true);
  assert.equal(updater.signing_readiness_required, true);

  const localAuthority = classifyChangedFiles(["src-tauri/src/local_persistence.rs"]);
  assert.equal(localAuthority.desktop_native_required, true);
  assert.equal(localAuthority.clean_cut_native_required, true);

  const workflowOnly = classifyChangedFiles([".github/workflows/ci.yml"]);
  assert.equal(workflowOnly.desktop_native_required, false);
  assert.equal(workflowOnly.desktop_installer_required, false);
  assert.equal(workflowOnly.desktop_release_required, false);
  assert.equal(workflowOnly.clean_cut_native_required, false);

  const unknown = classifyChangedFiles(["README.md"]);
  assert.equal(unknown.server_only, false);
  assert.equal(unknown.desktop_heavy_required, false);

  const empty = classifyChangedFiles([]);
  assert.equal(empty.desktop_native_required, true);
  assert.equal(empty.desktop_release_required, true);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  console.log(JSON.stringify({ status: "MASTERV_CI_CHANGE_SCOPE_SELF_TEST_PASS" }));
  process.exit(0);
}

const result = classifyChangedFiles(process.argv.slice(2));
const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error("GITHUB_OUTPUT is required when classifying CI change scope");
for (const key of [
  "server_only",
  "desktop_heavy_required",
  "desktop_native_required",
  "desktop_installer_required",
  "desktop_release_required",
  "signing_readiness_required",
  "clean_cut_native_required"
]) {
  fs.appendFileSync(output, `${key}=${result[key]}\n`);
}
console.log(JSON.stringify({
  status: "MASTERV_CI_CHANGE_SCOPE_CLASSIFIED",
  ...result,
  changed_files: result.paths
}));
