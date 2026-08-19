import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function ps(script, timeout = 60_000) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout });
  if (result.status !== 0) throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  return (result.stdout || "").trim();
}
function findFiles(root, predicate, depth = 3) {
  if (!root || !fs.existsSync(root) || depth < 0) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && predicate(full)) out.push(full);
    else if (entry.isDirectory()) out.push(...findFiles(full, predicate, depth - 1));
  }
  return out;
}
function containsText(buffer, text) {
  if (!text) return false;
  return buffer.indexOf(Buffer.from(text, "utf8")) >= 0 || buffer.indexOf(Buffer.from(text, "utf16le")) >= 0;
}
function scan(file, values) {
  const buffer = fs.readFileSync(file);
  return values.filter((value) => value && containsText(buffer, value));
}
function parseExecutable(command) {
  const value = String(command || "").trim();
  const quoted = value.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const bare = value.match(/^([^\s]+\.exe)/i);
  return bare?.[1] || "";
}

if (process.platform !== "win32") throw new Error("3L installer preparation must run on Windows");

const bundleDir = path.resolve("src-tauri", "target", "release", "bundle", "nsis");
const installers = findFiles(bundleDir, (file) => /-setup\.exe$/i.test(file), 1);
assert(installers.length === 1, `Expected exactly one NSIS installer, found ${installers.length}: ${installers.join(", ")}`);
const installerPath = installers[0];

const forbiddenIdentifiers = [
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY"
];
const secretValues = [process.env.SUPABASE_TEST_EMAIL, process.env.SUPABASE_TEST_PASSWORD].filter((v) => (v || "").length >= 6);
const installerHits = scan(installerPath, [...forbiddenIdentifiers, ...secretValues]);
assert(installerHits.length === 0, `Installer contains forbidden credential material: ${installerHits.join(", ")}`);

const installResult = spawnSync(installerPath, ["/S"], { encoding: "utf8", timeout: 180_000, windowsHide: true });
assert(installResult.status === 0, `NSIS silent install failed (${installResult.status}): ${installResult.stderr || installResult.stdout}`);

const registryJson = ps(`
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$entry = Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq 'MasterV' } |
  Select-Object -First 1 DisplayName,InstallLocation,UninstallString,QuietUninstallString,PSPath,PSChildName
if ($null -eq $entry) { throw 'MasterV uninstall registry entry not found after install' }
$entry | ConvertTo-Json -Compress
`);
const registry = JSON.parse(registryJson);
const uninstallCommand = registry.QuietUninstallString || registry.UninstallString || "";
const uninstallerPath = parseExecutable(uninstallCommand);
const uninstallKeyName = String(registry.PSChildName || "").trim();
assert(uninstallerPath && fs.existsSync(uninstallerPath), `MasterV uninstaller not found: ${uninstallerPath || uninstallCommand}`);
assert(uninstallKeyName.length > 0 && !/[\r\n]/.test(uninstallKeyName), `MasterV uninstall registry key is invalid: ${JSON.stringify(uninstallKeyName)}`);

const installRoots = [registry.InstallLocation, path.dirname(uninstallerPath), path.join(process.env.LOCALAPPDATA || "", "MasterV"), path.join(process.env.ProgramFiles || "", "MasterV")]
  .filter(Boolean)
  .map((p) => path.resolve(p));
let installedBinary = "";
for (const root of [...new Set(installRoots)]) {
  const matches = findFiles(root, (file) => path.basename(file).toLowerCase() === "masterv-desktop.exe", 4);
  if (matches.length) { installedBinary = path.resolve(matches[0]); break; }
}
assert(installedBinary && fs.existsSync(installedBinary), `Installed MasterV executable not found under: ${installRoots.join(", ")}`);
const installDir = path.dirname(installedBinary);

const installedHits = scan(installedBinary, [...forbiddenIdentifiers, ...secretValues]);
assert(installedHits.length === 0, `Installed executable contains forbidden credential material: ${installedHits.join(", ")}`);

const autorun = ps(`
$hits = @()
foreach ($p in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')) {
  if (Test-Path $p) {
    $item = Get-ItemProperty $p
    foreach ($prop in $item.PSObject.Properties) {
      if ($prop.Name -notmatch '^PS' -and ("$($prop.Name) $($prop.Value)") -match '(?i)masterv') { $hits += "$($prop.Name)=$($prop.Value)" }
    }
  }
}
$hits -join [Environment]::NewLine
`);
assert(!autorun, `Unexpected MasterV autorun entry: ${autorun}`);
const services = ps(`(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)masterv' -or $_.DisplayName -match '(?i)masterv' } | Select-Object -ExpandProperty Name) -join [Environment]::NewLine`);
assert(!services, `Unexpected MasterV service found: ${services}`);
const tasks = ps(`(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match '(?i)masterv' -or $_.TaskPath -match '(?i)masterv' } | ForEach-Object { "$($_.TaskPath)$($_.TaskName)" }) -join [Environment]::NewLine`);
assert(!tasks, `Unexpected MasterV scheduled task found: ${tasks}`);

const evidenceDir = path.resolve("artifacts", "desktop-installed-quality");
fs.mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  status: "MASTERV_WINDOWS_INSTALLED_PREPARE_PASS",
  installer_path: installerPath,
  installer_sha256: sha256(installerPath),
  installed_exe: installedBinary,
  installed_exe_sha256: sha256(installedBinary),
  install_dir: installDir,
  uninstaller: uninstallerPath,
  uninstall_key: uninstallKeyName,
  installer_forbidden_credential_hits: installerHits,
  installed_exe_forbidden_credential_hits: installedHits,
  autorun_entries: 0,
  services: 0,
  scheduled_tasks: 0,
  signing: false,
  updater: false,
  activation: false
};
fs.writeFileSync(path.join(evidenceDir, "install-evidence.json"), JSON.stringify(evidence, null, 2));

const githubEnv = process.env.GITHUB_ENV?.trim() || "";
assert(githubEnv, "GITHUB_ENV is required in CI so installed-binary authority persists across quality steps");
fs.appendFileSync(
  githubEnv,
  `MASTERV_DESKTOP_APP_BINARY=${installedBinary}\nMASTERV_DESKTOP_INSTALL_DIR=${installDir}\nMASTERV_DESKTOP_UNINSTALLER=${uninstallerPath}\nMASTERV_DESKTOP_UNINSTALL_KEY=${uninstallKeyName}\n`
);
console.log(JSON.stringify(evidence));
