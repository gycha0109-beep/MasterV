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
  assert(uninstallRegistryEntries().length === 0, "Existing MasterV installation could not be removed from the ephemeral pilot runner");
}

function cleanupEphemeralLocalState() {
  const localAppData = process.env.LOCALAPPDATA?.trim() || "";
  assert(localAppData, "LOCALAPPDATA is required for Windows first-run acceptance");
  const appDataDir = path.join(localAppData, identifier);
  fs.rmSync(appDataDir, { recursive: true, force: true });
  return appDataDir;
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

async function uiState(runtime) {
  return await execute(runtime.driverPort, runtime.sessionId, `return {
    href: location.href,
    readyState: document.readyState,
    surface: window.MASTERV_DESKTOP_CONFIG?.surface || '',
    stage: window.MASTERV_DESKTOP_CONFIG?.architecture_stage || '',
    releaseTrack: window.MASTERV_DESKTOP_CONFIG?.release_track || '',
    auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
    api: document.querySelector('#api-status')?.textContent?.trim() || '',
    workspace: document.querySelector('#library-workspace')?.textContent?.trim() || '',
    libraryStatus: document.querySelector('#library-status')?.textContent?.trim() || '',
    activationForm: Boolean(document.querySelector('#activation-form')),
    productKeyInput: Boolean(document.querySelector('#product-key')),
    productKeyValue: document.querySelector('#product-key')?.value || '',
    loginForm: Boolean(document.querySelector('#login-form')),
    legacyMigrationForm: Boolean(document.querySelector('#legacy-migration-form')),
    discoveryHidden: document.querySelector('#discovery-panel')?.hidden === true,
    updaterPanel: Boolean(document.querySelector('#desktop-updater-panel')),
    updaterStatus: document.querySelector('#desktop-updater-status')?.textContent?.trim() || '',
    updaterNotes: document.querySelector('#desktop-updater-notes')?.textContent?.trim() || '',
    updaterSubscriptionIndependent: document.querySelector('#desktop-updater-panel')?.dataset?.subscriptionIndependent || '',
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    sourceIds: Array.from(document.querySelectorAll('[data-source-id]')).map((node) => node.dataset.sourceId || ''),
    resources: performance.getEntriesByType('resource').map((entry) => entry.name)
  };`);
}

async function waitState(runtime, predicate, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await uiState(runtime);
    if (last?.updaterStatus === "확인 실패" || last?.updaterStatus === "설치 실패") {
      throw new Error(`${label} updater failure: ${last.updaterStatus}: ${last.updaterNotes}`);
    }
    if (predicate(last)) return last;
    await delay(350);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function invokeJson(runtime, command, args = {}) {
  const key = `pilot1${Math.random().toString(36).slice(2)}`;
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

const fixtureSuffix = `${process.env.GITHUB_RUN_ID || Date.now()}${process.pid}`.replace(/[^A-Za-z0-9_-]/g, "");
const sourceId = `yt:PILOT1${fixtureSuffix}`;
const record = {
  source_platform: "youtube",
  source_id: sourceId,
  native_id: sourceId.slice(3),
  canonical_url: `https://www.youtube.com/watch?v=${sourceId.slice(3)}`,
  label: `MV-PILOT-1 local fixture ${fixtureSuffix}`,
  analysis: {
    summary: "MV-PILOT-1 production first-run local fixture",
    structure_label: "hook → demo → CTA",
    duration_seconds: 12,
    hook: { type: "visual", text: "", visual: "synthetic", duration_seconds: 2 },
    product_presentation: { first_seen_seconds: 1, demonstration_present: true, before_after_present: false, comparison_present: false, result_visual_present: false, face_present: false, hand_present: true },
    persuasion: { problem: "", solution: "", benefit: "", proof: "", social_proof: "", offer: "", cta: "", emotional_trigger: "" },
    presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
    transcript: { full: "", segments: [] },
    scenes: [], observation_segments: [], tags: ["mv-pilot-1"], confidence_notes: ["Synthetic first-run local-only fixture"]
  },
  analysis_cache_key: `mv-pilot-1:${sourceId}`,
  analysis_provenance: "replay",
  schema_version: "reference-library-v1",
  first_saved_at: null,
  updated_at: null
};

async function main() {
  if (process.platform !== "win32") throw new Error("MV-PILOT-1 production first-run acceptance must run on Windows");
  for (const forbidden of [
    "GEMINI_API_KEY",
    "YOUTUBE_DATA_API_KEY",
    "POLAR_ACCESS_TOKEN",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  ]) {
    assert(!process.env[forbidden], `MV-PILOT-1 first-run acceptance must not receive credential: ${forbidden}`);
  }

  const manifestResponse = await fetch(latestEndpoint, { redirect: "follow", cache: "no-store" });
  assert(manifestResponse.ok, `Published latest.json is unavailable: ${manifestResponse.status} ${manifestResponse.statusText}`);
  const manifest = await manifestResponse.json();
  assert(manifest.version === releaseVersion, `Production baseline mismatch: expected ${releaseVersion}, got ${manifest.version}`);
  const platform = manifest.platforms?.["windows-x86_64"];
  assert(platform?.url === installerUrl, `Published v0.1.4 installer URL mismatch: ${platform?.url}`);
  assert(typeof platform?.signature === "string" && platform.signature.trim().length > 0, "Published v0.1.4 manifest signature is missing");

  const evidenceDir = path.resolve("artifacts", "desktop-pilot-1-first-run");
  fs.rmSync(evidenceDir, { recursive: true, force: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const downloadDir = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-pilot-1-${process.pid}`);
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  const installerPath = path.join(downloadDir, canonicalAsset);

  const installerResponse = await fetch(installerUrl, { redirect: "follow", cache: "no-store" });
  assert(installerResponse.ok, `Published v0.1.4 installer is unavailable: ${installerResponse.status} ${installerResponse.statusText}`);
  const installerBytes = Buffer.from(await installerResponse.arrayBuffer());
  assert(installerBytes.length > 0, "Published v0.1.4 installer is empty");
  fs.writeFileSync(installerPath, installerBytes);

  await cleanupInstalledProduct();
  const cleanLocalDataDir = cleanupEphemeralLocalState();

  let first = null;
  let second = null;
  try {
    const install = spawnSync(installerPath, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
    assert(install.status === 0, `Published v0.1.4 install failed (${install.status}): ${install.stderr || install.stdout}`);
    const registry = await waitForInstalledVersion(releaseVersion);
    const appBinary = locateInstalledBinary(registry);

    const webviewDataDir = path.join(evidenceDir, `webview-${fixtureSuffix}`);
    first = await attachMasterV(appBinary, evidenceDir, "masterv-pilot-1-first-run", { dataDir: webviewDataDir, reuseDataDir: false });
    const fresh = await waitState(first, (value) =>
      value.href.startsWith("https://tauri.localhost/") &&
      value.readyState !== "loading" &&
      value.surface === "desktop" &&
      value.stage === "MV-EXIT-3-CLEAN-CUT" &&
      value.releaseTrack === releaseVersion &&
      value.auth === "LOCAL ONLY" &&
      value.api === "LOCAL ONLY" &&
      value.workspace === "local:masterv" &&
      value.libraryStatus === "READY / LOCAL" &&
      value.activationForm === true &&
      value.productKeyInput === true &&
      value.productKeyValue === "" &&
      value.loginForm === false &&
      value.legacyMigrationForm === false &&
      value.discoveryHidden === true &&
      value.updaterPanel === true &&
      value.updaterSubscriptionIndependent === "true" &&
      value.updaterStatus === "최신 버전",
      "published v0.1.4 fresh first-run"
    );

    assert(fresh.localKeys.length === 0, `Fresh first-run localStorage is not empty: ${fresh.localKeys.join(", ")}`);
    assert(fresh.sessionKeys.length === 0, `Fresh first-run sessionStorage is not empty: ${fresh.sessionKeys.join(", ")}`);
    assert(fresh.sourceIds.length === 0, `Fresh first-run Reference Library is not empty: ${fresh.sourceIds.join(", ")}`);
    const externalResources = fresh.resources.filter((url) => /^https?:\/\//i.test(url) && !/^https:\/\/tauri\.localhost/i.test(url));
    assert(externalResources.length === 0, `Fresh Desktop WebView emitted external resource requests: ${externalResources.join(", ")}`);

    const secureStore = await invokeJson(first, "desktop_device_secure_store_status");
    assert(secureStore?.available === true, "Windows DPAPI secure store is unavailable");
    assert(secureStore?.backend === "windows-dpapi", `Unexpected secure-store backend: ${secureStore?.backend}`);
    assert(secureStore?.record_present === false, "Fresh first-run unexpectedly has a persisted device credential");
    assert(secureStore?.product_key_stored === false, "Product Key must never be persisted in device secure storage");
    assert(secureStore?.session_credential_stored === false, "Short-lived session credential must remain memory-only");

    const persistence = await invokeJson(first, "desktop_local_persistence_status");
    assert(persistence?.local_sqlite_authority_active === true, "Local SQLite authority is not active on first run");
    assert(persistence?.remote_fallback_available === false, "Fresh first-run must not expose a remote work-data fallback");
    assert(persistence?.workspace_id === "local:masterv", `Unexpected local workspace: ${persistence?.workspace_id}`);
    assert(String(persistence?.database_path || "").toLowerCase().endsWith("masterv.db"), `Unexpected Local SQLite path: ${persistence?.database_path}`);
    assert(String(persistence?.database_path || "").toLowerCase().startsWith(cleanLocalDataDir.toLowerCase()), `Local SQLite escaped app-local-data authority: ${persistence?.database_path}`);

    await invokeJson(first, "desktop_local_reference_upsert", { input: record });
    await execute(first.driverPort, first.sessionId, `document.querySelector('#library-refresh')?.click(); return true;`);
    await waitState(first, (value) => value.sourceIds.includes(sourceId), "pre-activation Local SQLite write visibility");
    await first.close();
    first = null;

    second = await attachMasterV(appBinary, evidenceDir, "masterv-pilot-1-restart", { dataDir: webviewDataDir, reuseDataDir: true });
    const restarted = await waitState(second, (value) =>
      value.releaseTrack === releaseVersion &&
      value.auth === "LOCAL ONLY" &&
      value.libraryStatus === "READY / LOCAL" &&
      value.sourceIds.includes(sourceId) &&
      value.updaterStatus === "최신 버전",
      "published v0.1.4 local-only restart"
    );
    assert(restarted.localKeys.length === 0 && restarted.sessionKeys.length === 0, "Restart introduced browser credential persistence");

    const restartedStore = await invokeJson(second, "desktop_device_secure_store_status");
    assert(restartedStore?.record_present === false, "No-activation restart unexpectedly persisted a device credential");
    await invokeJson(second, "desktop_local_reference_delete", { sourceId });
    await execute(second.driverPort, second.sessionId, `document.querySelector('#library-refresh')?.click(); return true;`);
    await waitState(second, (value) => !value.sourceIds.includes(sourceId), "MV-PILOT-1 local fixture cleanup");

    const evidence = {
      status: "MASTERV_PILOT_1_PRODUCTION_FIRST_RUN_ACCEPTANCE_PASS",
      source_authority: "PUBLISHED_GITHUB_RELEASE",
      production_version: releaseVersion,
      release_tag: releaseTag,
      latest_endpoint: latestEndpoint,
      installer_url: installerUrl,
      manifest_signature_present: true,
      installed_registry_version: String(registry.DisplayVersion || "").trim(),
      fresh_install: true,
      first_run_auth_state: "LOCAL_ONLY",
      product_key_activation_surface: true,
      product_key_submitted: false,
      device_credential_present_before_activation: false,
      secure_store_backend: "windows-dpapi",
      product_key_persisted: false,
      session_credential_persisted: false,
      local_sqlite_authority: true,
      local_data_available_before_activation: true,
      local_sqlite_restart_persistence: true,
      remote_work_data_fallback: false,
      login_surface_present: false,
      legacy_migration_surface_present: false,
      browser_persistent_auth_storage: false,
      updater_panel_present: true,
      updater_subscription_independent: true,
      updater_state: "LATEST",
      fresh_webview_external_resource_requests: 0,
      application_credentials_used: false,
      signing_credentials_used: false,
      polar_mutation: false,
      release_mutation: false,
      external_human_pilot_executed: false
    };
    fs.writeFileSync(path.join(evidenceDir, "first-run-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    if (first) await first.close().catch(() => undefined);
    if (second) await second.close().catch(() => undefined);
    await cleanupInstalledProduct().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
