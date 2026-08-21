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
const baselineVersion = "0.1.3";
const baselineTag = "v0.1.3";
const releaseVersion = String(process.env.MASTERV_REL_1B_VERSION || "0.1.4").trim();
const releaseTag = String(process.env.MASTERV_REL_1B_TAG || "v0.1.4").trim();
const baselineAsset = `MasterV_${baselineVersion}_x64-setup.exe`;
const canonicalAsset = `MasterV_${releaseVersion}_x64-setup.exe`;
const latestEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";
const baselineInstallerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${baselineTag}/${baselineAsset}`;
const expectedInstallerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${releaseTag}/${canonicalAsset}`;

assert(releaseVersion === "0.1.4", `MV-REL-1B runtime smoke only accepts release 0.1.4, got ${releaseVersion}`);
assert(releaseTag === "v0.1.4", `MV-REL-1B runtime smoke only accepts tag v0.1.4, got ${releaseTag}`);

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

function locateInstalledBinary(entry) {
  const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
  const roots = [entry.InstallLocation, path.dirname(uninstaller), process.env.LOCALAPPDATA, process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    const match = findFiles(path.resolve(root), (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 5)[0];
    if (match) return path.resolve(match);
  }
  throw new Error(`Installed MasterV binary not found under ${roots.join(", ")}`);
}

async function launchWithCdp(binary, evidenceDir, label) {
  const runtimeRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-rel-1b-${label}-${process.pid}`);
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
      const panel = document.querySelector('#desktop-updater-panel');
      const status = document.querySelector('#desktop-updater-status')?.textContent?.trim() || '';
      const notes = document.querySelector('#desktop-updater-notes')?.textContent?.trim() || '';
      const install = document.querySelector('#desktop-updater-install');
      return { panel: Boolean(panel), status, notes, installHidden: install ? install.hidden : true, installDisabled: install ? install.disabled : true };
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
  if (process.platform !== "win32") throw new Error("MV-REL-1B published updater signature smoke must run on Windows");

  for (const forbidden of ["GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "POLAR_ACCESS_TOKEN"]) {
    assert(!process.env[forbidden], `MV-REL-1B published updater smoke must not depend on application credential: ${forbidden}`);
  }

  const manifestResponse = await fetch(latestEndpoint, { redirect: "follow", cache: "no-store" });
  assert(manifestResponse.ok, `Published latest.json is unavailable: ${manifestResponse.status} ${manifestResponse.statusText}`);
  const manifest = await manifestResponse.json();
  assert(manifest.version === releaseVersion, `Published manifest version mismatch: expected ${releaseVersion}, got ${manifest.version}`);
  const platform = manifest.platforms?.["windows-x86_64"];
  assert(platform?.url === expectedInstallerUrl, `Published installer URL mismatch: ${platform?.url}`);
  assert(typeof platform?.signature === "string" && platform.signature.trim().length > 0, "Published manifest signature is empty");

  const evidenceDir = path.resolve("artifacts", "desktop-rel-1b-published-updater");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const downloadRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-rel-1b-download-${process.pid}`);
  fs.rmSync(downloadRoot, { recursive: true, force: true });
  fs.mkdirSync(downloadRoot, { recursive: true });
  const baselineInstaller = path.join(downloadRoot, baselineAsset);

  const baselineResponse = await fetch(baselineInstallerUrl, { redirect: "follow", cache: "no-store" });
  assert(baselineResponse.ok, `Published ${baselineVersion} baseline installer is unavailable: ${baselineResponse.status} ${baselineResponse.statusText}`);
  const baselineBytes = Buffer.from(await baselineResponse.arrayBuffer());
  assert(baselineBytes.length > 0, `Published ${baselineVersion} baseline installer is empty`);
  fs.writeFileSync(baselineInstaller, baselineBytes);

  await cleanupInstalledProduct();

  let firstLaunch = null;
  let secondLaunch = null;
  try {
    const install = spawnSync(baselineInstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    assert(install.status === 0, `${baselineVersion} published baseline install failed (${install.status}): ${install.stderr || install.stdout}`);
    const baselineEntry = await waitForInstalledVersion(baselineVersion);
    const binary = locateInstalledBinary(baselineEntry);

    firstLaunch = await launchWithCdp(binary, evidenceDir, "published-0.1.3-baseline");
    const baselineUi = await firstLaunch.cdp.evaluate(`(() => ({
      heroTag: document.querySelector('.hero')?.tagName || '',
      updaterPanel: Boolean(document.querySelector('#desktop-updater-panel')),
      updaterStatus: document.querySelector('#desktop-updater-status')?.textContent?.trim() || ''
    }))()`);
    assert(baselineUi?.heroTag === "HEADER", `Published 0.1.3 hero contract changed unexpectedly: ${baselineUi?.heroTag}`);
    assert(baselineUi?.updaterPanel === false, "Published 0.1.3 no longer reproduces the frozen updater bootstrap defect");

    const nativeCheck = await firstLaunch.cdp.evaluate(`window.__TAURI__.core.invoke('desktop_update_check')`);
    assert(Array.isArray(nativeCheck), `Published 0.1.3 native updater did not discover ${releaseVersion}: ${JSON.stringify(nativeCheck)}`);
    assert(String(nativeCheck[0] || "") === releaseVersion, `Published 0.1.3 native updater discovered unexpected version: ${JSON.stringify(nativeCheck)}`);

    await firstLaunch.cdp.evaluate(`(() => {
      const root = document.documentElement;
      root.dataset.rel1bInstallState = 'pending';
      root.dataset.rel1bInstallResult = '';
      window.__TAURI__.core.invoke('desktop_update_install')
        .then((value) => {
          root.dataset.rel1bInstallState = 'ok';
          root.dataset.rel1bInstallResult = String(value || '');
        })
        .catch((error) => {
          root.dataset.rel1bInstallState = 'error';
          root.dataset.rel1bInstallResult = String(error);
        });
      return true;
    })()`);

    const installDeadline = Date.now() + 180_000;
    let bridgeState = { state: "pending", result: "" };
    while (Date.now() < installDeadline) {
      if (firstLaunch.child.exitCode !== null) break;
      try {
        bridgeState = await firstLaunch.cdp.evaluate(`(() => ({
          state: document.documentElement.dataset.rel1bInstallState || 'pending',
          result: document.documentElement.dataset.rel1bInstallResult || ''
        }))()`);
        if (bridgeState?.state === "error") throw new Error(`Published updater native install failed: ${bridgeState.result}`);
        if (bridgeState?.state === "ok") break;
      } catch (error) {
        if (firstLaunch.child.exitCode === null) throw error;
        break;
      }
      await delay(500);
    }
    assert(firstLaunch.child.exitCode !== null || bridgeState?.state === "ok", `Published updater install did not complete: ${JSON.stringify(bridgeState)}`);

    const updatedEntry = await waitForInstalledVersion(releaseVersion, 180_000);
    const updatedBinary = locateInstalledBinary(updatedEntry);

    firstLaunch.cdp.close();
    if (firstLaunch.child.exitCode === null) {
      spawnSync("taskkill.exe", ["/PID", String(firstLaunch.child.pid), "/T", "/F"], { encoding: "utf8", timeout: 30_000 });
    }
    try { fs.closeSync(firstLaunch.logFd); } catch {}
    fs.rmSync(firstLaunch.runtimeRoot, { recursive: true, force: true });
    firstLaunch = null;

    secondLaunch = await launchWithCdp(updatedBinary, evidenceDir, "updated-0.1.4");
    const latest = await waitForUpdaterState(
      secondLaunch.cdp,
      (state) => state?.panel === true && state?.status === "최신 버전",
      60_000
    );
    assert(latest.status === "최신 버전", `Updated ${releaseVersion} app did not resolve stable channel as current: ${latest.status}`);

    const updatedRuntime = await secondLaunch.cdp.evaluate(`(() => ({
      heroTag: document.querySelector('.hero')?.tagName || '',
      releaseTrack: window.MASTERV_DESKTOP_CONFIG?.release_track || '',
      updaterPanel: Boolean(document.querySelector('#desktop-updater-panel'))
    }))()`);
    assert(updatedRuntime?.heroTag === "HEADER", `Updated ${releaseVersion} hero tag mismatch: ${updatedRuntime?.heroTag}`);
    assert(updatedRuntime?.releaseTrack === releaseVersion, `Updated ${releaseVersion} release track mismatch: ${updatedRuntime?.releaseTrack}`);
    assert(updatedRuntime?.updaterPanel === true, `Updated ${releaseVersion} updater panel is missing`);

    const evidence = {
      status: "MASTERV_REL_1B_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS",
      baseline_version: baselineVersion,
      baseline_tag: baselineTag,
      baseline_source: "PUBLISHED_GITHUB_RELEASE",
      baseline_installer_url: baselineInstallerUrl,
      baseline_ui_bootstrap_defect_reproduced: true,
      native_updater_bridge_discovered_version: nativeCheck[0],
      published_version: releaseVersion,
      release_tag: releaseTag,
      endpoint: latestEndpoint,
      canonical_installer_url: expectedInstallerUrl,
      signature_present_in_manifest: true,
      tauri_signature_verified_by_successful_install: true,
      installed_version_after_update: String(updatedEntry.DisplayVersion || "").trim(),
      hotfix_updater_panel_created: true,
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
    fs.rmSync(downloadRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
