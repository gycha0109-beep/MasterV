param(
  [ValidateSet('Run','Preflight')]
  [string]$Mode = 'Run',
  [string]$PackageRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$CandidatePath = Join-Path $PackageRoot 'PILOT-CANDIDATE.json'
$EvidencePath = Join-Path $PackageRoot 'MasterV-external-pilot-evidence.json'
$LogPath = Join-Path $PackageRoot 'MasterV-external-pilot-log.txt'

function Write-Evidence($Evidence) {
  $Evidence.updated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
  $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
}

function Read-YesNo([string]$Prompt) {
  while ($true) {
    $answer = (Read-Host "$Prompt [y/n]").Trim().ToLowerInvariant()
    if ($answer -in @('y','yes')) { return $true }
    if ($answer -in @('n','no')) { return $false }
    Write-Host 'Please enter y or n.'
  }
}

function Read-Choice([string]$Prompt, [string[]]$Choices) {
  Write-Host $Prompt
  for ($i = 0; $i -lt $Choices.Count; $i++) { Write-Host "  $($i + 1). $($Choices[$i])" }
  while ($true) {
    $raw = (Read-Host 'Choose a number').Trim()
    $number = 0
    if ([int]::TryParse($raw, [ref]$number) -and $number -ge 1 -and $number -le $Choices.Count) {
      return $Choices[$number - 1]
    }
    Write-Host 'Choose one of the listed numbers.'
  }
}

function Get-MasterVUninstallEntries {
  $paths = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  @(Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'MasterV' })
}

function Get-ExecutableFromCommand([string]$Command) {
  if ([string]::IsNullOrWhiteSpace($Command)) { return '' }
  $value = $Command.Trim()
  if ($value -match '^"([^"]+\.exe)"') { return $Matches[1] }
  if ($value -match '^([^\s]+\.exe)') { return $Matches[1] }
  return ''
}

function Find-MasterVBinary($RegistryEntry, [string]$Uninstaller) {
  $roots = New-Object System.Collections.Generic.List[string]
  if ($RegistryEntry.InstallLocation) { $roots.Add([string]$RegistryEntry.InstallLocation) }
  if ($Uninstaller) { $roots.Add((Split-Path -Parent $Uninstaller)) }
  if ($env:LOCALAPPDATA) { $roots.Add((Join-Path $env:LOCALAPPDATA 'MasterV')) }
  if ($env:ProgramFiles) { $roots.Add((Join-Path $env:ProgramFiles 'MasterV')) }
  foreach ($root in @($roots | Select-Object -Unique)) {
    if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
    $match = Get-ChildItem -LiteralPath $root -Filter 'masterv-desktop.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.FullName }
  }
  return ''
}

function Get-MasterVAutorunHits {
  $hits = @()
  foreach ($p in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\Microsoft\Windows\CurrentVersion\Run')) {
    if (-not (Test-Path $p)) { continue }
    $item = Get-ItemProperty $p
    foreach ($prop in $item.PSObject.Properties) {
      if ($prop.Name -notmatch '^PS' -and ("$($prop.Name) $($prop.Value)") -match '(?i)masterv') {
        $hits += "$($prop.Name)=$($prop.Value)"
      }
    }
  }
  @($hits)
}

function Get-MasterVServices {
  @((Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)masterv' -or $_.DisplayName -match '(?i)masterv' } | Select-Object -ExpandProperty Name))
}

function Get-MasterVTasks {
  try {
    @((Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match '(?i)masterv' -or $_.TaskPath -match '(?i)masterv' } | ForEach-Object { "$($_.TaskPath)$($_.TaskName)" }))
  } catch { @() }
}

if (-not (Test-Path -LiteralPath $CandidatePath)) { throw "Missing PILOT-CANDIDATE.json: $CandidatePath" }
$Candidate = Get-Content -LiteralPath $CandidatePath -Raw | ConvertFrom-Json
$InstallerPath = Join-Path $PackageRoot ([string]$Candidate.installer)
if (-not (Test-Path -LiteralPath $InstallerPath)) { throw "Missing pilot installer: $InstallerPath" }

$Evidence = [ordered]@{
  schema = 'masterv-external-windows-private-pilot-evidence-v1'
  status = 'MASTERV_EXTERNAL_PILOT_IN_PROGRESS'
  started_at_utc = (Get-Date).ToUniversalTime().ToString('o')
  updated_at_utc = $null
  candidate = [ordered]@{
    product = $Candidate.product
    version = $Candidate.version
    source_sha = $Candidate.candidate_source_sha
    checkout_sha = $Candidate.candidate_checkout_sha
    workflow_run_id = $Candidate.candidate_workflow_run_id
    artifact_id = $Candidate.candidate_artifact_id
    installer = $Candidate.installer
    expected_sha256 = $Candidate.installer_sha256
    expected_signature_status = $Candidate.signature_status
  }
  machine = [ordered]@{}
  preflight = [ordered]@{}
  observations = [ordered]@{}
  post_uninstall = [ordered]@{}
  classification = [ordered]@{
    package_quality = 'NOT_RUN'
    provider_health = 'NOT_RUN'
    release_blockers = @()
    pilot_verified = $false
    activation_allowed = $false
    background_batch_activation_allowed = $false
  }
  ux_notes = ''
  evidence_uploaded = $false
}

try { Start-Transcript -LiteralPath $LogPath -Force | Out-Null } catch {}
try {
  $os = $null
  try { $os = Get-CimInstance Win32_OperatingSystem } catch {}
  $Evidence.machine = [ordered]@{
    windows_caption = if ($os) { [string]$os.Caption } else { '' }
    windows_version = if ($os) { [string]$os.Version } else { [Environment]::OSVersion.Version.ToString() }
    windows_build = if ($os) { [string]$os.BuildNumber } else { [Environment]::OSVersion.Version.Build.ToString() }
    os_architecture = if ($os) { [string]$os.OSArchitecture } else { if ([Environment]::Is64BitOperatingSystem) { '64-bit' } else { '32-bit' } }
    process_architecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
  }

  $actualHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
  $signatureStatus = $signature.Status.ToString()
  $zone = $null
  try { $zone = Get-Item -LiteralPath $InstallerPath -Stream Zone.Identifier -ErrorAction SilentlyContinue } catch {}
  $existingEntries = @(Get-MasterVUninstallEntries)
  $baselineAutorun = @(Get-MasterVAutorunHits)
  $baselineServices = @(Get-MasterVServices)
  $baselineTasks = @(Get-MasterVTasks)

  $Evidence.preflight = [ordered]@{
    installer_sha256 = $actualHash
    sha256_match = ($actualHash -eq ([string]$Candidate.installer_sha256).ToLowerInvariant())
    signature_status = $signatureStatus
    signature_match = ($signatureStatus -eq [string]$Candidate.signature_status)
    mark_of_web_present = ($null -ne $zone)
    existing_masterv_installations = $existingEntries.Count
    baseline_autorun_hits = $baselineAutorun
    baseline_services = $baselineServices
    baseline_scheduled_tasks = $baselineTasks
  }

  $blockers = New-Object System.Collections.Generic.List[string]
  if (-not $Evidence.preflight.sha256_match) { $blockers.Add('installer_sha256_mismatch') }
  if (-not $Evidence.preflight.signature_match) { $blockers.Add('installer_signature_state_mismatch') }
  if ($existingEntries.Count -ne 0) { $blockers.Add('preexisting_masterv_installation') }
  if ($baselineAutorun.Count -ne 0 -or $baselineServices.Count -ne 0 -or $baselineTasks.Count -ne 0) { $blockers.Add('preexisting_masterv_os_residue') }
  $Evidence.classification.release_blockers = @($blockers)
  Write-Evidence $Evidence

  if ($blockers.Count -gt 0) {
    $Evidence.status = 'MASTERV_EXTERNAL_PILOT_PREFLIGHT_FAIL'
    $Evidence.classification.package_quality = 'FAIL'
    Write-Evidence $Evidence
    Write-Host "Preflight failed: $($blockers -join ', ')" -ForegroundColor Red
    exit 2
  }

  Write-Host 'MasterV external pilot preflight PASS.' -ForegroundColor Green
  Write-Host "Installer SHA256: $actualHash"
  Write-Host "Authenticode: $signatureStatus"
  Write-Host 'No username, computer name, IP address, or login credential is collected by this runner.'

  if ($Mode -eq 'Preflight') {
    $Evidence.status = 'MASTERV_EXTERNAL_PILOT_PREFLIGHT_PASS'
    $Evidence.classification.package_quality = 'PREFLIGHT_PASS'
    Write-Evidence $Evidence
    exit 0
  }

  Write-Host ''
  Write-Host 'The installer will now open. Do not disable Windows Security.' -ForegroundColor Cyan
  $installLaunchError = ''
  try {
    $installerProcess = Start-Process -FilePath $InstallerPath -PassThru -Wait
    $Evidence.observations.installer_exit_code = $installerProcess.ExitCode
  } catch {
    $installLaunchError = $_.Exception.Message
    $Evidence.observations.installer_launch_error = $installLaunchError
  }

  $Evidence.observations.windows_security_prompt = Read-Choice 'What happened when Windows launched the installer?' @(
    'none',
    'warning-then-run-anyway',
    'blocked-no-run-option',
    'other'
  )

  $installedEntries = @(Get-MasterVUninstallEntries)
  $installSucceeded = ($installedEntries.Count -ge 1)
  $Evidence.observations.install_registry_detected = $installSucceeded
  if (-not $installSucceeded) { $blockers.Add('install_failed_or_blocked') }
  if ($Evidence.observations.windows_security_prompt -eq 'blocked-no-run-option') { $blockers.Add('windows_security_hard_block') }

  if ($installSucceeded) {
    $entry = $installedEntries | Select-Object -First 1
    $uninstallCommand = if ($entry.QuietUninstallString) { [string]$entry.QuietUninstallString } else { [string]$entry.UninstallString }
    $uninstaller = Get-ExecutableFromCommand $uninstallCommand
    $binary = Find-MasterVBinary $entry $uninstaller
    $Evidence.observations.installed_binary_found = [bool]($binary -and (Test-Path -LiteralPath $binary))
    $Evidence.observations.uninstaller_found = [bool]($uninstaller -and (Test-Path -LiteralPath $uninstaller))
    if (-not $Evidence.observations.installed_binary_found) { $blockers.Add('installed_binary_not_found') }
    if (-not $Evidence.observations.uninstaller_found) { $blockers.Add('uninstaller_not_found') }

    if ($Evidence.observations.installed_binary_found) {
      $firstProcess = Start-Process -FilePath $binary -PassThru
      Start-Sleep -Seconds 3
      $Evidence.observations.first_launch_process_alive = (-not $firstProcess.HasExited)
      $Evidence.observations.first_launch_visible = Read-YesNo 'Did MasterV open normally and show the desktop UI?'
      $Evidence.observations.login_success = Read-YesNo 'Login inside MasterV: did authentication complete successfully?'
      $Evidence.observations.reference_library_success = Read-YesNo 'Did Reference Library open and behave normally?'
      $Evidence.observations.youtube_discovery_success = Read-YesNo 'Did YouTube Discovery return usable search results?'
      $Evidence.observations.deep_analysis = Read-Choice 'Deep Analysis result:' @('success','provider-rate-limit','provider-error','product-error','not-tested')
      $Evidence.observations.production_guidance = Read-Choice 'Production Guidance result:' @('success','provider-rate-limit','provider-error','product-error','not-tested')
      $Evidence.ux_notes = (Read-Host 'Optional one-line UX/problem note (press Enter for none)')
      if (-not $Evidence.observations.first_launch_visible) { $blockers.Add('first_launch_failed') }
      if (-not $Evidence.observations.login_success) { $blockers.Add('login_failed') }
      if (-not $Evidence.observations.reference_library_success) { $blockers.Add('reference_library_failed') }
      if (-not $Evidence.observations.youtube_discovery_success) { $blockers.Add('youtube_discovery_failed') }
      if ($Evidence.observations.deep_analysis -eq 'product-error') { $blockers.Add('deep_analysis_product_error') }
      if ($Evidence.observations.production_guidance -eq 'product-error') { $blockers.Add('production_guidance_product_error') }

      Read-Host 'Close MasterV completely, then press Enter to test process restart'
      Start-Sleep -Seconds 1
      $restartProcess = Start-Process -FilePath $binary -PassThru
      Start-Sleep -Seconds 3
      $Evidence.observations.restart_signed_out = Read-YesNo 'After restarting the app, was MasterV SIGNED OUT as expected?'
      $Evidence.observations.explicit_logout_success = Read-YesNo 'Log in again and use Logout: did MasterV return to SIGNED OUT correctly?'
      if (-not $Evidence.observations.restart_signed_out) { $blockers.Add('restart_session_behavior_failed') }
      if (-not $Evidence.observations.explicit_logout_success) { $blockers.Add('explicit_logout_failed') }
      Read-Host 'Close MasterV completely, then press Enter to continue to uninstall'
    }

    if ($Evidence.observations.uninstaller_found) {
      Write-Host 'The normal MasterV uninstaller will now open.' -ForegroundColor Cyan
      try {
        $uninstallProcess = Start-Process -FilePath $uninstaller -PassThru -Wait
        $Evidence.observations.uninstaller_exit_code = $uninstallProcess.ExitCode
      } catch {
        $Evidence.observations.uninstaller_launch_error = $_.Exception.Message
      }
    }

    $deadline = (Get-Date).AddSeconds(45)
    do {
      $remainingEntries = @(Get-MasterVUninstallEntries)
      $binaryExists = [bool]($binary -and (Test-Path -LiteralPath $binary))
      if ($remainingEntries.Count -eq 0 -and -not $binaryExists) { break }
      Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    $remainingEntries = @(Get-MasterVUninstallEntries)
    $binaryExists = [bool]($binary -and (Test-Path -LiteralPath $binary))
    $installDir = if ($binary) { Split-Path -Parent $binary } else { '' }
    $residualFiles = @()
    if ($installDir -and (Test-Path -LiteralPath $installDir)) {
      $residualFiles = @(Get-ChildItem -LiteralPath $installDir -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    }
    $autorunAfter = @(Get-MasterVAutorunHits)
    $servicesAfter = @(Get-MasterVServices)
    $tasksAfter = @(Get-MasterVTasks)

    $Evidence.post_uninstall = [ordered]@{
      uninstall_registry_entries = $remainingEntries.Count
      installed_binary_exists = $binaryExists
      install_directory_residual_files = $residualFiles
      autorun_hits = $autorunAfter
      services = $servicesAfter
      scheduled_tasks = $tasksAfter
    }
    if ($remainingEntries.Count -ne 0) { $blockers.Add('uninstall_registry_residue') }
    if ($binaryExists) { $blockers.Add('installed_binary_residue') }
    if ($residualFiles.Count -ne 0) { $blockers.Add('install_directory_residue') }
    if ($autorunAfter.Count -ne 0) { $blockers.Add('autorun_residue') }
    if ($servicesAfter.Count -ne 0) { $blockers.Add('service_residue') }
    if ($tasksAfter.Count -ne 0) { $blockers.Add('scheduled_task_residue') }
  }

  $providerHealth = 'NOT_TESTED'
  $deep = [string]$Evidence.observations.deep_analysis
  $guidance = [string]$Evidence.observations.production_guidance
  if ($deep -eq 'success' -and $guidance -eq 'success') { $providerHealth = 'GREEN' }
  elseif ($deep -in @('provider-rate-limit','provider-error') -or $guidance -in @('provider-rate-limit','provider-error')) { $providerHealth = 'BLOCKED' }
  elseif ($deep -eq 'product-error' -or $guidance -eq 'product-error') { $providerHealth = 'PRODUCT_ERROR' }

  $uniqueBlockers = @($blockers | Select-Object -Unique)
  $packageQuality = if ($uniqueBlockers.Count -eq 0) { 'PASS' } else { 'FAIL' }
  $pilotVerified = ($packageQuality -eq 'PASS' -and $providerHealth -eq 'GREEN')
  $status = if ($pilotVerified) {
    'MASTERV_EXTERNAL_PILOT_PASS'
  } elseif ($packageQuality -eq 'PASS' -and $providerHealth -eq 'BLOCKED') {
    'MASTERV_EXTERNAL_PILOT_PROVIDER_BLOCKED'
  } else {
    'MASTERV_EXTERNAL_PILOT_FAIL'
  }

  $Evidence.status = $status
  $Evidence.classification = [ordered]@{
    package_quality = $packageQuality
    provider_health = $providerHealth
    release_blockers = $uniqueBlockers
    pilot_verified = $pilotVerified
    activation_allowed = $false
    background_batch_activation_allowed = $false
  }
  Write-Evidence $Evidence

  Write-Host ''
  Write-Host "External pilot status: $status" -ForegroundColor $(if ($pilotVerified) { 'Green' } elseif ($packageQuality -eq 'PASS') { 'Yellow' } else { 'Red' })
  Write-Host "Evidence: $EvidencePath"
  Write-Host 'Evidence was NOT uploaded automatically.'
  if ($uniqueBlockers.Count -gt 0) { Write-Host "Release blockers: $($uniqueBlockers -join ', ')" -ForegroundColor Red }
  if ($pilotVerified) { exit 0 } else { exit 3 }
} finally {
  try { Stop-Transcript | Out-Null } catch {}
}
