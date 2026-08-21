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

const appConfig = JSON.parse(fs.readFileSync(path.resolve("src-tauri", "tauri.conf.json"), "utf8"));
const productName = appConfig.productName;
const productNamePs = psLiteral(productName);
const baselineVersion = "0.1.3";
const baselineTag = "v0.1.3";
const releaseVersion = "0.1.4";
const releaseTag = "v0.1.4";
const baselineAsset = `MasterV_${baselineVersion}_x64-setup.exe`;
const canonicalAsset = `MasterV_${releaseVersion}_x64-setup.exe`;
const latestEndpoint = "https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json";
const baselineInstallerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${baselineTag}/${baselineAsset}`;
const expectedInstallerUrl = `https://github.com/gycha0109-beep/MasterV/releases/download/${releaseTag}/${canonicalAsset}`;

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

async function cleanupInstalledProduct() {
  for (const entry of uninstallRegistryEntries()) {
    const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
    if (uninstaller && fs.existsSync(uninstaller)) {
      spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    }
  }
  for (let attempt = 0; attempt < 90 && uninstallRegistryEntries().length > 0; attempt++) await delay(500);
}

async function waitForBaselineReady(runtime, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await execute(runtime.driverPort, runtime.sessionId, `return {
        href: location.href,
        readyState: document.readyState,
        surface: window.MASTERV_DESKTOP_CONFIG?.surface || document.querySelector('#surface-badge')?.textContent?.trim() || '',
        heroTag: document.querySelector('.hero')?.tagName || '',
        updaterPanel: Boolean(document.querySelector('#desktop-updater-panel')),
        updaterStatus: document.querySelector('#desktop-updater-status')?.textContent?.trim() || '',
        tauriInvoke: typeof window.__TAURI__?.core?.invoke === 'function'
      };`);
      if (
        last?.href?.startsWith("https://tauri.localhost/") &&
        last.readyState !== "loading" &&
        last.surface === "desktop" &&
        last.heroTag === "HEADER" &&
        last.tauriInvoke === true
      ) return last;
    } catch (error) {
      last = { error: error instanceof Error ? error.message : String(error) };
    }
    await delay(250);
  }
  throw new Error(`Published ${baselineVersion} Desktop DOM was not ready: ${JSON.stringify(last)}`);
}

async function invokeNativeCheck(runtime) {
  const state = await execute(runtime.driverPort, runtime.sessionId, `
    const root = document.documentElement;
    root.dataset.rel1cCheckState = 'pending';
    root.dataset.rel1cCheckResult = '';
    window.__TAURI__.core.invoke('desktop_update_check')
      .then((value) => {
        root.dataset.rel1cCheckState = 'ok';
        root.dataset.rel1cCheckResult = JSON.stringify(value);
      })
      .catch((error) => {
        root.dataset.rel1cCheckState = 'error';
        root.dataset.rel1cCheckResult = String(error);
      });
    return true;
  `);
  assert(state === true, "Published updater native check did not start");

  const deadline = Date.now() + 90_000;
  let last = { state: "pending", result: "" };
  while (Date.now() < deadline) {
    last = await execute(runtime.driverPort, runtime.sessionId, `return {
      state: document.documentElement.dataset.rel1cCheckState || 'pending',
      result: document.documentElement.dataset.rel1cCheckResult || ''
    };`);
    if (last?.state === "error") throw new Error(`Published updater native check failed: ${last.result}`);
    if (last?.state === "ok") {
      let parsed;
      try { parsed = JSON.parse(last.result || "null"); } catch { parsed = null; }
      assert(Array.isArray(parsed), `Published ${baselineVersion} native updater did not return a version tuple: ${last.result}`);
      assert(String(parsed[0] || "") === releaseVersion, `Published ${baselineVersion} native updater discovered unexpected version: ${last.result}`);
      return parsed;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for published updater native check: ${JSON.stringify(last)}`);
}

async function startNativeInstall(runtime) {
  const started = await execute(runtime.driverPort, runtime.sessionId, `
    const root = document.documentElement;
    root.dataset.rel1cInstallState = 'pending';
    root.dataset.rel1cInstallResult = '';
    window.__TAURI__.core.invoke('desktop_update_install')
      .then((value) => {
        root.dataset.rel1cInstallState = 'ok';
        root.dataset.rel1cInstallResult = String(value || '');
      })
      .catch((error) => {
        root.dataset.rel1cInstallState = 'error';
        root.dataset.rel1cInstallResult = String(error);
      });
    return true;
  `);
  assert(started === true, "Published updater native install did not start");
}

async function waitForNativeInstall(runtime, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastBridge = { state: "pending", result: "" };
  let lastRegistry = uninstallRegistryEntries();
  while (Date.now() < deadline) {
    lastRegistry = uninstallRegistryEntries();
    const updated = lastRegistry.find((entry) => String(entry.DisplayVersion || "").trim() === releaseVersion);
    if (updated) return updated;

    try {
      lastBridge = await execute(runtime.driverPort, runtime.sessionId, `return {
        state: document.documentElement.dataset.rel1cInstallState || 'pending',
        result: document.documentElement.dataset.rel1cInstallResult || ''
      };`);
      if (lastBridge?.state === "error") throw new Error(`Published updater native install failed: ${lastBridge.result}`);
    } catch (error) {
      if (String(error).includes("Published updater native install failed")) throw error;
      lastBridge = { state: "runtime-transition", result: error instanceof Error ? error.message : String(error) };
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for signed ${releaseVersion} install; bridge=${JSON.stringify(lastBridge)} registry=${JSON.stringify(lastRegistry)}`);
}

async function waitForUpdatedUi(runtime, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await execute(runtime.driverPort, runtime.sessionId, `return {
      href: location.href,
      readyState: document.readyState,
      heroTag: document.querySelector('.hero')?.tagName || '',
      releaseTrack: window.MASTERV_DESKTOP_CONFIG?.release_track || '',
      updaterPanel: Boolean(document.querySelector('#desktop-updater-panel')),
      updaterStatus: document.querySelector('#desktop-updater-status')?.textContent?.trim() || '',
      updaterNotes: document.querySelector('#desktop-updater-notes')?.textContent?.trim() || ''
    };`);
    if (last?.updaterStatus === "확인 실패" || last?.updaterStatus === "설치 실패") {
      throw new Error(`Updated ${releaseVersion} updater UI failed: ${last.updaterStatus}: ${last.updaterNotes}`);
    }
    if (
      last?.href?.startsWith("https://tauri.localhost/") &&
      last.readyState !== "loading" &&
      last.heroTag === "HEADER" &&
      last.releaseTrack === releaseVersion &&
      last.updaterPanel === true &&
      last.updaterStatus === "최신 버전"
    ) return last;
    await delay(500);
  }
  throw new Error(`Timed out waiting for updated ${releaseVersion} updater UI: ${JSON.stringify(last)}`);
}

async function closeRuntime(runtime) {
  if (!runtime) return;
  await runtime.close().catch(() => undefined);
}

async function main() {
  if (process.platform !== "win32") throw new Error("MV-REL-1C published updater verification must run on Windows");

  for (const forbidden of [
    "GEMINI_API_KEY",
    "YOUTUBE_DATA_API_KEY",
    "POLAR_ACCESS_TOKEN",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  ]) {
    assert(!process.env[forbidden], `MV-REL-1C verification must not receive credential: ${forbidden}`);
  }

  const manifestResponse = await fetch(latestEndpoint, { redirect: "follow", cache: "no-store" });
  assert(manifestResponse.ok, `Published latest.json is unavailable: ${manifestResponse.status} ${manifestResponse.statusText}`);
  const manifest = await manifestResponse.json();
  assert(manifest.version === releaseVersion, `Published manifest version mismatch: expected ${releaseVersion}, got ${manifest.version}`);
  const platform = manifest.platforms?.["windows-x86_64"];
  assert(platform?.url === expectedInstallerUrl, `Published installer URL mismatch: ${platform?.url}`);
  assert(typeof platform?.signature === "string" && platform.signature.trim().length > 0, "Published manifest signature is empty");

  const evidenceDir = path.resolve("artifacts", "desktop-rel-1c-published-updater");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const downloadRoot = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-rel-1c-download-${process.pid}`);
  fs.rmSync(downloadRoot, { recursive: true, force: true });
  fs.mkdirSync(downloadRoot, { recursive: true });
  const baselineInstaller = path.join(downloadRoot, baselineAsset);

  const baselineResponse = await fetch(baselineInstallerUrl, { redirect: "follow", cache: "no-store" });
  assert(baselineResponse.ok, `Published ${baselineVersion} baseline installer is unavailable: ${baselineResponse.status} ${baselineResponse.statusText}`);
  const baselineBytes = Buffer.from(await baselineResponse.arrayBuffer());
  assert(baselineBytes.length > 0, `Published ${baselineVersion} baseline installer is empty`);
  fs.writeFileSync(baselineInstaller, baselineBytes);

  await cleanupInstalledProduct();

  let baselineRuntime = null;
  let updatedRuntime = null;
  try {
    const install = spawnSync(baselineInstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    assert(install.status === 0, `${baselineVersion} published baseline install failed (${install.status}): ${install.stderr || install.stdout}`);
    const baselineEntry = await waitForInstalledVersion(baselineVersion);
    const baselineBinary = locateInstalledBinary(baselineEntry);

    baselineRuntime = await attachMasterV(baselineBinary, evidenceDir, "masterv-rel-1c-published-0.1.3");
    const baselineUi = await waitForBaselineReady(baselineRuntime);
    assert(baselineUi.updaterPanel === false, "Published 0.1.3 no longer reproduces the frozen updater bootstrap defect");

    const nativeCheck = await invokeNativeCheck(baselineRuntime);
    await startNativeInstall(baselineRuntime);
    const updatedEntry = await waitForNativeInstall(baselineRuntime);
    const updatedBinary = locateInstalledBinary(updatedEntry);

    await closeRuntime(baselineRuntime);
    baselineRuntime = null;

    updatedRuntime = await attachMasterV(updatedBinary, evidenceDir, "masterv-rel-1c-updated-0.1.4");
    const updatedUi = await waitForUpdatedUi(updatedRuntime);

    const evidence = {
      status: "MASTERV_REL_1C_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS",
      baseline_version: baselineVersion,
      baseline_tag: baselineTag,
      baseline_source: "PUBLISHED_GITHUB_RELEASE",
      baseline_installer_url: baselineInstallerUrl,
      baseline_dom_ready_wait: true,
      baseline_app_target: "https://tauri.localhost/",
      baseline_ui_bootstrap_defect_reproduced: true,
      native_updater_bridge_discovered_version: nativeCheck[0],
      published_version: releaseVersion,
      release_tag: releaseTag,
      endpoint: latestEndpoint,
      canonical_installer_url: expectedInstallerUrl,
      signature_present_in_manifest: true,
      tauri_signature_verified_by_successful_install: true,
      installed_version_after_update: String(updatedEntry.DisplayVersion || "").trim(),
      hotfix_updater_panel_created: updatedUi.updaterPanel === true,
      post_update_check: "LATEST",
      subscription_required: false,
      application_credentials_used: false,
      signing_credentials_used: false,
      supabase_required: false,
      release_mutation: false
    };
    fs.writeFileSync(path.join(evidenceDir, "published-updater-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    await closeRuntime(baselineRuntime);
    await closeRuntime(updatedRuntime);
    await cleanupInstalledProduct();
    fs.rmSync(downloadRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
