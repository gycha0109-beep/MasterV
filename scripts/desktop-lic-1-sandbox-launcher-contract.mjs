import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const launcherPath = path.join(root, "scripts", "run-desktop-lic-1-sandbox-e2e.ps1");
const harnessPath = path.join(root, "scripts", "desktop-lic-1-sandbox-e2e-windows.mjs");
const nodeVersionPath = path.join(root, ".node-version");

assert(fs.existsSync(launcherPath), "MV-DESKTOP-LIC-1 interactive Sandbox launcher is missing");
assert(fs.existsSync(harnessPath), "MV-DESKTOP-LIC-1 Sandbox E2E harness is missing");
assert(fs.existsSync(nodeVersionPath), "Repository Node authority is missing");

const launcher = fs.readFileSync(launcherPath, "utf8").replace(/\r\n?/g, "\n");
const harness = fs.readFileSync(harnessPath, "utf8").replace(/\r\n?/g, "\n");
const nodeVersion = fs.readFileSync(nodeVersionPath, "utf8").trim();

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
  "Assert-ProductKeyAbsent",
  "Assert-ServerSecretsAbsent",
  "Assert-WindowsNativeBuildTools",
  "SHASUMS256.txt",
  "expectedRustupChecksum",
  "Get-FileHash",
  "@('ci')",
  "node_modules\\.bin\\tauri.cmd",
  "rust-toolchain.toml",
  "toolchain', 'install'",
  "rustc --version",
  "cargo --version",
  "@('run', 'desktop:build')",
  "scripts/desktop-lic-1-sandbox-e2e-windows.mjs",
  ".EndsWith('.deno.net')"
]) {
  assert(launcher.includes(marker), `Sandbox launcher safety marker missing: ${marker}`);
}

for (const secretName of [
  "POLAR_ACCESS_TOKEN",
  "POLAR_ORGANIZATION_ID",
  "POLAR_AI_METER_ID",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY"
]) {
  assert(launcher.includes(`'${secretName}'`), `Sandbox launcher must reject ambient server/signing credential: ${secretName}`);
}
assert(!launcher.includes("masterv-tjhctx7aykvh.gycha0109-beep.deno.net"), "Sandbox launcher must not contain a pinned Gateway endpoint");
assert(!/Write-(?:Host|Output|Verbose|Debug|Warning)[^\n]*\$(?:value|env:POLAR|env:GEMINI|env:YOUTUBE|env:TAURI_SIGNING)/i.test(launcher), "Server/signing credential values must not be written to output");

const parameterBlock = launcher.match(/param\(([\s\S]*?)\)\n\n\$ErrorActionPreference/)?.[1] || "";
assert(parameterBlock, "PowerShell launcher parameter block could not be isolated");
assert(!/ProductKey/i.test(parameterBlock), "Product Key must not be accepted as a PowerShell command-line parameter");
assert(!/Write-(?:Host|Output|Verbose|Debug|Warning)[^\n]*\$productKey/i.test(launcher), "Product Key must not be written to PowerShell output");
assert(!/Set-Content[^\n]*productKey/i.test(launcher), "Product Key must not be persisted to a file");
assert(!/Add-Content[^\n]*productKey/i.test(launcher), "Product Key must not be appended to a file");

const buildIndex = launcher.indexOf("@('run', 'desktop:build')");
const promptIndex = launcher.indexOf("Read-Host 'Sandbox Product Key' -AsSecureString");
const productKeyEnvironmentIndex = launcher.indexOf("$env:MASTERV_SANDBOX_PRODUCT_KEY = $productKey");
assert(buildIndex >= 0 && promptIndex > buildIndex, "Product Key prompt must execute only after the Desktop candidate build");
assert(productKeyEnvironmentIndex > promptIndex, "Product Key environment handoff must execute only after the hidden prompt");
assert(/Assert-ProductKeyAbsent\s*\n\s*Assert-ServerSecretsAbsent\s*\n\s*\$env:MASTERV_GATEWAY_BASE_URL[\s\S]*?@\('run', 'desktop:build'\)/.test(launcher), "Desktop build must be immediately guarded against Product Key and server-secret inheritance");
assert(!harness.includes('"desktop:build"'), "Node Sandbox E2E harness must not perform a nested Desktop build");
assert(!harness.includes('spawnSync("npm.cmd"'), "Node Sandbox E2E harness must not spawn a nested npm build process");
assert(harness.includes("Prebuilt Desktop candidate binary missing"), "Sandbox E2E must require the launcher's prebuilt candidate");

assert.equal(nodeVersion, "24.19.0", "Repository Node authority must remain exact Node 24.19.0");
assert(launcher.includes("Get-Content -Raw -LiteralPath (Join-Path $repoRoot '.node-version')"), "Launcher must consume the repository Node authority");
assert(launcher.includes("$systemVersion -eq $RequiredVersion"), "Launcher must reject a non-authoritative system Node runtime");
for (const workflowName of fs.readdirSync(path.join(root, ".github", "workflows")).filter((name) => name.endsWith(".yml"))) {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", workflowName), "utf8");
  if (!workflow.includes("actions/setup-node@")) continue;
  const configuredVersions = [...workflow.matchAll(/node-version:\s*([^\s#]+)/g)].map((match) => match[1]);
  assert(configuredVersions.length > 0, `${workflowName} setup-node must select an exact Node version`);
  for (const configured of configuredVersions) {
    assert.equal(configured, nodeVersion, `${workflowName} Node version diverged from .node-version`);
  }
}

const rustToolchain = fs.readFileSync(path.join(root, "rust-toolchain.toml"), "utf8");
assert(/channel\s*=\s*"1\.97\.1"/.test(rustToolchain), "Rust toolchain authority must remain 1.97.1");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.devDependencies["@tauri-apps/cli"], "2.11.4", "Tauri CLI authority must remain exact 2.11.4");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_LIC_1_SANDBOX_LAUNCHER_CONTRACT_PASS",
  product_key_command_line_parameter: false,
  product_key_hidden_prompt: true,
  product_key_shell_history_exposure: false,
  product_key_environment_cleanup: true,
  exact_head_required: true,
  clean_tracked_tree_required: true,
  deno_sandbox_host_only: true,
  node_authority: nodeVersion,
  nested_node_build: false,
  product_key_prompt_after_build: true,
  isolated_runtime_bootstrap: true,
  rust_toolchain: "1.97.1",
  tauri_cli: "2.11.4",
  guidance_charge_explicit_opt_in: true,
  production_server_credentials_used: false
}));
