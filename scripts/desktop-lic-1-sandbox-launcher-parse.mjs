import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const launcherPath = path.resolve("scripts", "run-desktop-lic-1-sandbox-e2e.ps1");

if (process.platform !== "win32") {
  console.log(JSON.stringify({
    status: "MASTERV_DESKTOP_LIC_1_SANDBOX_LAUNCHER_PARSE_SKIP",
    reason: "windows-only-powershell-parser"
  }));
  process.exit(0);
}

const command = [
  "$ErrorActionPreference='Stop'",
  "$tokens=$null",
  "$errors=$null",
  "[System.Management.Automation.Language.Parser]::ParseFile($env:MASTERV_SANDBOX_LAUNCHER_FILE,[ref]$tokens,[ref]$errors) | Out-Null",
  "if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }"
].join("; ");

const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, MASTERV_SANDBOX_LAUNCHER_FILE: launcherPath }
});

assert.equal(result.status, 0, result.stderr || result.stdout || "PowerShell launcher parser failed");
console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_LIC_1_SANDBOX_LAUNCHER_PARSE_PASS",
  parser: "System.Management.Automation.Language.Parser",
  product_key_supplied: false,
  external_activation_executed: false
}));
