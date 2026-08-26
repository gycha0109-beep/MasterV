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
  "if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw ('Expected Windows PowerShell 5.1, observed {0}' -f $PSVersionTable.PSVersion) }",
  "$tokens=$null",
  "$errors=$null",
  "$ast=[System.Management.Automation.Language.Parser]::ParseFile($env:MASTERV_SANDBOX_LAUNCHER_FILE,[ref]$tokens,[ref]$errors)",
  "if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
  "$functionAst=$ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-MasterVWindowsArchitecture' },$true)",
  "if ($null -eq $functionAst) { throw 'Architecture authority helper is missing' }",
  "Invoke-Expression $functionAst.Extent.Text",
  "$cases=@(@{ Wow64='AMD64'; Native='x86'; Expected='X64' },@{ Wow64=$null; Native='AMD64'; Expected='X64' },@{ Wow64=$null; Native='ARM64'; Expected='Arm64' })",
  "foreach ($case in $cases) { if ($null -eq $case.Wow64) { Remove-Item Env:PROCESSOR_ARCHITEW6432 -ErrorAction SilentlyContinue } else { $env:PROCESSOR_ARCHITEW6432=$case.Wow64 }; $env:PROCESSOR_ARCHITECTURE=$case.Native; $actual=Get-MasterVWindowsArchitecture; if ($actual -ne $case.Expected) { throw ('Architecture mismatch: expected {0}, observed {1}' -f $case.Expected,$actual) } }",
  "Remove-Item Env:PROCESSOR_ARCHITEW6432 -ErrorAction SilentlyContinue",
  "$env:PROCESSOR_ARCHITECTURE='x86'",
  "$unsupported=$false",
  "try { Get-MasterVWindowsArchitecture | Out-Null } catch { $unsupported=$_.Exception.Message -eq 'Unsupported Windows architecture: x86' }",
  "if (-not $unsupported) { throw 'Unsupported architecture did not fail closed' }"
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
  powershell_version: "5.1",
  architecture_authority_verified: true,
  architecture_cases: ["wow64-amd64", "native-amd64", "native-arm64", "unsupported-x86"],
  product_key_supplied: false,
  external_activation_executed: false
}));
