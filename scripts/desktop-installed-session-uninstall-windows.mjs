import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, attachMasterV, delay, execute, required } from "./windows-webview2-attach.mjs";

async function waitState(native, predicate, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    last = await execute(native.driverPort, native.sessionId, `return {
      surface: document.querySelector('#surface-badge')?.textContent?.trim() || '',
      auth: document.querySelector('#auth-status')?.textContent?.trim() || '',
      api: document.querySelector('#api-status')?.textContent?.trim() || '',
      libraryHidden: Boolean(document.querySelector('#reference-library-panel')?.hidden),
      batchHidden: Boolean(document.querySelector('#background-batch-panel')?.hidden),
      localKeys: Object.keys(localStorage),
      sessionKeys: Object.keys(sessionStorage),
      resources: performance.getEntriesByType('resource').map(e => e.name)
    };`);
    if (predicate(last)) return last;
    await delay(400);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function login(native, email, password) {
  const clicked = await execute(native.driverPort, native.sessionId, `
    const e=document.querySelector('#email'),p=document.querySelector('#password'),b=document.querySelector('#login-button');
    if(!e||!p||!b)return false;e.value=arguments[0];p.value=arguments[1];b.click();return true;
  `, [email, password]);
  assert(clicked === true, "Installed Desktop login controls missing");
  return await waitState(native, (s) => s.auth === "AUTHENTICATED" && s.api === "CONNECTED", "installed Desktop authenticated state", 45_000);
}

function assertNoPersistentAuthKeys(state, phase) {
  const suspicious = [...state.localKeys, ...state.sessionKeys].filter((key) => /supabase|auth|token|session/i.test(key));
  assert(suspicious.length === 0, `${phase} persisted auth/session keys: ${suspicious.join(", ")}`);
}

function assertNetworkIsolation(resources, phase) {
  const forbidden = resources.filter((url) => /generativelanguage\.googleapis\.com|youtube\.googleapis\.com|127\.0\.0\.1:3000|localhost:3000/i.test(url));
  assert(forbidden.length === 0, `${phase} made forbidden direct/local requests: ${forbidden.join(", ")}`);
}

function powershell(script, timeout = 90_000) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout });
  if (result.status !== 0) throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  return (result.stdout || "").trim();
}

if (process.platform !== "win32") throw new Error("3L installed session/uninstall smoke must run on Windows");
const binary = required("MASTERV_DESKTOP_APP_BINARY");
const installDir = required("MASTERV_DESKTOP_INSTALL_DIR");
const uninstaller = required("MASTERV_DESKTOP_UNINSTALLER");
const email = required("SUPABASE_TEST_EMAIL");
const password = required("SUPABASE_TEST_PASSWORD");
assert(fs.existsSync(binary), `Installed MasterV binary missing before lifecycle test: ${binary}`);
assert(fs.existsSync(uninstaller), `MasterV uninstaller missing before lifecycle test: ${uninstaller}`);
assert(!process.env.GEMINI_API_KEY && !process.env.YOUTUBE_DATA_API_KEY, "Provider credentials must not be present in installed quality smoke");

const evidenceDir = path.resolve("artifacts", "desktop-installed-quality");
fs.mkdirSync(evidenceDir, { recursive: true });
const sharedDataDir = path.join(process.env.RUNNER_TEMP?.trim() || os.tmpdir(), `masterv-3l-persistence-${process.pid}`);
fs.rmSync(sharedDataDir, { recursive: true, force: true });

let first;
let second;
let firstState;
let restartState;
let logoutState;
try {
  first = await attachMasterV(binary, evidenceDir, "arch3l-installed-first", { dataDir: sharedDataDir, reuseDataDir: false });
  firstState = await login(first, email, password);
  assert(firstState.surface === "desktop", `Installed Desktop surface mismatch: ${firstState.surface}`);
  assertNoPersistentAuthKeys(firstState, "authenticated installed runtime");
  assertNetworkIsolation(firstState.resources, "authenticated installed runtime");
  await first.close();
  first = null;
  await delay(1200);

  second = await attachMasterV(binary, evidenceDir, "arch3l-installed-restart", { dataDir: sharedDataDir, reuseDataDir: true });
  restartState = await waitState(second, (s) => s.auth === "SIGNED OUT", "installed Desktop restart signed-out state", 20_000);
  assert(restartState.libraryHidden === true, "Reference Library must remain hidden after process restart without a session");
  assertNoPersistentAuthKeys(restartState, "restarted installed runtime");
  assertNetworkIsolation(restartState.resources, "restarted installed runtime");

  await login(second, email, password);
  await execute(second.driverPort, second.sessionId, "document.querySelector('#logout-button')?.click(); return true;");
  logoutState = await waitState(second, (s) => s.auth === "SIGNED OUT" && s.libraryHidden === true, "installed Desktop explicit logout", 15_000);
  assertNoPersistentAuthKeys(logoutState, "explicit logout");
  await second.close();
  second = null;
} finally {
  if (first) await first.close().catch(() => undefined);
  if (second) await second.close().catch(() => undefined);
}

const uninstallResult = spawnSync(uninstaller, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
assert(uninstallResult.status === 0, `MasterV silent uninstall failed (${uninstallResult.status}): ${uninstallResult.stderr || uninstallResult.stdout}`);

const deadline = Date.now() + 60_000;
while (Date.now() < deadline && fs.existsSync(binary)) await delay(1000);
assert(!fs.existsSync(binary), `Installed executable still exists after uninstall: ${binary}`);

const registryCount = Number(powershell(`
$paths=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
@((Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'MasterV' })).Count
`));
assert(registryCount === 0, `MasterV uninstall registry entry remains: ${registryCount}`);
const autorunAfter = powershell(`
$hits=@(); foreach($p in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')){if(Test-Path $p){$i=Get-ItemProperty $p;foreach($x in $i.PSObject.Properties){if($x.Name -notmatch '^PS' -and ("$($x.Name) $($x.Value)") -match '(?i)masterv'){$hits+="$($x.Name)=$($x.Value)"}}}}; $hits -join [Environment]::NewLine
`);
assert(!autorunAfter, `MasterV autorun residue remains after uninstall: ${autorunAfter}`);
const servicesAfter = powershell(`(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)masterv' -or $_.DisplayName -match '(?i)masterv' } | Select-Object -ExpandProperty Name) -join [Environment]::NewLine`);
assert(!servicesAfter, `MasterV service residue remains after uninstall: ${servicesAfter}`);
const tasksAfter = powershell(`(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match '(?i)masterv' -or $_.TaskPath -match '(?i)masterv' } | ForEach-Object { "$($_.TaskPath)$($_.TaskName)" }) -join [Environment]::NewLine`);
assert(!tasksAfter, `MasterV scheduled-task residue remains after uninstall: ${tasksAfter}`);

const installDirExists = fs.existsSync(installDir);
if (installDirExists) {
  const residualFiles = fs.readdirSync(installDir);
  assert(residualFiles.length === 0, `Installer-created directory contains residual files after uninstall: ${residualFiles.join(", ")}`);
}
fs.rmSync(sharedDataDir, { recursive: true, force: true });

const evidence = {
  status: "MASTERV_WINDOWS_INSTALLED_QUALITY_PASS",
  installed_launch: "PASS",
  authenticated_runtime: firstState?.auth === "AUTHENTICATED" ? "PASS" : "FAIL",
  process_restart_without_logout: "PASS",
  restart_auth_status: restartState?.auth || null,
  persistent_auth_storage: false,
  explicit_logout_clear: logoutState?.auth === "SIGNED OUT",
  direct_gemini_requests: 0,
  direct_youtube_data_api_requests: 0,
  local_next_api_requests: 0,
  uninstall: "PASS",
  installed_executable_removed: !fs.existsSync(binary),
  uninstall_registry_removed: registryCount === 0,
  autorun_residue: false,
  service_residue: false,
  scheduled_task_residue: false,
  installer_created_directory_present_after_uninstall: installDirExists,
  updater_created: false,
  activation: false
};
fs.writeFileSync(path.join(evidenceDir, "installed-quality-evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
