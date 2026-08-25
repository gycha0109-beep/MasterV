import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const launcherPath = path.join(root, "scripts", "run-desktop-lic-1-sandbox-e2e.ps1");
const harnessPath = path.join(root, "scripts", "desktop-lic-1-sandbox-e2e-windows.mjs");

assert(fs.existsSync(launcherPath), "MV-DESKTOP-LIC-1 interactive Sandbox launcher is missing");
assert(fs.existsSync(harnessPath), "MV-DESKTOP-LIC-1 Sandbox E2E harness is missing");

const launcher = fs.readFileSync(launcherPath, "utf8").replace(/\r\n?/g, "\n");

for (const marker of [
  "Read-Host 'Sandbox Product Key' -AsSecureString",
  "SecureStringToBSTR",
  "ZeroFreeBSTR",
  "Clear-MasterVSandboxEnvironment",
  "git rev-parse HEAD",
  "git status --porcelain --untracked-files=no",
  "MASTERV_SANDBOX_E2E_SOURCE_SHA",
  "MASTERV_SANDBOX_E2E_EPHEMERAL_WINDOWS",
  "MASTERV_SANDBOX_E2E_ALLOW_NEW_ACTIVATION",
  "MASTERV_SANDBOX_E2E_ALLOW_GUIDANCE_CHARGE",
  "MASTERV_SANDBOX_PRODUCT_KEY",
  "npm.cmd run test:desktop-lic-1-sandbox-e2e",
  ".EndsWith('.deno.net')"
]) {
  assert(launcher.includes(marker), `Sandbox launcher safety marker missing: ${marker}`);
}

for (const forbidden of [
  "POLAR_ACCESS_TOKEN",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "masterv-tjhctx7aykvh.gycha0109-beep.deno.net"
]) {
  assert(!launcher.includes(forbidden), `Sandbox launcher must not contain server/signing credential or pinned endpoint: ${forbidden}`);
}

const parameterBlock = launcher.match(/param\(([\s\S]*?)\)\n\n\$ErrorActionPreference/)?.[1] || "";
assert(parameterBlock, "PowerShell launcher parameter block could not be isolated");
assert(!/ProductKey/i.test(parameterBlock), "Product Key must not be accepted as a PowerShell command-line parameter");
assert(!/Write-(?:Host|Output|Verbose|Debug|Warning)[^\n]*\$productKey/i.test(launcher), "Product Key must not be written to PowerShell output");
assert(!/Set-Content[^\n]*productKey/i.test(launcher), "Product Key must not be persisted to a file");
assert(!/Add-Content[^\n]*productKey/i.test(launcher), "Product Key must not be appended to a file");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_LIC_1_SANDBOX_LAUNCHER_CONTRACT_PASS",
  product_key_command_line_parameter: false,
  product_key_hidden_prompt: true,
  product_key_shell_history_exposure: false,
  product_key_environment_cleanup: true,
  exact_head_required: true,
  clean_tracked_tree_required: true,
  deno_sandbox_host_only: true,
  guidance_charge_explicit_opt_in: true,
  production_server_credentials_used: false
}));
