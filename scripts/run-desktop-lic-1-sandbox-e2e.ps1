[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://[A-Za-z0-9.-]+\.deno\.net/?$')]
  [string]$GatewayUrl,

  [switch]$AllowGuidanceCharge
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
  throw 'MV-DESKTOP-LIC-1 Sandbox E2E launcher must run on Windows.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$managedEnvironment = @(
  'MASTERV_GATEWAY_BASE_URL',
  'MASTERV_SANDBOX_E2E_SOURCE_SHA',
  'MASTERV_SANDBOX_E2E_EPHEMERAL_WINDOWS',
  'MASTERV_SANDBOX_E2E_ALLOW_NEW_ACTIVATION',
  'MASTERV_SANDBOX_E2E_ALLOW_GUIDANCE_CHARGE',
  'MASTERV_SANDBOX_PRODUCT_KEY'
)

function Clear-MasterVSandboxEnvironment {
  foreach ($name in $managedEnvironment) {
    Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  }
}

Push-Location $repoRoot
try {
  Clear-MasterVSandboxEnvironment

  $sourceSha = (& git rev-parse HEAD).Trim().ToLowerInvariant()
  if ($LASTEXITCODE -ne 0 -or $sourceSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not resolve an exact 40-character Git HEAD SHA.'
  }

  $trackedState = (& git status --porcelain --untracked-files=no) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not verify tracked working-tree state.'
  }
  if (-not [string]::IsNullOrWhiteSpace($trackedState)) {
    throw 'Sandbox E2E requires a clean tracked working tree.'
  }

  $normalizedGateway = $GatewayUrl.TrimEnd('/')
  $parsedGateway = [Uri]$normalizedGateway
  if ($parsedGateway.Scheme -ne 'https' -or -not $parsedGateway.Host.ToLowerInvariant().EndsWith('.deno.net')) {
    throw 'Sandbox Gateway must be an HTTPS *.deno.net root.'
  }
  if (-not [string]::IsNullOrWhiteSpace($parsedGateway.UserInfo) -or $parsedGateway.Port -ne 443 -or $parsedGateway.AbsolutePath -ne '/' -or -not [string]::IsNullOrWhiteSpace($parsedGateway.Query) -or -not [string]::IsNullOrWhiteSpace($parsedGateway.Fragment)) {
    throw 'Sandbox Gateway must not contain credentials, custom port, path, query, or fragment.'
  }

  Write-Host "Source SHA: $sourceSha"
  Write-Host "Sandbox Gateway: $normalizedGateway"
  Write-Host 'Product Key input is hidden and is not placed in the command line or shell history.'
  if ($AllowGuidanceCharge) {
    Write-Warning 'Guidance charge is enabled: the live Sandbox run is expected to consume exactly 1 BASIC credit.'
  }

  $secureProductKey = Read-Host 'Sandbox Product Key' -AsSecureString
  if ($secureProductKey.Length -eq 0) {
    throw 'Sandbox Product Key is required.'
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureProductKey)
  try {
    $productKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  if ([string]::IsNullOrWhiteSpace($productKey)) {
    throw 'Sandbox Product Key is required.'
  }

  $env:MASTERV_GATEWAY_BASE_URL = $normalizedGateway
  $env:MASTERV_SANDBOX_E2E_SOURCE_SHA = $sourceSha
  $env:MASTERV_SANDBOX_E2E_EPHEMERAL_WINDOWS = 'true'
  $env:MASTERV_SANDBOX_E2E_ALLOW_NEW_ACTIVATION = 'true'
  $env:MASTERV_SANDBOX_E2E_ALLOW_GUIDANCE_CHARGE = if ($AllowGuidanceCharge) { 'true' } else { 'false' }
  $env:MASTERV_SANDBOX_PRODUCT_KEY = $productKey
  $productKey = $null

  & npm.cmd run test:desktop-lic-1-sandbox-e2e
  $npmExitCode = $LASTEXITCODE
  if ($npmExitCode -ne 0) {
    throw "Sandbox E2E failed with npm exit code $npmExitCode."
  }
}
finally {
  Clear-MasterVSandboxEnvironment
  if (Get-Variable -Name productKey -Scope Local -ErrorAction SilentlyContinue) {
    $productKey = $null
  }
  if (Get-Variable -Name secureProductKey -Scope Local -ErrorAction SilentlyContinue) {
    $secureProductKey = $null
  }
  Pop-Location
}
