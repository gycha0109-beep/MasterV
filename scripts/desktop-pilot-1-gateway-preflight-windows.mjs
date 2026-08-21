import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, attachMasterV, delay, execute } from "./windows-webview2-attach.mjs";

function psLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function powershell(script, timeout = 120_000) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", timeout, windowsHide: true }
  );
  if (result.status !== 0) throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  return (result.stdout || "").trim();
}

function parseExecutable(command) {
  const value = String(command || "").trim();
  const quoted = value.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  return value.match(/^([^\s]+\.exe)/i)?.[1] || "";
}

function findFiles(root, predicate, depth = 4) {
  if (!root || !fs.existsSync(root) || depth < 0) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && predicate(full)) out.push(full);
    else if (entry.isDirectory()) out.push(...findFiles(full, predicate, depth - 1));
  }
  return out;
}

const appConfig = JSON.parse(fs.readFileSync(path.resolve("src-tauri", "tauri.conf.json"), "utf8"));
const productName = String(appConfig.productName || "").trim();
const identifier = String(appConfig.identifier || "").trim();
assert(productName, "Tauri productName is required");
assert(identifier, "Tauri identifier is required");

const releaseVersion = "0.1.4";
const releaseTag = `v${releaseVersion}`;
const canonicalAsset = `MasterV_${releaseVersion}_x64-setup.exe`;
const latestEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";
const installerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${releaseTag}/${canonicalAsset}`;
const productNamePs = psLiteral(productName);
const compileTimeProbeGatewayUrl = "https://api.masterv.example";

function uninstallRegistryEntries() {
  const json = powershell(`
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$entries = @(Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq '${productNamePs}' } |
  Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString,QuietUninstallString)
$entries | ConvertTo-Json -Compress
`);
  if (!json) return [];
  const parsed = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function cleanupInstalledProduct() {
  for (const entry of uninstallRegistryEntries()) {
    const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
    if (uninstaller && fs.existsSync(uninstaller)) {
      spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    }
  }
  for (let attempt = 0; attempt < 90 && uninstallRegistryEntries().length > 0; attempt++) await delay(500);
  assert(uninstallRegistryEntries().length === 0, "Existing MasterV installation could not be removed from the ephemeral preflight runner");
}

function cleanupEphemeralLocalState() {
  const localAppData = process.env.LOCALAPPDATA?.trim() || "";
  assert(localAppData, "LOCALAPPDATA is required for Windows Gateway preflight");
  fs.rmSync(path.join(localAppData, identifier), { recursive: true, force: true });
}

async function waitForInstalledVersion(version, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = uninstallRegistryEntries();
    if (entries.length === 1 && String(entries[0].DisplayVersion || "").trim() === version) return entries[0];
    await delay(1000);
  }
  throw new Error(`Timed out waiting for installed MasterV ${version}: ${JSON.stringify(uninstallRegistryEntries())}`);
}

function locateInstalledBinary(entry) {
  const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
  const roots = [entry.InstallLocation, path.dirname(uninstaller), process.env.LOCALAPPDATA, process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    const match = findFiles(path.resolve(root), (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 5)[0];
    if (match) return path.resolve(match);
  }
  throw new Error(`Installed MasterV binary not found under ${roots.join(", ")}`);
}

async function invokeJson(runtime, command, args = {}) {
  const key = `gatewayPreflight${Math.random().toString(36).slice(2)}`;
  const started = await execute(runtime.driverPort, runtime.sessionId, `
    const key = arguments[0];
    const root = document.documentElement;
    root.dataset[key + 'State'] = 'pending';
    root.dataset[key + 'Result'] = '';
    window.__TAURI__.core.invoke(arguments[1], arguments[2] || {})
      .then((value) => {
        root.dataset[key + 'State'] = 'ok';
        root.dataset[key + 'Result'] = JSON.stringify(value);
      })
      .catch((error) => {
        root.dataset[key + 'State'] = 'error';
        root.dataset[key + 'Result'] = String(error);
      });
    return true;
  `, [key, command, args]);
  assert(started === true, `${command} did not start`);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const snapshot = await execute(runtime.driverPort, runtime.sessionId, `
      const key = arguments[0];
      const root = document.documentElement;
      return { state: root.dataset[key + 'State'] || 'pending', result: root.dataset[key + 'Result'] || '' };
    `, [key]);
    if (snapshot.state === "error") throw new Error(`${command} failed: ${snapshot.result}`);
    if (snapshot.state === "ok") return snapshot.result ? JSON.parse(snapshot.result) : null;
    await delay(250);
  }
  throw new Error(`${command} timed out`);
}

async function waitForTauriBridge(runtime, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await execute(runtime.driverPort, runtime.sessionId, `
      return Boolean(window.__TAURI__?.core?.invoke) && document.readyState !== 'loading';
    `);
    if (ready) return;
    await delay(250);
  }
  throw new Error("Timed out waiting for installed v0.1.4 Tauri bridge");
}

function runCompileTimeBindingProbe(evidenceDir) {
  assert(fs.existsSync(path.resolve("desktop-dist", "index.html")), "Prepared Desktop static surface is required for Gateway build-binding probe");
  const build = spawnSync(
    "cargo",
    ["build", "--locked", "--release", "--manifest-path", "src-tauri/Cargo.toml"],
    {
      cwd: process.cwd(),
      env: { ...process.env, MASTERV_GATEWAY_BASE_URL: compileTimeProbeGatewayUrl },
      encoding: "utf8",
      timeout: 600_000,
      windowsHide: true
    }
  );
  assert(build.status === 0, `Gateway-bound Desktop probe build failed (${build.status}): ${build.stderr || build.stdout || build.error}`);

  const runtimeEnv = { ...process.env };
  delete runtimeEnv.MASTERV_GATEWAY_BASE_URL;
  const verify = spawnSync(process.execPath, ["scripts/desktop-gateway-build-binding-windows.mjs"], {
    cwd: process.cwd(),
    env: runtimeEnv,
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true
  });
  assert(verify.status === 0, `Compile-time Gateway binding verification failed (${verify.status}): ${verify.stderr || verify.stdout || verify.error}`);

  const bindingSource = path.resolve("artifacts", "desktop-gateway-build-binding");
  assert(fs.existsSync(path.join(bindingSource, "gateway-build-binding-evidence.json")), "Gateway build-binding evidence was not created");
  fs.cpSync(bindingSource, path.join(evidenceDir, "build-binding"), { recursive: true });
}

async function main() {
  if (process.platform !== "win32") throw new Error("Published Gateway preflight must run on Windows");

  assert(!process.env.MASTERV_GATEWAY_BASE_URL, "Gateway preflight must not inject MASTERV_GATEWAY_BASE_URL at runtime");
  for (const forbidden of [
    "GEMINI_API_KEY",
    "YOUTUBE_DATA_API_KEY",
    "POLAR_ACCESS_TOKEN",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  ]) {
    assert(!process.env[forbidden], `Gateway preflight must not receive credential: ${forbidden}`);
  }

  const manifestResponse = await fetch(latestEndpoint, { redirect: "follow", cache: "no-store" });
  assert(manifestResponse.ok, `Published latest.json is unavailable: ${manifestResponse.status} ${manifestResponse.statusText}`);
  const manifest = await manifestResponse.json();
  assert(manifest.version === releaseVersion, `Production baseline mismatch: expected ${releaseVersion}, got ${manifest.version}`);
  const platform = manifest.platforms?.["windows-x86_64"];
  assert(platform?.url === installerUrl, `Published v0.1.4 installer URL mismatch: ${platform?.url}`);
  assert(typeof platform?.signature === "string" && platform.signature.trim().length > 0, "Published v0.1.4 manifest signature is missing");

  const evidenceDir = path.resolve("artifacts", "desktop-pilot-1-gateway-preflight");
  fs.rmSync(evidenceDir, { recursive: true, force: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const downloadDir = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-gateway-preflight-${process.pid}`);
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  const installerPath = path.join(downloadDir, canonicalAsset);

  const installerResponse = await fetch(installerUrl, { redirect: "follow", cache: "no-store" });
  assert(installerResponse.ok, `Published v0.1.4 installer is unavailable: ${installerResponse.status} ${installerResponse.statusText}`);
  const installerBytes = Buffer.from(await installerResponse.arrayBuffer());
  assert(installerBytes.length > 0, "Published v0.1.4 installer is empty");
  fs.writeFileSync(installerPath, installerBytes);

  await cleanupInstalledProduct();
  cleanupEphemeralLocalState();

  let runtime = null;
  try {
    const install = spawnSync(installerPath, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    assert(install.status === 0, `Published v0.1.4 install failed (${install.status}): ${install.stderr || install.stdout}`);
    const registry = await waitForInstalledVersion(releaseVersion);
    const appBinary = locateInstalledBinary(registry);

    runtime = await attachMasterV(appBinary, evidenceDir, "masterv-pilot-1-gateway-preflight", { reuseDataDir: false });
    await waitForTauriBridge(runtime);

    const gateway = await invokeJson(runtime, "desktop_gateway_status");
    assert(gateway && typeof gateway.configured === "boolean", "desktop_gateway_status did not return configured boolean");
    assert(gateway.authority === "masterv-gateway", `Unexpected Gateway authority: ${gateway.authority}`);
    assert(gateway.transport === "native-https-json", `Unexpected Gateway transport: ${gateway.transport}`);
    assert(gateway.product_key_bearer_allowed === false, "Product Key must not become a normal Gateway bearer");
    assert(gateway.device_credential_persisted === true, "Device credential persistence contract changed unexpectedly");
    assert(gateway.session_credential_persisted === false, "Session credential must remain memory-only");

    const decision = gateway.configured
      ? "READY_FOR_GATEWAY_REACHABILITY_PREFLIGHT"
      : "BLOCKED_GATEWAY_NOT_CONFIGURED";
    const evidence = {
      status: "MASTERV_PILOT_1_PUBLISHED_GATEWAY_PREFLIGHT_OBSERVED",
      source_authority: "PUBLISHED_GITHUB_RELEASE",
      production_version: releaseVersion,
      release_tag: releaseTag,
      latest_endpoint: latestEndpoint,
      installer_url: installerUrl,
      manifest_signature_present: true,
      installed_registry_version: String(registry.DisplayVersion || "").trim(),
      runtime_gateway_env_injected: false,
      gateway_configured: gateway.configured,
      gateway_authority: gateway.authority,
      gateway_transport: gateway.transport,
      product_key_bearer_allowed: gateway.product_key_bearer_allowed,
      device_credential_persisted: gateway.device_credential_persisted,
      session_credential_persisted: gateway.session_credential_persisted,
      decision,
      product_key_submitted: false,
      activation_called: false,
      provider_operation_executed: false,
      polar_mutation: false,
      application_credentials_used: false,
      signing_credentials_used: false,
      release_mutation: false,
      gateway_deployment_mutation: false,
      external_human_pilot_executed: false
    };

    fs.writeFileSync(path.join(evidenceDir, "gateway-preflight-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    if (runtime) await runtime.close().catch(() => undefined);
    await cleanupInstalledProduct().catch(() => undefined);
  }

  runCompileTimeBindingProbe(evidenceDir);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});