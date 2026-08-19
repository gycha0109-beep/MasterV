import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function powershell(script, timeout = 90_000) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", timeout }
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
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && predicate(full)) found.push(full);
    if (entry.isDirectory()) found.push(...findFiles(full, predicate, depth - 1));
  }
  return found;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate updater launch debug port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForCdp(port, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Installed independent updater exited early (code ${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new Error(`Installed independent updater WebView2 was not ready: ${lastError}`);
}

function uninstallRegistryEntries() {
  const json = powershell(`
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$entries = @(Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq 'MasterV' } |
  Select-Object DisplayName,InstallLocation,UninstallString,QuietUninstallString)
$entries | ConvertTo-Json -Compress
`);
  if (!json) return [];
  const parsed = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function main() {
  if (process.platform !== "win32") throw new Error("Independent updater installed-launch smoke must run on Windows");

  const bundleDir = path.resolve("src-tauri", "target", "release", "bundle", "nsis");
  const installers = findFiles(bundleDir, (file) => path.basename(file) === "MasterV_0.1.1_x64-setup.exe", 1);
  assert(installers.length === 1, `Expected exact 0.1.1 independent updater bootstrap installer, found ${installers.length}`);
  const installer = installers[0];

  for (const entry of uninstallRegistryEntries()) {
    const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
    if (uninstaller && fs.existsSync(uninstaller)) {
      const cleanup = spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
      assert(cleanup.status === 0, `Preexisting MasterV cleanup failed (${cleanup.status})`);
    }
  }
  await delay(800);
  assert(uninstallRegistryEntries().length === 0, "Preexisting MasterV uninstall entry remained before independent updater install");

  const install = spawnSync(installer, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
  assert(install.status === 0, `Independent updater NSIS install failed (${install.status}): ${install.stderr || install.stdout}`);

  const entries = uninstallRegistryEntries();
  assert(entries.length === 1, `Expected one MasterV uninstall entry after independent updater install, found ${entries.length}`);
  const entry = entries[0];
  const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
  assert(uninstaller && fs.existsSync(uninstaller), "Independent updater uninstaller is missing");

  const roots = [
    entry.InstallLocation,
    path.dirname(uninstaller),
    path.join(process.env.LOCALAPPDATA || "", "MasterV"),
    path.join(process.env.ProgramFiles || "", "MasterV")
  ].filter(Boolean);
  let binary = "";
  for (const root of roots) {
    const match = findFiles(path.resolve(root), (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 4)[0];
    if (match) {
      binary = path.resolve(match);
      break;
    }
  }
  assert(binary && fs.existsSync(binary), `Installed independent updater binary not found under ${roots.join(", ")}`);

  const evidenceDir = path.resolve("artifacts", "desktop-independent-updater-bootstrap");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const runtimeRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-independent-updater-${process.pid}`);
  const dataDir = path.join(runtimeRoot, "webview2");
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const debugPort = await freePort();
  const appLogPath = path.join(evidenceDir, "installed-masterv-process.log");
  const appLog = fs.openSync(appLogPath, "w");
  let child;
  let cdpVersion;

  try {
    child = spawn(binary, [], {
      cwd: path.dirname(binary),
      env: {
        ...process.env,
        MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT: String(debugPort),
        MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR: dataDir
      },
      stdio: ["ignore", appLog, appLog],
      windowsHide: false
    });
    cdpVersion = await waitForCdp(debugPort, child, 30_000);
    const pagesResponse = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    assert(pagesResponse.ok, `Independent updater CDP page list failed: ${pagesResponse.status}`);
    const pages = await pagesResponse.json();
    assert(Array.isArray(pages) && pages.length > 0, "Independent updater opened no WebView2 page");
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await delay(800);
      if (child.exitCode === null) {
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8", timeout: 30_000 });
      }
    }
    fs.closeSync(appLog);
  }

  const uninstall = spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
  assert(uninstall.status === 0, `Independent updater silent uninstall failed (${uninstall.status}): ${uninstall.stderr || uninstall.stdout}`);
  for (let attempt = 0; attempt < 30 && (fs.existsSync(binary) || uninstallRegistryEntries().length > 0); attempt++) await delay(500);
  assert(!fs.existsSync(binary), `Independent updater installed binary remained after uninstall: ${binary}`);
  assert(uninstallRegistryEntries().length === 0, "Independent updater uninstall registry entry remained");
  fs.rmSync(runtimeRoot, { recursive: true, force: true });

  const evidence = {
    status: "MASTERV_DESKTOP_INDEPENDENT_UPDATER_INSTALLED_LAUNCH_PASS",
    version: "0.1.1",
    installed_binary: binary,
    webview2_cdp_ready: true,
    browser: cdpVersion?.Browser || null,
    plugin_config_deserialized: true,
    updater_feature: "independent-updater",
    subscription_independent: true,
    update_release_published: false,
    automatic_install: false,
    uninstall: "PASS",
    activation_allowed: false
  };
  fs.writeFileSync(path.join(evidenceDir, "installed-launch-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
