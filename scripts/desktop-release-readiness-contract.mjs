import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const read = (path) => fs.readFileSync(path, "utf8");
const packageJson = JSON.parse(read("package.json"));
const defaultTauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const smokeTauri = JSON.parse(read("src-tauri/tauri.windows-smoke.conf.json"));
const releaseTauri = JSON.parse(read("src-tauri/tauri.windows-release.conf.json"));
const workflow = read(".github/workflows/desktop-release-readiness.yml");
const audit = read("scripts/desktop-release-candidate-audit-windows.mjs");

assert(packageJson.scripts?.["desktop:bundle:windows-release-candidate"] === "tauri bundle --bundles nsis --config src-tauri/tauri.windows-release.conf.json", "3M release candidate bundle command missing");
assert(packageJson.scripts?.["test:desktop-release-readiness"] === "node scripts/desktop-release-readiness-contract.mjs", "3M static contract package wiring missing");
assert(packageJson.scripts?.["test:desktop-release-candidate-audit-windows"] === "node scripts/desktop-release-candidate-audit-windows.mjs", "3M release candidate audit package wiring missing");
assert(packageJson.version === defaultTauri.version, "package and Tauri versions must match for release identity");

assert(defaultTauri.bundle?.active === false, "Default Tauri bundle must remain inactive");
assert(smokeTauri.bundle?.active === true, "3L Windows smoke installer authority must remain active");
assert(releaseTauri.bundle?.active === true, "3M release candidate config must explicitly enable bundling");
assert(releaseTauri.bundle?.windows?.webviewInstallMode?.type === "downloadBootstrapper", "3M release candidate must keep the validated WebView2 bootstrapper mode");
assert(releaseTauri.bundle?.windows?.webviewInstallMode?.type === smokeTauri.bundle?.windows?.webviewInstallMode?.type, "3M release candidate must not silently diverge from the 3L validated installer WebView2 mode");
const releaseConfigText = JSON.stringify(releaseTauri).toLowerCase();
for (const forbidden of ["certificatethumbprint", "timestampurl", "signcommand", "updater", "pubkey", "endpoints"]) {
  assert(!releaseConfigText.includes(forbidden), `3M release config must not activate signing/updater authority: ${forbidden}`);
}

assert(/\bpull_request\s*:/.test(workflow), "3M readiness workflow must verify the release path on pull requests");
assert(/\bworkflow_dispatch\s*:/.test(workflow), "3M readiness workflow must expose an explicit manual exact-SHA RC path");
assert(/allow_unsigned_rc:[\s\S]*?type:\s*boolean[\s\S]*?default:\s*false/.test(workflow), "Manual unsigned RC gate must default closed");
assert(/source_sha:[\s\S]*?type:\s*string/.test(workflow), "Manual release source SHA input is required");
assert(/permissions:\s*\n\s*contents:\s*read/.test(workflow), "3M workflow must be read-only to repository contents");
assert(!/contents:\s*write/.test(workflow), "3M workflow must not receive repository write authority");
assert(workflow.includes("inputs.allow_unsigned_rc == true"), "Manual RC execution must require explicit unsigned-RC acknowledgement");
assert(workflow.includes("ref: ${{ inputs.source_sha }}"), "Manual RC must checkout the explicitly requested source SHA");
assert(workflow.includes("git rev-parse HEAD"), "Manual RC must verify actual checkout SHA");
assert(workflow.includes("npm run test:desktop-release-readiness"), "3M workflow must run its static contract");
assert(workflow.includes("npm run desktop:bundle:windows-release-candidate"), "3M workflow must execute the formal release candidate bundle path");
assert(workflow.includes("Get-AuthenticodeSignature") && workflow.includes("NotSigned"), "3M must prove the release candidate remains unsigned");
assert(workflow.includes("npm run test:desktop-release-candidate-audit-windows"), "3M workflow must audit and materialize release candidate evidence");
assert(workflow.includes("git diff --exit-code -- package-lock.json src-tauri/Cargo.lock"), "3M release build must preserve lockfiles");
assert(workflow.includes("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"), "3M artifact action must remain SHA-pinned");
assert(workflow.includes("artifacts/desktop-release-readiness"), "3M readiness manifest must be uploaded");
assert(workflow.includes("src-tauri/target/release/bundle/nsis/*.exe"), "3M unsigned NSIS candidate must be uploaded only as CI evidence");

for (const forbidden of [
  "TAURI_SIGNING_PRIVATE_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
  "gh release",
  "create-release",
  "softprops/action-gh-release",
  "tauri-action",
  "git tag",
  "git push"
]) {
  assert(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `3M workflow must not publish, sign, or consume protected provider/test credentials: ${forbidden}`);
}

for (const token of [
  "MASTERV_DESKTOP_RELEASE_READINESS_PASS",
  "source_sha",
  "checkout_sha",
  "source_authority",
  "installer_sha256",
  "signature_status",
  "credential_identifiers_present",
  "publish_allowed: false",
  "activation_allowed: false",
  "updater_enabled: false",
  "background_batch_gate_changed: false"
]) {
  assert(audit.includes(token), `3M release candidate evidence invariant missing: ${token}`);
}

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_RELEASE_READINESS_CONTRACT_PASS",
  release_config: "src-tauri/tauri.windows-release.conf.json",
  release_candidate: "unsigned-nsis",
  manual_exact_sha_path: true,
  pr_readiness_path: true,
  signing_configured: false,
  publish_allowed: false,
  updater_enabled: false,
  activation_allowed: false
}));
