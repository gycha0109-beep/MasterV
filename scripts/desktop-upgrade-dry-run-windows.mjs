import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, attachMasterV, delay, execute } from "./windows-webview2-attach.mjs";

if (process.platform !== "win32") throw new Error("MV-POST-EXIT-1 upgrade dry-run must run on Windows");

const root = process.cwd();
const tauri = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const productName = tauri.productName;
const baselineVersion = "0.1.2";
const candidateVersion = "0.1.3";
const bundleDir = path.resolve("src-tauri", "target", "release", "bundle", "nsis");
const baselineInstaller = path.join(bundleDir, `${productName}_${baselineVersion}_x64-setup.exe`);
const candidateInstaller = path.join(bundleDir, `${productName}_${candidateVersion}_x64-setup.exe`);
const evidenceDir = path.resolve("artifacts", "desktop-post-exit-1-upgrade");
fs.mkdirSync(evidenceDir, { recursive: true });

function psLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function powershell(script, timeout = 90_000) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout,
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  return String(result.stdout || "").trim();
}

function parseExecutable(command) {
  const value = String(command || "").trim();
  const quoted = value.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  return value.match(/^([^\s]+\.exe)/i)?.[1] || "";
}

function findFiles(searchRoot, predicate, depth = 5) {
  if (!searchRoot || !fs.existsSync(searchRoot) || depth < 0) return [];
  const found = [];
  for (const entry of fs.readdirSync(searchRoot, { withFileTypes: true })) {
    const full = path.join(searchRoot, entry.name);
    if (entry.isFile() && predicate(full)) found.push(full);
    if (entry.isDirectory()) found.push(...findFiles(full, predicate, depth - 1));
  }
  return found;
}

const productNamePs = psLiteral(productName);
function uninstallRegistryEntries() {
  const raw = powershell(`
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
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function waitForRegistryVersion(version, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = uninstallRegistryEntries();
    if (last.length === 1 && String(last[0].DisplayVersion || "") === version) return last[0];
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${productName} registry version ${version}: ${JSON.stringify(last)}`);
}

async function waitForUninstallCleanup(binary, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((!binary || !fs.existsSync(binary)) && uninstallRegistryEntries().length === 0) return;
    await delay(500);
  }
  throw new Error(`Uninstall residue remained: binary=${binary && fs.existsSync(binary)} registry=${JSON.stringify(uninstallRegistryEntries())}`);
}

function locateInstalledBinary(entry) {
  const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
  const roots = [entry.InstallLocation, uninstaller ? path.dirname(uninstaller) : "", process.env.LOCALAPPDATA || "", process.env.ProgramFiles || ""].filter(Boolean);
  for (const searchRoot of roots) {
    const match = findFiles(path.resolve(searchRoot), (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 5)[0];
    if (match) return path.resolve(match);
  }
  throw new Error(`Installed ${productName} binary not found under ${roots.join(", ")}`);
}

async function invoke(native, command, args = {}) {
  await execute(native.driverPort, native.sessionId, `
    const root = document.documentElement;
    root.dataset.postExitInvokeState = 'pending';
    root.dataset.postExitInvokeResult = '';
    window.__TAURI__.core.invoke(arguments[0], arguments[1] || {})
      .then((result) => {
        root.dataset.postExitInvokeResult = JSON.stringify(result ?? null);
        root.dataset.postExitInvokeState = 'ok';
      })
      .catch((error) => {
        root.dataset.postExitInvokeResult = String(error);
        root.dataset.postExitInvokeState = 'error';
      });
    return true;
  `, [command, args]);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await execute(native.driverPort, native.sessionId, `return {
      state: document.documentElement.dataset.postExitInvokeState || '',
      result: document.documentElement.dataset.postExitInvokeResult || ''
    };`);
    if (state.state === "ok") return state.result ? JSON.parse(state.result) : null;
    if (state.state === "error") throw new Error(`${command} failed: ${state.result}`);
    await delay(200);
  }
  throw new Error(`${command} timed out`);
}

function silentInstall(installer, label) {
  assert(fs.existsSync(installer), `${label} installer missing: ${installer}`);
  const result = spawnSync(installer, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
  assert(result.status === 0, `${label} install failed (${result.status}): ${result.stderr || result.stdout}`);
}

async function cleanPreexistingInstall() {
  for (const entry of uninstallRegistryEntries()) {
    const uninstaller = parseExecutable(entry.QuietUninstallString || entry.UninstallString || "");
    if (uninstaller && fs.existsSync(uninstaller)) {
      const result = spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
      assert(result.status === 0, `Preexisting ${productName} uninstall failed (${result.status})`);
    }
  }
  await waitForUninstallCleanup("");
}

const suffix = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
const sourceId = `post-exit-upgrade-${suffix}`;
const fixture = {
  source_platform: "youtube",
  source_id: sourceId,
  native_id: sourceId,
  canonical_url: `https://www.youtube.com/watch?v=${sourceId}`,
  label: `MV-POST-EXIT-1 upgrade fixture ${suffix}`,
  analysis: { summary: "Local SQLite must survive 0.1.2 to 0.1.3 upgrade dry-run", tags: ["mv-post-exit-1"] },
  analysis_cache_key: `post-exit-1:${sourceId}`,
  analysis_provenance: "upgrade-dry-run",
  schema_version: "reference-library-v1",
  first_saved_at: null,
  updated_at: null
};

let baselineRuntime;
let candidateRuntime;
let finalBinary = "";
try {
  await cleanPreexistingInstall();

  silentInstall(baselineInstaller, "0.1.2 baseline");
  const baselineEntry = await waitForRegistryVersion(baselineVersion);
  const baselineBinary = locateInstalledBinary(baselineEntry);
  baselineRuntime = await attachMasterV(baselineBinary, evidenceDir, "masterv-post-exit-baseline");
  const baselineStatus = await invoke(baselineRuntime, "desktop_local_persistence_status");
  assert(baselineStatus?.local_sqlite_authority_active === true, "0.1.2 baseline Local SQLite authority missing");
  await invoke(baselineRuntime, "desktop_local_reference_upsert", { input: fixture });
  const baselineList = await invoke(baselineRuntime, "desktop_local_reference_library_list");
  assert(Array.isArray(baselineList) && baselineList.some((entry) => entry.source_id === sourceId), "0.1.2 baseline fixture was not persisted");
  await baselineRuntime.close();
  baselineRuntime = null;
  await delay(800);

  silentInstall(candidateInstaller, "0.1.3 RC in-place upgrade");
  const candidateEntry = await waitForRegistryVersion(candidateVersion);
  finalBinary = locateInstalledBinary(candidateEntry);
  candidateRuntime = await attachMasterV(finalBinary, evidenceDir, "masterv-post-exit-candidate");
  const candidateState = await execute(candidateRuntime.driverPort, candidateRuntime.sessionId, `return {
    releaseTrack: window.MASTERV_DESKTOP_CONFIG?.release_track || '',
    stage: window.MASTERV_DESKTOP_CONFIG?.architecture_stage || ''
  };`);
  assert(candidateState.releaseTrack === "0.1.3", `candidate release track mismatch: ${candidateState.releaseTrack}`);
  assert(candidateState.stage === "MV-EXIT-3-CLEAN-CUT", `candidate architecture stage mismatch: ${candidateState.stage}`);
  const candidateStatus = await invoke(candidateRuntime, "desktop_local_persistence_status");
  assert(candidateStatus?.local_sqlite_authority_active === true, "0.1.3 candidate Local SQLite authority missing");
  assert(candidateStatus.database_path === baselineStatus.database_path, `Local SQLite path changed across upgrade: ${baselineStatus.database_path} -> ${candidateStatus.database_path}`);
  const candidateList = await invoke(candidateRuntime, "desktop_local_reference_library_list");
  assert(Array.isArray(candidateList) && candidateList.some((entry) => entry.source_id === sourceId), "Local SQLite fixture did not survive 0.1.2 -> 0.1.3 upgrade");
  await invoke(candidateRuntime, "desktop_local_reference_delete", { sourceId });
  await candidateRuntime.close();
  candidateRuntime = null;

  const finalEntry = (await waitForRegistryVersion(candidateVersion));
  const uninstaller = parseExecutable(finalEntry.QuietUninstallString || finalEntry.UninstallString || "");
  assert(uninstaller && fs.existsSync(uninstaller), "0.1.3 RC uninstaller missing");
  const uninstall = spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
  assert(uninstall.status === 0, `0.1.3 RC uninstall failed (${uninstall.status}): ${uninstall.stderr || uninstall.stdout}`);
  await waitForUninstallCleanup(finalBinary);

  const evidence = {
    status: "MASTERV_POST_EXIT_1_UPGRADE_DRY_RUN_PASS",
    baseline_version: baselineVersion,
    candidate_version: candidateVersion,
    upgrade_transport: "nsis-in-place-dry-run",
    baseline_registry_version_verified: true,
    candidate_registry_version_verified: true,
    local_sqlite_database_path_stable: true,
    local_sqlite_survived_upgrade: true,
    fixture_cleaned: true,
    subscription_required: false,
    supabase_required: false,
    production_signature_exercised: false,
    production_release_published: false,
    final_uninstall: "PASS"
  };
  fs.writeFileSync(path.join(evidenceDir, "upgrade-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  if (baselineRuntime) await baselineRuntime.close().catch(() => undefined);
  if (candidateRuntime) await candidateRuntime.close().catch(() => undefined);
}
