import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const read = (path) => fs.readFileSync(path, "utf8");
const smokeTauri = JSON.parse(read("src-tauri/tauri.windows-smoke.conf.json"));
const releaseTauri = JSON.parse(read("src-tauri/tauri.windows-release.conf.json"));
const signingTemplate = JSON.parse(read("src-tauri/tauri.windows-signing-readiness.template.json"));
const prepare = read("scripts/prepare-windows-signing-config.mjs");
const bridge = read("scripts/windows-signing-bridge.mjs");
const audit = read("scripts/desktop-signing-readiness-audit-windows.mjs");
const workflow = read(".github/workflows/desktop-signing-readiness.yml");

assert(signingTemplate.bundle?.active === true, "3N signing template must explicitly enable bundling");
assert(signingTemplate.bundle?.windows?.webviewInstallMode?.type === "downloadBootstrapper", "3N signing template must preserve validated WebView2 bootstrapper mode");
assert(signingTemplate.bundle?.windows?.webviewInstallMode?.type === releaseTauri.bundle?.windows?.webviewInstallMode?.type, "3N signing template must not diverge from 3M release candidate WebView2 mode");
assert(signingTemplate.bundle?.windows?.webviewInstallMode?.type === smokeTauri.bundle?.windows?.webviewInstallMode?.type, "3N signing template must not diverge from installed-quality WebView2 mode");
assert(signingTemplate.bundle?.windows?.signCommand?.cmd === "__MASTERV_NODE_EXECUTABLE__", "3N signing template must keep the Node executable as a generated absolute-path placeholder");
assert(JSON.stringify(signingTemplate.bundle?.windows?.signCommand?.args) === JSON.stringify(["__MASTERV_SIGNING_BRIDGE__", "%1"]), "3N signing template must route Tauri %1 through the generated bridge path");
const templateText = JSON.stringify(signingTemplate).toLowerCase();
for (const forbidden of ["certificatethumbprint", "timestampurl", "azure", "artifact-signing", "signtool", "updater", "pubkey", "endpoints", "tauri_signing_private_key"]) {
  assert(!templateText.includes(forbidden), `3N template must remain provider-neutral and updater-free: ${forbidden}`);
}

assert(prepare.includes("process.execPath") && prepare.includes("path.resolve"), "3N config generator must materialize absolute Node/bridge paths");
assert(prepare.includes("MASTERV_WINDOWS_SIGNING_CONFIG_PREPARED"), "3N config generator marker missing");
assert(prepare.includes("provider_selected: false") && prepare.includes("live_signing_enabled: false"), "3N config generator must not claim a live provider");

assert(bridge.includes('mode === "dry-run"'), "3N signing bridge must only accept dry-run mode at this stage");
assert(bridge.includes("MASTERV_SIGNING_PROVIDER_REQUIRED"), "3N signing bridge must fail closed when a live provider is requested");
assert(bridge.includes("MASTERV_WINDOWS_SIGNING_BRIDGE_DRY_RUN"), "3N signing bridge dry-run marker missing");
assert(bridge.includes("portableExecutable") && bridge.includes("0x4d") && bridge.includes("0x5a"), "3N signing bridge must require Windows PE targets");
assert(bridge.includes('extension === ".tmp"') && bridge.includes('targetClass = "nsis-uninstaller-temp"'), "3N signing bridge must cover the Tauri/NSIS temporary uninstaller PE path");
assert(bridge.includes("external_signer_invoked: false") && bridge.includes("signature_written: false"), "3N signing bridge must record that no signature was written");
for (const forbidden of ["node:child_process", "spawn(", "spawnSync(", "exec(", "execFile(", "artifact-signing-cli", "signtool", "azure", "client_secret", "certificateThumbprint"]) {
  assert(!bridge.toLowerCase().includes(forbidden.toLowerCase()), `3N bridge must not implement a live provider yet: ${forbidden}`);
}

assert(/\bpull_request\s*:/.test(workflow), "3N workflow must exercise the signing integration on pull requests");
assert(/\bworkflow_dispatch\s*:/.test(workflow), "3N workflow must expose a manual exact-SHA dry-run path");
assert(/allow_signing_dry_run:[\s\S]*?type:\s*boolean[\s\S]*?default:\s*false/.test(workflow), "Manual 3N signing dry-run gate must default closed");
assert(/source_sha:[\s\S]*?type:\s*string/.test(workflow), "Manual 3N source SHA input is required");
assert(/permissions:\s*\n\s*contents:\s*read/.test(workflow), "3N workflow must keep repository contents read-only");
assert(!/contents:\s*write/.test(workflow), "3N workflow must not receive repository write authority");
assert(workflow.includes("actions/checkout@11d5960a326750d5838078e36cf38b85af677262"), "3N checkout action must remain SHA-pinned");
assert(workflow.includes("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020") && /node-version:\s*24\.19\.0/.test(workflow), "3N Node setup must remain immutable");
assert(workflow.includes("dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c") && /toolchain:\s*1\.97\.1/.test(workflow), "3N Rust setup must remain immutable");
assert(workflow.includes("ref: ${{ inputs.source_sha }}"), "Manual 3N path must checkout the requested exact SHA");
assert(workflow.includes("git rev-parse HEAD"), "Manual 3N path must verify the actual checkout SHA");
assert(workflow.includes("npm run test:desktop-build-determinism"), "3N workflow must preserve 3K determinism authority");
assert(workflow.includes("npm run test:desktop-release-readiness"), "3N workflow must preserve 3M release-readiness authority");
assert(workflow.includes("node scripts/desktop-signing-readiness-contract.mjs"), "3N workflow must run its static contract");
assert(workflow.includes("MASTERV_SIGNING_MODE=dry-run"), "3N workflow must explicitly set dry-run signing mode");
assert(workflow.includes("node scripts/prepare-windows-signing-config.mjs"), "3N workflow must materialize the absolute-path runtime signing config");
assert(workflow.includes("npm run tauri -- bundle --bundles nsis --config src-tauri/tauri.windows-signing-readiness.runtime.json"), "3N workflow must exercise the Tauri signCommand integration");
assert((workflow.match(/Get-AuthenticodeSignature/g) || []).length >= 2 && workflow.includes("NotSigned"), "3N dry-run must prove application and installer remain unsigned");
assert(workflow.includes("node scripts/desktop-signing-readiness-audit-windows.mjs"), "3N workflow must materialize signing-readiness evidence");
assert(workflow.includes("git diff --exit-code -- package-lock.json src-tauri/Cargo.lock"), "3N workflow must preserve lockfiles");
assert(workflow.includes("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"), "3N artifact upload action must remain SHA-pinned");
assert(workflow.includes("artifacts/desktop-signing-readiness"), "3N evidence directory must be uploaded");
assert(!workflow.includes("src-tauri/target/release/bundle/nsis/*.exe"), "3N dry-run workflow must not upload the unsigned installer as a signed distribution artifact");

for (const forbidden of [
  "secrets.",
  "TAURI_SIGNING_PRIVATE_KEY",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "WINDOWS_CERTIFICATE",
  "certificateThumbprint",
  "artifact-signing-cli",
  "signtool",
  "gh release",
  "create-release",
  "softprops/action-gh-release",
  "tauri-action",
  "git tag",
  "git push"
]) {
  assert(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `3N workflow must not consume signing credentials or publish artifacts: ${forbidden}`);
}

for (const token of [
  "MASTERV_DESKTOP_SIGNING_INTEGRATION_PASS",
  "signing_hook_invocations",
  "observed_target_classes",
  "nsis-uninstaller-temp",
  "portable_executable === true",
  "installer_signature_status",
  "app_signature_status",
  "provider_selected: false",
  "signing_identity_configured: false",
  "signing_credentials_consumed: false",
  "signed_artifact_produced: false",
  "publish_allowed: false",
  "activation_allowed: false",
  "updater_enabled: false",
  "background_batch_gate_changed: false"
]) {
  assert(audit.includes(token), `3N signing-readiness evidence invariant missing: ${token}`);
}

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_SIGNING_READINESS_CONTRACT_PASS",
  signing_integration: "tauri-signCommand",
  mode: "dry-run",
  provider_selected: false,
  signing_identity_configured: false,
  signed_artifact_produced: false,
  publish_allowed: false,
  updater_enabled: false,
  activation_allowed: false
}));
