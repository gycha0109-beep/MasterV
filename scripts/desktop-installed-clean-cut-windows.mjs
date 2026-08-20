import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) { if (!condition) throw new Error(message); }
function ps(script, timeout = 90_000) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout, windowsHide: true });
  if (result.status !== 0) throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  return (result.stdout || "").trim();
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
function parseExecutable(command) {
  const value = String(command || "").trim();
  const quoted = value.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  return value.match(/^([^\s]+\.exe)/i)?.[1] || "";
}
function psLiteral(value) { return String(value).replace(/'/g, "''"); }

if (process.platform !== "win32") throw new Error("Installed clean-cut audit must run on Windows");
const tauriConfig = JSON.parse(fs.readFileSync(path.resolve("src-tauri", "tauri.conf.json"), "utf8"));
const productName = String(tauriConfig.productName || "").trim();
assert(productName, "Tauri productName is required");
const productNamePs = psLiteral(productName);

const bundleDir = path.resolve("src-tauri", "target", "release", "bundle", "nsis");
const installers = findFiles(bundleDir, (file) => /-setup\.exe$/i.test(file), 2);
assert(installers.length === 1, `Expected exactly one NSIS installer, found ${installers.length}: ${installers.join(", ")}`);
const installerPath = installers[0];
const install = spawnSync(installerPath, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
assert(install.status === 0, `NSIS silent install failed (${install.status}): ${install.stderr || install.stdout}`);

const registryJson = ps(`
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$entries = @(Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq '${productNamePs}' } | Select-Object DisplayName,InstallLocation,UninstallString,QuietUninstallString,PSPath,PSChildName)
if ($entries.Count -ne 1) { throw '${productNamePs} uninstall registry entry count: ' + $entries.Count }
$entries[0] | ConvertTo-Json -Compress
`);
const registry = JSON.parse(registryJson);
const uninstallCommand = registry.QuietUninstallString || registry.UninstallString || "";
const uninstallerPath = parseExecutable(uninstallCommand);
assert(uninstallerPath && fs.existsSync(uninstallerPath), `Uninstaller missing: ${uninstallCommand}`);

const roots = [registry.InstallLocation, path.dirname(uninstallerPath)].filter(Boolean);
const executables = [...new Set(roots.flatMap((root) => findFiles(root, (file) => /\.exe$/i.test(file), 3)))];
const appBinary = executables.find((file) => /masterv-desktop\.exe$/i.test(file)) || executables.find((file) => path.basename(file).toLowerCase() !== path.basename(uninstallerPath).toLowerCase());
assert(appBinary && fs.existsSync(appBinary), `Installed MasterV executable missing under ${roots.join(", ")}`);

const evidenceDir = path.resolve("artifacts", "desktop-installed-clean-cut");
fs.mkdirSync(evidenceDir, { recursive: true });
const runtime = spawnSync(process.execPath, ["scripts/desktop-windows-clean-cut-smoke.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, MASTERV_DESKTOP_APP_BINARY: appBinary, MASTERV_WINDOWS_EVIDENCE_DIR: evidenceDir },
  encoding: "utf8",
  timeout: 240_000,
  windowsHide: true
});
assert(runtime.status === 0, `Installed runtime smoke failed (${runtime.status}): ${runtime.stderr || runtime.stdout}`);

let uninstall;
if (registry.QuietUninstallString) {
  uninstall = spawnSync("cmd.exe", ["/d", "/s", "/c", registry.QuietUninstallString], { encoding: "utf8", timeout: 180_000, windowsHide: true });
} else {
  uninstall = spawnSync(uninstallerPath, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
}
assert(uninstall.status === 0, `Uninstall failed (${uninstall.status}): ${uninstall.stderr || uninstall.stdout}`);

const appBinaryPs = psLiteral(appBinary);
const cleanupState = JSON.parse(ps(`
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$deadline = (Get-Date).AddSeconds(45)
do {
  $exeExists = Test-Path -LiteralPath '${appBinaryPs}'
  $registryCount = @(
    Get-ItemProperty $paths -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq '${productNamePs}' }
  ).Count
  if (-not $exeExists -and $registryCount -eq 0) { break }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
[ordered]@{
  executable_exists = [bool](Test-Path -LiteralPath '${appBinaryPs}')
  registry_count = [int]@(
    Get-ItemProperty $paths -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq '${productNamePs}' }
  ).Count
} | ConvertTo-Json -Compress
`, 60_000));

assert(cleanupState.executable_exists === false, `Installed executable remains after bounded uninstall wait: ${appBinary}`);
assert(cleanupState.registry_count === 0, `Uninstall registry residue remains after bounded wait: ${cleanupState.registry_count}`);

const evidence = {
  status: "MASTERV_INSTALLED_EXIT_3_CLEAN_CUT_PASS",
  installer: path.basename(installerPath),
  installed_runtime: "PASS",
  uninstall: "PASS",
  uninstall_wait_seconds_max: 45,
  executable_removed: true,
  uninstall_registry_removed: true
};
fs.writeFileSync(path.join(evidenceDir, "installed-evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
