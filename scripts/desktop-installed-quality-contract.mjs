import { spawnSync } from "node:child_process";
import fs from "node:fs";

function assert(condition, message) { if (!condition) throw new Error(message); }
const read = (p) => fs.readFileSync(p, "utf8");
function assertNodeSyntax(path) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `${path} must parse under the pinned Node runtime: ${result.stderr || result.stdout}`);
}

const pkg = JSON.parse(read("package.json"));
const ci = read(".github/workflows/ci.yml");
const helper = read("scripts/windows-webview2-attach.mjs");
const prepare = read("scripts/desktop-installed-prepare-windows.mjs");
const lifecycle = read("scripts/desktop-installed-session-uninstall-windows.mjs");
const defaultTauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const smokeTauri = JSON.parse(read("src-tauri/tauri.windows-smoke.conf.json"));

assertNodeSyntax("scripts/desktop-installed-prepare-windows.mjs");
assertNodeSyntax("scripts/desktop-installed-session-uninstall-windows.mjs");

assert(pkg.scripts?.["test:desktop-installed-quality-contract"] === "node scripts/desktop-installed-quality-contract.mjs", "3L static contract package wiring missing");
assert(pkg.scripts?.["test:desktop-installed-prepare-windows"] === "node scripts/desktop-installed-prepare-windows.mjs", "3L installer preparation package wiring missing");
assert(pkg.scripts?.["test:desktop-installed-session-uninstall-windows"] === "node scripts/desktop-installed-session-uninstall-windows.mjs", "3L lifecycle package wiring missing");
assert(defaultTauri.bundle?.active === false, "Default Tauri bundle must remain inactive in 3L");
assert(smokeTauri.bundle?.active === true, "Windows smoke override must remain installer-only authority");

assert(helper.includes("MASTERV_DESKTOP_APP_BINARY") && helper.includes("fs.existsSync(installed)"), "Existing Windows smoke launcher must support installed-binary authority with safe fallback");
assert(helper.includes("reuseDataDir") && helper.includes("options.dataDir"), "3L restart verification requires explicit reusable WebView data directory support");

for (const token of ["/S", "MasterV uninstall registry entry", "installer_sha256", "installed_exe_sha256", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_TEST_PASSWORD", "TAURI_SIGNING_PRIVATE_KEY", "autorun_entries", "scheduled_tasks"]) {
  assert(prepare.includes(token), `3L installer preparation invariant missing: ${token}`);
}
assert(prepare.includes("GITHUB_ENV") && prepare.includes("MASTERV_DESKTOP_UNINSTALLER"), "Installed authority must be exported only through CI process environment");

for (const token of ["process_restart_without_logout", "persistent_auth_storage", "localStorage", "sessionStorage", "direct_gemini_requests", "direct_youtube_data_api_requests", "local_next_api_requests", "uninstall_registry_removed", "autorun_residue", "service_residue", "scheduled_task_residue"]) {
  assert(lifecycle.includes(token), `3L installed lifecycle invariant missing: ${token}`);
}
assert(lifecycle.includes("reuseDataDir: true"), "3L restart must reuse the same WebView profile to prove auth non-persistence");
assert(lifecycle.includes("spawnSync(uninstaller, [\"/S\"]"), "3L must exercise the generated uninstaller");

const installer = ci.indexOf("Build unsigned NSIS installer smoke");
const install = ci.indexOf("Install and audit unsigned NSIS quality candidate");
const installed3e = ci.indexOf("Run installed WebView2 Reference Detail Compare quality smoke");
const installed3f = ci.indexOf("Run installed WebView2 Canonical Reference Compiler quality smoke");
const installed3g = ci.indexOf("Run installed WebView2 Hosted YouTube Discovery quality smoke");
const installed3j = ci.indexOf("Run installed WebView2 Guarded Background Batch quality smoke");
const uninstall = ci.indexOf("Run installed restart session and uninstall quality smoke");
const provider3h = ci.indexOf("Observe Hosted Deep Analysis provider health");
const providerRecord = ci.indexOf("Record provider health separately from product quality");
assert(installer >= 0 && install > installer, "3L must install the exact generated NSIS candidate after building it");
assert(installed3e > install && installed3f > installed3e && installed3g > installed3f && installed3j > installed3g, "Installed deterministic surface regressions must execute against the installed binary");
assert(uninstall > installed3j, "Uninstall validation must occur after installed surface regressions");
assert(provider3h > uninstall && providerRecord > provider3h, "Provider health observation must be downstream and separate from installed product quality");
assert(ci.includes("continue-on-error: true"), "Live provider health must not collapse external quota state into deterministic product quality failure");
assert(ci.includes("steps.provider_3h.outcome") && ci.includes("PROVIDER_HEALTH_BLOCKED"), "Provider health outcome must be explicitly materialized");
assert(ci.includes("artifacts/desktop-installed-quality"), "3L evidence directory must be uploaded");
assert(ci.includes("npm run test:desktop-installed-quality-contract"), "3L static contract must run in CI");

for (const forbidden of ["TAURI_SIGNING_PRIVATE_KEY", "tauri signer", "actions/create-release", "softprops/action-gh-release", "tauri-action"]) {
  if (forbidden === "TAURI_SIGNING_PRIVATE_KEY") {
    assert(!ci.includes(`${forbidden}:`), "3L must not configure signing credentials");
  } else {
    assert(!ci.toLowerCase().includes(forbidden.toLowerCase()), `3L must not add release/signing activation: ${forbidden}`);
  }
}

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_INSTALLED_QUALITY_CONTRACT_PASS",
  install_candidate: "unsigned-nsis",
  installed_binary_authority: true,
  restart_auth_persistence_required: false,
  uninstall_required: true,
  provider_health_isolated: true,
  syntax_guarded: true,
  quality_target: "QUALITY_VALIDATED",
  activation: false
}));
