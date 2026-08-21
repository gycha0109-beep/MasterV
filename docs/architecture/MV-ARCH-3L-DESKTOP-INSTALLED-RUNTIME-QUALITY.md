# MV-ARCH-3L — Desktop Installed Runtime Quality Validation & Provider Health Isolation

Status: **QUALITY_VALIDATED / PROVIDER_HEALTH_BLOCKED / NOT ACTIVATED**

## 1. Scope

MV-ARCH-3L validates the deterministic Windows installer produced after MV-ARCH-3K as an actually installed application rather than treating the build-tree executable as sufficient release-candidate evidence.

The stage answers two separate questions:

1. Does the unsigned NSIS candidate install, run, preserve the established Desktop security/runtime boundaries, restart safely, and uninstall cleanly?
2. Is the external Gemini provider currently healthy enough for the already-verified 3H/3I live workflows?

Those outcomes are deliberately separated. External quota exhaustion is not converted into a false product-quality regression, and it is also not hidden as a green provider result.

3L does **not** sign, publish, release, merge, activate, add an updater, or open the MV-ARCH-3J Background Batch provider gate.

## 2. Installed-binary authority

The Windows runtime launcher now supports an explicit installed executable authority through:

```text
MASTERV_DESKTOP_APP_BINARY
```

When that path exists, existing native WebView2 regressions run against the installed executable. After uninstall removes that path, the launcher safely falls back to the normal build-tree executable for the separate provider-health observation.

The same launcher can reuse an explicit WebView2 data directory. 3L uses that only to prove that authentication is not persisted across process restart even when the browser profile itself is reused.

## 3. Installer and credential audit

3L executes the exact unsigned NSIS artifact produced by the deterministic 3K build with silent install mode.

The installed candidate from authoritative code-head run #804 was:

```text
installer:
  src-tauri/target/release/bundle/nsis/MasterV_0.1.0_x64-setup.exe
  SHA256 = 0c3e191dc51a1ab6da67401aa7aa03f32db23d4bfb895a70bb2ac8881dcd65e4

installed executable:
  C:\Users\runneradmin\AppData\Local\MasterV\masterv-desktop.exe
  SHA256 = 5dca46b1c3cc4c1e2ff1c03548d9ce63b59ef4111e379e6ee1b0ea07ab19011d
```

The installer and installed executable were scanned for both forbidden credential identifiers and the actual CI test credential values.

Verified absent:

```text
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_TEST_EMAIL
SUPABASE_TEST_PASSWORD
TAURI_SIGNING_PRIVATE_KEY
actual CI test email value
actual CI test password value
```

The installed candidate also created no MasterV autorun entry, Windows service, or scheduled task.

Verified marker:

```text
MASTERV_WINDOWS_INSTALLED_PREPARE_PASS
```

## 4. Installed deterministic surface regressions

After installation, the same existing native WebView2 smoke harnesses were executed with the installed executable as the process authority.

The installed candidate passed:

```text
MV-ARCH-3E Reference Detail / Compare
MV-ARCH-3F Canonical Reference Compiler / Evidence
MV-ARCH-3G Hosted YouTube Discovery
MV-ARCH-3J Guarded Background Batch boundary
```

Important preserved invariants included:

```text
3F:
  client_hosted_function_delta = 1
  evidence_rule_count          = 11
  raw analysis client fetch    = false

3G:
  candidate_count              = 12
  server youtube_api_requests  = 2
  client_youtube_api_delta     = 0
  client_hosted_function_delta = 1
  gemini_requests              = 0

3J:
  provider_precondition_confirmed = false
  live_batch_verified             = false
  desktop_submit_enabled          = false
  batch_submit_requests           = 0
  batch_create_attempts           = 0
  client_gemini_api_delta         = 0
  local_next_api_delta            = 0
```

The pre-install build-tree regressions for 3D, 3E, 3F, 3G, and 3J also passed in the same job before the NSIS candidate was created.

## 5. Restart and authentication persistence validation

3L performs an installed-runtime lifecycle that intentionally closes the first authenticated process **without logging out**.

Sequence:

```text
installed launch
-> login
-> authenticated hosted connection
-> close process without logout
-> restart installed executable with the same WebView2 profile
-> require SIGNED OUT
```

The second process was required to remain signed out and keep authenticated surfaces hidden.

The test also inspected `localStorage` and `sessionStorage` and rejected auth/session/token/Supabase persistence keys.

After the restart assertion, the test logs in again, performs an explicit logout, and requires the authenticated UI to clear.

Authoritative evidence:

```text
MASTERV_WINDOWS_INSTALLED_QUALITY_PASS
installed_launch                  = PASS
authenticated_runtime             = PASS
process_restart_without_logout    = PASS
restart_auth_status               = SIGNED OUT
persistent_auth_storage           = false
explicit_logout_clear             = true
direct_gemini_requests            = 0
direct_youtube_data_api_requests  = 0
local_next_api_requests            = 0
```

This preserves the established Desktop rule that the access token is process-memory state rather than durable browser/session storage.

## 6. Uninstall quality

The generated uninstaller is invoked in silent mode after the installed runtime checks.

NSIS cleanup was observed to be asynchronous: the installed executable could disappear slightly before the uninstall registry entry. 3L therefore uses bounded polling rather than weakening the cleanup requirement.

The final test requires both of the following within 60 seconds:

```text
installed executable absent
MasterV uninstall registry count = 0
```

Run #804 completed the cleanup in approximately:

```text
uninstall_cleanup_wait_ms = 2096
```

Final uninstall evidence:

```text
uninstall                         = PASS
installed_executable_removed      = true
uninstall_registry_removed        = true
autorun_residue                   = false
service_residue                   = false
scheduled_task_residue            = false
installer_created_directory       = absent
updater_created                    = false
```

No signing or activation occurred.

## 7. Product quality and provider health separation

Before 3L, a persistent Gemini HTTP 429 could make the entire Windows job red after deterministic Desktop/installer gates had already passed.

3L changes the authority model:

### Product-quality authority

Strict CI failure authority remains with deterministic checks such as:

```text
static contracts
locked dependency graph
native build
NSIS build
actual install
binary credential audit
installed runtime regressions
restart/session security
uninstall cleanup
3J blocked-state safety
```

Any failure in those checks still fails the workflow.

### Provider-health authority

The existing 3H/3I live Gemini checks run only after the installed product-quality gate.

Provider checks retain bounded retries and still return their real failure outcome, but `continue-on-error` prevents an external quota failure from rewriting a successful deterministic product-quality result into a product regression.

A final evidence record explicitly materializes either:

```text
PROVIDER_HEALTH_GREEN
```

or:

```text
PROVIDER_HEALTH_BLOCKED
```

Provider health does not authorize activation.

## 8. Authoritative code-head verification

Authoritative pre-document code head:

```text
78a72c5dc63d4cd7c96f542ef23d6df7e5ff6cda
```

CI:

```text
run ID     = 31913296365
run number = #804
event      = pull_request
conclusion = SUCCESS
```

The run metadata identifies head SHA `78a72c5dc63d4cd7c96f542ef23d6df7e5ff6cda` with base main `f819da2a6568534360adbd4ee4282d22f495b923`.

The actual GitHub pull-request checkout was the synthetic merge ref:

```text
d228f9153d9cc714db08b67fe87fa807e0b4a3f9
```

with log message:

```text
Merge 78a72c5dc63d4cd7c96f542ef23d6df7e5ff6cda into f819da2a6568534360adbd4ee4282d22f495b923
```

Do not collapse this into a raw-head checkout claim.

All three jobs finished successfully:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-quality  SUCCESS
```

## 9. Current provider health

The separate provider-health observation in #804 returned persistent Gemini quota errors for 3H:

```text
attempt 1: HTTP 429, retry hint 36s, waited 39s
attempt 2: HTTP 429, retry hint 43s, waited 46s
attempt 3: HTTP 429, retry hint 46s, provider check remained failed
```

Because the prerequisite 3H provider-health observation was blocked, the 3I provider-health observation was skipped rather than consuming another provider request chain.

Final provider record:

```text
status                 = PROVIDER_HEALTH_BLOCKED
deep_analysis          = failure
production_guidance    = skipped
product_quality_authority = separate
activation_allowed     = false
```

This does not retroactively downgrade the earlier successful 3H/3I runtime-verification evidence. It records current provider availability separately.

## 10. Runtime artifact

Run #804 uploaded:

```text
artifact ID = 9254333247
name        = masterv-windows-desktop-smoke
size        = 1,503,509 bytes
SHA256      = 5ee77f8e20c4f143fa6c18b220dc4af7178709531b886d9afa7686fd352fbedd
expired     = false
files       = 30
```

The artifact contains the unsigned installer plus installed-runtime quality and provider-health evidence.

## 11. Hosted/DB poststate

After #804, the live database was re-read independently.

Smoke fixture residue:

```text
MV3D prefix count = 0
MV3E prefix count = 0
MV3F prefix count = 0
background_batch_jobs = 0
```

The Background Batch gate remains unchanged:

```text
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
```

Thus 3L did not activate or weaken MV-ARCH-3J.

## 12. Verification corrections discovered in 3L

The 3L implementation exposed test-harness issues that were corrected without weakening product requirements.

### 12.1 3K ownership/name compatibility

The 3K determinism contract originally recognized the old live 3H CI step name only. 3L renamed that step to provider-health terminology while preserving installer-before-provider ordering.

The 3K contract was updated to recognize either name while retaining the same ordering invariant.

### 12.2 Windows smoke JavaScript parsing

PowerShell newline syntax embedded in JavaScript template literals caused a Node parse failure before installer behavior was tested.

The scripts now avoid that template-literal hazard, and the 3L static contract runs `node --check` against both Windows quality scripts before runtime CI.

### 12.3 Asynchronous NSIS registry cleanup

The first complete installed lifecycle showed the executable already removed while the uninstall registry entry remained briefly visible.

The final harness retains the strict registry-removal assertion but waits up to 60 seconds for the uninstaller's asynchronous cleanup to settle.

## 13. Lifecycle conclusion

MV-ARCH-3L is promoted to:

**QUALITY_VALIDATED / PROVIDER_HEALTH_BLOCKED / NOT ACTIVATED**

This promotion is justified because an actual unsigned NSIS installation was exercised through installed runtime, authentication, deterministic hosted-boundary regressions, process restart, session non-persistence, explicit logout, and uninstall cleanup, with credential/network isolation retained.

The current Gemini provider health remains blocked by quota and therefore does not permit activation.

3L does **not** authorize:

```text
code signing
certificate provisioning
GitHub Release publication
updater introduction
auto-update
PR Ready-for-review
PR merge
main activation
Desktop activation
MV-ARCH-3J provider gate activation
```

## 14. STOP boundary

3L stops after installed-runtime quality validation and provider-health classification.

Do not infer or begin MV-ARCH-3M without a separate instruction and fresh authority read.
