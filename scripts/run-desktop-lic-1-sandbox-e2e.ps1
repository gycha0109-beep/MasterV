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
$forbiddenServerSecrets = @(
  'POLAR_ACCESS_TOKEN',
  'POLAR_ORGANIZATION_ID',
  'POLAR_AI_METER_ID',
  'GATEWAY_CREDENTIAL_SIGNING_SECRET',
  'GEMINI_API_KEY',
  'YOUTUBE_DATA_API_KEY',
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'
)
$originalPath = $env:Path
$originalCargoHome = $env:CARGO_HOME
$originalRustupHome = $env:RUSTUP_HOME

function Clear-MasterVSandboxEnvironment {
  foreach ($name in $managedEnvironment) {
    Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  }
}

function Assert-ProductKeyAbsent {
  if (-not [string]::IsNullOrWhiteSpace($env:MASTERV_SANDBOX_PRODUCT_KEY)) {
    throw 'MASTERV_SANDBOX_PRODUCT_KEY must not exist before the Desktop candidate build completes.'
  }
}

function Assert-ServerSecretsAbsent {
  foreach ($name in $forbiddenServerSecrets) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      throw "Sandbox Desktop E2E must not receive server/signing credential: $name"
    }
  }
}

function Invoke-ExternalChecked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit code $LASTEXITCODE)."
  }
}

function Get-MasterVWindowsArchitecture {
  $raw = if (-not [string]::IsNullOrWhiteSpace($env:PROCESSOR_ARCHITEW6432)) {
    $env:PROCESSOR_ARCHITEW6432
  }
  else {
    $env:PROCESSOR_ARCHITECTURE
  }

  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw 'Unsupported Windows architecture: <empty>'
  }

  switch ($raw.Trim().ToUpperInvariant()) {
    'AMD64' { return 'X64' }
    'ARM64' { return 'Arm64' }
    default { throw "Unsupported Windows architecture: $raw" }
  }
}

function Assert-WindowsNativeBuildTools {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
    throw 'MV-DESKTOP-LIC-1 prerequisite missing: Visual Studio Build Tools with Desktop development with C++ and a Windows 10/11 SDK.'
  }

  $installationPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($installationPath)) {
    throw 'MV-DESKTOP-LIC-1 prerequisite missing: Visual Studio Build Tools with Desktop development with C++ and a Windows 10/11 SDK.'
  }

  $msvcRoot = Join-Path $installationPath 'VC\Tools\MSVC'
  $cl = @(Get-ChildItem -LiteralPath $msvcRoot -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'bin\Hostx64\x64\cl.exe' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
  $sdkLibRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Lib'
  $kernel32 = @(Get-ChildItem -Path (Join-Path $sdkLibRoot '*\um\x64\kernel32.lib') -File -ErrorAction SilentlyContinue)
  if ($cl.Count -eq 0 -or $kernel32.Count -eq 0) {
    throw 'MV-DESKTOP-LIC-1 prerequisite missing: Visual Studio Build Tools with Desktop development with C++ and a Windows 10/11 SDK.'
  }

  Write-Host "MSVC prerequisite: $installationPath"
}

function Get-NodeRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$RequiredVersion,
    [Parameter(Mandatory = $true)][string]$ToolCache
  )

  $systemNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
  if ($systemNode) {
    $systemVersion = (& $systemNode.Source --version).Trim().TrimStart('v')
    if ($LASTEXITCODE -eq 0 -and $systemVersion -eq $RequiredVersion) {
      return [pscustomobject]@{
        Node = $systemNode.Source
        Npm = Join-Path (Split-Path -Parent $systemNode.Source) 'npm.cmd'
        Source = 'system-exact'
      }
    }
  }

  $architecture = Get-MasterVWindowsArchitecture
  $nodeArchitecture = switch ($architecture) {
    'X64' { 'x64' }
    'Arm64' { 'arm64' }
    default { throw "MV-DESKTOP-LIC-1 prerequisite unsupported: Node $RequiredVersion bootstrap does not support Windows $architecture." }
  }
  $archiveName = "node-v$RequiredVersion-win-$nodeArchitecture.zip"
  $runtimeName = [IO.Path]::GetFileNameWithoutExtension($archiveName)
  $runtimeRoot = Join-Path $ToolCache $runtimeName
  $nodeCommand = Join-Path $runtimeRoot 'node.exe'
  $npmCommand = Join-Path $runtimeRoot 'npm.cmd'

  if (Test-Path -LiteralPath $nodeCommand -PathType Leaf) {
    $cachedVersion = (& $nodeCommand --version).Trim().TrimStart('v')
    if ($LASTEXITCODE -eq 0 -and $cachedVersion -eq $RequiredVersion -and (Test-Path -LiteralPath $npmCommand -PathType Leaf)) {
      return [pscustomobject]@{ Node = $nodeCommand; Npm = $npmCommand; Source = 'isolated-cache' }
    }
  }

  $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) "masterv-node-bootstrap-$PID"
  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
  try {
    $checksumFile = Join-Path $downloadRoot 'SHASUMS256.txt'
    $archiveFile = Join-Path $downloadRoot $archiveName
    $releaseRoot = "https://nodejs.org/dist/v$RequiredVersion"
    Invoke-WebRequest -UseBasicParsing -Uri "$releaseRoot/SHASUMS256.txt" -OutFile $checksumFile
    $checksumPattern = '^([0-9a-f]{64})\s+\*?{0}$' -f [Regex]::Escape($archiveName)
    $checksumMatch = Get-Content -LiteralPath $checksumFile | ForEach-Object { [Regex]::Match($_, $checksumPattern) } | Where-Object Success | Select-Object -First 1
    if (-not $checksumMatch) {
      throw "Node release checksum does not contain $archiveName."
    }
    Invoke-WebRequest -UseBasicParsing -Uri "$releaseRoot/$archiveName" -OutFile $archiveFile
    $actualChecksum = (Get-FileHash -LiteralPath $archiveFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualChecksum -ne $checksumMatch.Groups[1].Value.ToLowerInvariant()) {
      throw "Node $RequiredVersion archive checksum verification failed."
    }

    $extractRoot = Join-Path $downloadRoot 'extract'
    Expand-Archive -LiteralPath $archiveFile -DestinationPath $extractRoot
    $extractedRuntime = Join-Path $extractRoot $runtimeName
    if (-not (Test-Path -LiteralPath (Join-Path $extractedRuntime 'node.exe') -PathType Leaf)) {
      throw "Node $RequiredVersion archive did not contain node.exe."
    }
    New-Item -ItemType Directory -Path $ToolCache -Force | Out-Null
    if (Test-Path -LiteralPath $runtimeRoot) {
      Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
    }
    Move-Item -LiteralPath $extractedRuntime -Destination $runtimeRoot
  }
  catch {
    throw "MV-DESKTOP-LIC-1 Node prerequisite failed: exact Node $RequiredVersion was unavailable and the verified isolated bootstrap failed. $($_.Exception.Message)"
  }
  finally {
    if (Test-Path -LiteralPath $downloadRoot) {
      Remove-Item -LiteralPath $downloadRoot -Recurse -Force
    }
  }

  return [pscustomobject]@{ Node = $nodeCommand; Npm = $npmCommand; Source = 'isolated-bootstrap' }
}

function Ensure-ProjectDependencies {
  param(
    [Parameter(Mandatory = $true)][string]$NpmCommand,
    [Parameter(Mandatory = $true)][string]$RequiredTauriVersion
  )

  $tauriPackage = Join-Path $repoRoot 'node_modules\@tauri-apps\cli\package.json'
  $tauriCommand = Join-Path $repoRoot 'node_modules\.bin\tauri.cmd'
  $dependenciesReady = $false
  if ((Test-Path -LiteralPath $tauriPackage -PathType Leaf) -and (Test-Path -LiteralPath $tauriCommand -PathType Leaf)) {
    try {
      $installedTauri = (Get-Content -Raw -LiteralPath $tauriPackage | ConvertFrom-Json).version
      $dependenciesReady = $installedTauri -eq $RequiredTauriVersion
    }
    catch {
      $dependenciesReady = $false
    }
  }

  if (-not $dependenciesReady) {
    Assert-ProductKeyAbsent
    Invoke-ExternalChecked -Command $NpmCommand -Arguments @('ci') -FailureMessage 'MV-DESKTOP-LIC-1 dependency prerequisite failed: npm ci could not materialize the locked project dependencies'
  }

  if (-not (Test-Path -LiteralPath $tauriCommand -PathType Leaf)) {
    throw 'MV-DESKTOP-LIC-1 Tauri prerequisite failed: local Tauri CLI is missing after npm ci.'
  }
  $tauriVersion = (& $tauriCommand --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $tauriVersion -notmatch "(^|\s)$([Regex]::Escape($RequiredTauriVersion))(\s|$)") {
    throw "MV-DESKTOP-LIC-1 Tauri prerequisite failed: expected local Tauri CLI $RequiredTauriVersion, observed '$tauriVersion'."
  }
}

function Ensure-RustToolchain {
  param(
    [Parameter(Mandatory = $true)][string]$RequiredVersion,
    [Parameter(Mandatory = $true)][string]$ToolCache
  )

  $rustup = Get-Command rustup.exe -CommandType Application -ErrorAction SilentlyContinue
  $source = 'system-rustup'
  if (-not $rustup) {
    $env:CARGO_HOME = Join-Path $ToolCache 'cargo-home'
    $env:RUSTUP_HOME = Join-Path $ToolCache 'rustup-home'
    $cargoBin = Join-Path $env:CARGO_HOME 'bin'
    $rustupCommand = Join-Path $cargoBin 'rustup.exe'
    $source = 'isolated-cache'
    if (-not (Test-Path -LiteralPath $rustupCommand -PathType Leaf)) {
      New-Item -ItemType Directory -Path $ToolCache -Force | Out-Null
      $rustupBootstrapRoot = Join-Path ([IO.Path]::GetTempPath()) "masterv-rustup-bootstrap-$PID"
      New-Item -ItemType Directory -Path $rustupBootstrapRoot -Force | Out-Null
      $rustupInit = Join-Path $rustupBootstrapRoot 'rustup-init.exe'
      $rustupChecksum = "$rustupInit.sha256"
      try {
        $architecture = Get-MasterVWindowsArchitecture
        $rustupTarget = switch ($architecture) {
          'X64' { 'x86_64-pc-windows-msvc' }
          'Arm64' { 'aarch64-pc-windows-msvc' }
          default { throw "Unsupported Windows architecture for rustup bootstrap: $architecture" }
        }
        $rustupUri = "https://static.rust-lang.org/rustup/dist/$rustupTarget/rustup-init.exe"
        Invoke-WebRequest -UseBasicParsing -Uri $rustupUri -OutFile $rustupInit
        Invoke-WebRequest -UseBasicParsing -Uri "$rustupUri.sha256" -OutFile $rustupChecksum
        $expectedRustupChecksum = (Get-Content -Raw -LiteralPath $rustupChecksum).Trim().Split()[0].ToLowerInvariant()
        $actualRustupChecksum = (Get-FileHash -LiteralPath $rustupInit -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expectedRustupChecksum -notmatch '^[0-9a-f]{64}$' -or $actualRustupChecksum -ne $expectedRustupChecksum) {
          throw 'rustup-init.exe SHA-256 verification failed.'
        }
        Invoke-ExternalChecked -Command $rustupInit -Arguments @('-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', 'none') -FailureMessage 'MV-DESKTOP-LIC-1 Rust prerequisite failed: isolated rustup bootstrap failed' | Out-Host
        $source = 'isolated-bootstrap'
      }
      catch {
        throw "MV-DESKTOP-LIC-1 Rust prerequisite failed: rustup was missing and the isolated user-scope bootstrap failed. $($_.Exception.Message)"
      }
      finally {
        if (Test-Path -LiteralPath $rustupBootstrapRoot) {
          Remove-Item -LiteralPath $rustupBootstrapRoot -Recurse -Force
        }
      }
    }
  }
  else {
    $rustupCommand = $rustup.Source
    $cargoBin = Split-Path -Parent $rustupCommand
  }

  $env:Path = "$cargoBin;$env:Path"
  $installedToolchains = (& $rustupCommand toolchain list) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw 'MV-DESKTOP-LIC-1 Rust prerequisite failed: rustup could not list installed toolchains.'
  }
  if ($installedToolchains -notmatch "(?m)^$([Regex]::Escape($RequiredVersion))(?:-|\s)") {
    Assert-ProductKeyAbsent
    Invoke-ExternalChecked -Command $rustupCommand -Arguments @('toolchain', 'install', $RequiredVersion, '--profile', 'minimal') -FailureMessage "MV-DESKTOP-LIC-1 Rust prerequisite failed: rustup could not install toolchain $RequiredVersion" | Out-Host
  }

  $rustcVersion = (& $rustupCommand run $RequiredVersion rustc --version).Trim()
  $cargoVersion = (& $rustupCommand run $RequiredVersion cargo --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $rustcVersion -notmatch "^rustc $([Regex]::Escape($RequiredVersion))(\s|$)" -or $cargoVersion -notmatch "^cargo $([Regex]::Escape($RequiredVersion))(\s|$)") {
    throw "MV-DESKTOP-LIC-1 Rust/Cargo prerequisite failed: expected Rust/Cargo $RequiredVersion, observed '$rustcVersion' / '$cargoVersion'."
  }

  return $source
}

Push-Location $repoRoot
try {
  Clear-MasterVSandboxEnvironment
  Assert-ProductKeyAbsent
  Assert-ServerSecretsAbsent

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

  $requiredNodeVersion = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot '.node-version')).Trim()
  if ($requiredNodeVersion -notmatch '^24\.\d+\.\d+$') {
    throw 'MV-DESKTOP-LIC-1 Node authority is invalid: .node-version must contain an exact Node 24 version.'
  }
  $rustToolchain = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'rust-toolchain.toml')
  $requiredRustVersion = [Regex]::Match($rustToolchain, '(?m)^channel\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"\s*$').Groups[1].Value
  if ([string]::IsNullOrWhiteSpace($requiredRustVersion)) {
    throw 'MV-DESKTOP-LIC-1 Rust authority is invalid: rust-toolchain.toml must contain an exact channel.'
  }
  $requiredTauriVersion = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json).devDependencies.'@tauri-apps/cli'
  if ($requiredTauriVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'MV-DESKTOP-LIC-1 Tauri authority is invalid: @tauri-apps/cli must be exact-pinned.'
  }

  Assert-WindowsNativeBuildTools
  $toolCache = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MasterV\SandboxE2E\toolchains'
  $nodeRuntime = Get-NodeRuntime -RequiredVersion $requiredNodeVersion -ToolCache $toolCache
  if (-not (Test-Path -LiteralPath $nodeRuntime.Npm -PathType Leaf)) {
    throw "MV-DESKTOP-LIC-1 npm prerequisite failed: npm.cmd is missing beside exact Node $requiredNodeVersion."
  }
  $env:Path = "$(Split-Path -Parent $nodeRuntime.Node);$env:Path"
  Ensure-ProjectDependencies -NpmCommand $nodeRuntime.Npm -RequiredTauriVersion $requiredTauriVersion
  $rustSource = Ensure-RustToolchain -RequiredVersion $requiredRustVersion -ToolCache $toolCache

  Write-Host "Source SHA: $sourceSha"
  Write-Host "Sandbox Gateway: $normalizedGateway"
  Write-Host "Node prerequisite: $requiredNodeVersion ($($nodeRuntime.Source))"
  Write-Host "Tauri prerequisite: $requiredTauriVersion (project-local)"
  Write-Host "Rust/Cargo prerequisite: $requiredRustVersion ($rustSource)"
  Write-Host 'Building the Sandbox-bound Desktop candidate before Product Key input...'

  Assert-ProductKeyAbsent
  Assert-ServerSecretsAbsent
  $env:MASTERV_GATEWAY_BASE_URL = $normalizedGateway
  Invoke-ExternalChecked -Command $nodeRuntime.Npm -Arguments @('run', 'desktop:build') -FailureMessage 'MV-DESKTOP-LIC-1 Desktop candidate build failed'
  Remove-Item -Path 'Env:MASTERV_GATEWAY_BASE_URL' -ErrorAction SilentlyContinue
  Assert-ProductKeyAbsent

  $trackedStateAfterBuild = (& git status --porcelain --untracked-files=no) -join "`n"
  if ($LASTEXITCODE -ne 0 -or -not [string]::IsNullOrWhiteSpace($trackedStateAfterBuild)) {
    throw 'Desktop Sandbox build mutated tracked repository state.'
  }
  $appBinary = Join-Path $repoRoot 'src-tauri\target\release\masterv-desktop.exe'
  if (-not (Test-Path -LiteralPath $appBinary -PathType Leaf)) {
    throw "Desktop candidate binary missing after build: $appBinary"
  }

  Write-Host 'Desktop candidate build completed.'
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

  Invoke-ExternalChecked -Command $nodeRuntime.Node -Arguments @('scripts/desktop-lic-1-sandbox-e2e-windows.mjs') -FailureMessage 'Sandbox E2E failed'
}
finally {
  Clear-MasterVSandboxEnvironment
  $env:Path = $originalPath
  $env:CARGO_HOME = $originalCargoHome
  $env:RUSTUP_HOME = $originalRustupHome
  if (Get-Variable -Name productKey -Scope Local -ErrorAction SilentlyContinue) {
    $productKey = $null
  }
  if (Get-Variable -Name secureProductKey -Scope Local -ErrorAction SilentlyContinue) {
    $secureProductKey = $null
  }
  Pop-Location
}
