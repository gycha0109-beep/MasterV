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

function psLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function powershell(script, timeout = 120_000) {
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
        reject(new Error("failed to allocate updater verification debug port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForCdp(port, child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Installed MasterV exited before WebView2 became ready (code ${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const pages = await response.json();
        const page = Array.isArray(pages) ? pages.find((entry) => entry?.webSocketDebuggerUrl) : null;
        if (page?.webSocketDebuggerUrl) return page;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new Error(`Installed MasterV WebView2 was not ready: ${lastError}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    assert(typeof WebSocket === "function", "Node.js WebSocket global is required for CDP verification");
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error("CDP websocket connect timeout")), 15_000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket connection failed"));
      }, { once: true });
      ws.addEventListener("message", (event) => {
        const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
        const message = JSON.parse(raw);
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result);
      });
    });
    await this.send("Runtime.enable");
  }

  async send(method, params = {}) {
    assert(this.ws, "CDP websocket is not connected");
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return await promise;
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(`CDP evaluation failed: ${result.exceptionDetails.text || "unknown exception"}`);
    return result.result?.value;
  }

  close() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

const appConfig = JSON.parse(fs.readFileSync(path.resolve("src-tauri", "tauri.conf.json"), "utf8"));
const productName = appConfig.productName;
const productNamePs = psLiteral(productName);
const baselineVersion = "0.1.2";
const releaseVersion = String(process.env.MASTERV_REL_1_VERSION || "0.1.3").trim();
const releaseTag = String(process.env.MASTERV_REL_1_TAG || "v0.1.3").trim();
const canonicalAsset = `MasterV_${releaseVersion}_x64-setup.exe`;
const latestEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";
const expectedInstallerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${releaseTag}/${canonicalAsset}`;

assert(releaseVersion === "0.1.3", `MV-REL-1 runtime smoke only accepts release 0.1.3, got ${releaseVersion}`);
assert(releaseTag === "v0.1.3", `MV-REL-1 runtime smoke only accepts tag v0.1.3, got ${releaseTag}`);

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

async function waitForInstalledVersion(version, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = uninstallRegistryEntries();
    if (entries.length === 1 && String(entries[0].DisplayVersion || "").trim() === version) return entries[0];
    await delay(1000);
  }
  const entries = uninstallRegistryEntries();
  throw new Error(`Timed out waiting for installed version ${version}; registry=${JSON.stringify(entries)}`);
}

async function launchWithCdp(binary, evidenceDir, label) {
  const runtimeRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-rel-1-${label}-${process.pid}`);
  const dataDir = path.join(runtimeRoot, "webview2");
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const debugPort = await freePort();
  const logPath = path.join(evidenceDir, `${label}-process.log`);
  const logFd = fs.openSync(logPath, "w");
  const child = spawn(binary, [], {
    cwd: path.dirname(binary),
    env: {
      ...process.env,
      MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT: String(debugPort),
      MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR: dataDir
    },
    stdio: ["ignore", logFd, logFd],
    windowsHide: false
  });
  const page = await waitForCdp(debugPort, child);
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  return { child, cdp, logFd, runtimeRoot };
}

async function closeLaunch(launch) {
  launch.cdp?.close();
  if (launch.child && launch.child.exitCode === null) {
    launch.child.kill();
    await delay(800);
    if (launch.child.exitCode === null) {
      spawnSync("taskkill.exe", ["/PID", String(launch.child.pid), "/T", "/F"], { encoding: "utf8", timeout: 30_000 });
    }
  }
  try { fs.closeSync(launch.logFd); } catch {}
  fs.rmSync(launch.runtimeRoot, { recursive: true, force: true });
}

async function waitForUpdaterState(cdp, predicate, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await cdp.evaluate(`(() => {
      const status = document.querySelector('#desktop-updater-status')?.textContent?.trim() || '';
      const notes = document.querySelector('#desktop-updater-notes')?.textContent?.trim() || '';
      const install = document.querySelector('#desktop-updater-install');
      return { status, notes, installHidden: install ? install.hidden : true, installDisabled: install ? install.disabled : true };
    })()`);
    if (last?.status === "확인 실패" || last?.status === "설치 실패") {
      throw new Error(`Updater UI failed: ${last.status}: ${last.notes}`);
    }
    if (predicate(last)) return last;
    await delay(500);
  }
  throw new Error(`Timed out waiting for updater UI state; last=${JSON.stringify(last)}`);
}

async function cleanupInstalledProduct() {
  for (const entry of uninstallRegistryEntries()) {
    const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
    if (uninstaller && fs.existsSync(uninstaller)) {
      spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    }
  }
  for (let attempt = 0; attempt < 90 && uninstallRegistryEntries().length > 0; attempt++) await delay(500);
}

async function main() {
  if (process.platform !== "win32") throw new Error("Published updater signature smoke must run on Windows");

  for (const forbidden of ["GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "POLAR_ACCESS_TOKEN"]) {
    assert(!process.env[forbidden], `Published updater smoke must not depend on application credential: ${forbidden}`);
  }

  const manifestResponse = await fetch(latestEndpoint, { redirect: "follow", cache: "no-store" });
  assert(manifestResponse.ok, `Published latest.json is unavailable: ${manifestResponse.status} ${manifestResponse.statusText}`);
  const manifest = await manifestResponse.json();
  assert(manifest.version === releaseVersion, `Published manifest version mismatch: expected ${releaseVersion}, got ${manifest.version}`);
  const platform = manifest.platforms?.["windows-x86_64"];
  assert(platform?.url === expectedInstallerUrl, `Published installer URL mismatch: ${platform?.url}`);
  assert(typeof platform?.signature === "string" && platform.signature.trim().length > 0, "Published manifest signature is empty");

  const bundleDir = path.resolve("src-tauri", "target", "release", "bundle", "nsis");
  const baselineInstallerName = `${productName}_${baselineVersion}_x64-setup.exe`;
  const baselineInstallers = findFiles(bundleDir, (file) => path.basename(file) === baselineInstallerName, 1);
  assert(baselineInstallers.length === 1, `Expected exact ${baselineVersion} baseline installer, found ${baselineInstallers.length}`);

  const evidenceDir = path.resolve("artifacts", "desktop-rel-1-published-updater");
  fs.mkdirSync(evidenceDir, { recursive: true });
  await cleanupInstalledProduct();

  let firstLaunch = null;
  let secondLaunch = null;
  try {
    const install = spawnSync(baselineInstallers[0], ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    assert(install.status === 0, `0.1.2 baseline install failed (${install.status}): ${install.stderr || install.stdout}`);
    const baselineEntry = await waitForInstalledVersion(baselineVersion);
    const baselineUninstaller = parseExecutable(baselineEntry.QuietUninstallString || baselineEntry.UninstallString || "");
    const roots = [baselineEntry.InstallLocation, path.dirname(baselineUninstaller), process.env.LOCALAPPDATA, process.env.ProgramFiles].filter(Boolean);
    let binary = "";
    for (const root of roots) {
      const match = findFiles(path.resolve(root), (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 5)[0];
      if (match) { binary = path.resolve(match); break; }
    }
    assert(binary && fs.existsSync(binary), `Installed baseline binary not found under ${roots.join(", ")}`);

    firstLaunch = await launchWithCdp(binary, evidenceDir, "baseline");
    const available = await waitForUpdaterState(
      firstLaunch.cdp,
      (state) => state?.status?.includes(`${releaseVersion} 사용 가능`) && state.installHidden === false
    );
    assert(available.status.includes(releaseVersion), `Expected ${releaseVersion} update availability, got ${available.status}`);

    await firstLaunch.cdp.evaluate(`(() => {
      const button = document.querySelector('#desktop-updater-install');
      if (!button || button.hidden) throw new Error('update install button is unavailable');
      button.click();
      return true;
    })()`);
    firstLaunch.cdp.close();

    const exitDeadline = Date.now() + 120_000;
    while (firstLaunch.child.exitCode === null && Date.now() < exitDeadline) await delay(500);
    assert(firstLaunch.child.exitCode !== null, "Baseline app did not exit after Tauri updater installation started");
    try { fs.closeSync(firstLaunch.logFd); } catch {}
    fs.rmSync(firstLaunch.runtimeRoot, { recursive: true, force: true });
    firstLaunch = null;

    const updatedEntry = await waitForInstalledVersion(releaseVersion, 180_000);
    const updatedUninstaller = parseExecutable(updatedEntry.QuietUninstallString || updatedEntry.UninstallString || "");
    const updatedRoots = [updatedEntry.InstallLocation, path.dirname(updatedUninstaller), process.env.LOCALAPPDATA, process.env.ProgramFiles].filter(Boolean);
    let updatedBinary = "";
    for (const root of updatedRoots) {
      const match = findFiles(path.resolve(root), (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 5)[0];
      if (match) { updatedBinary = path.resolve(match); break; }
    }
    assert(updatedBinary && fs.existsSync(updatedBinary), "Updated 0.1.3 binary is missing after Tauri updater install");

    secondLaunch = await launchWithCdp(updatedBinary, evidenceDir, "updated");
    const latest = await waitForUpdaterState(secondLaunch.cdp, (state) => state?.status === "최신 버전", 60_000);
    assert(latest.status === "최신 버전", `Updated app did not resolve stable channel as current: ${latest.status}`);

    const evidence = {
      status: "MASTERV_REL_1_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS",
      baseline_version: baselineVersion,
      published_version: releaseVersion,
      release_tag: releaseTag,
      endpoint: latestEndpoint,
      canonical_installer_url: expectedInstallerUrl,
      signature_present_in_manifest: true,
      tauri_signature_verified_by_successful_install: true,
      installed_version_after_update: String(updatedEntry.DisplayVersion || "").trim(),
      post_update_check: "LATEST",
      subscription_required: false,
      application_credentials_used: false,
      supabase_required: false
    };
    fs.writeFileSync(path.join(evidenceDir, "published-updater-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    if (firstLaunch) await closeLaunch(firstLaunch);
    if (secondLaunch) await closeLaunch(secondLaunch);
    await cleanupInstalledProduct();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
