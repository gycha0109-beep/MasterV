# MV-ARCH-3P — External Windows Private Pilot

Status: **EXTERNAL_PILOT_PREPARATION / USER_EXECUTION_REQUIRED / NOT VERIFIED / NOT ACTIVATED**

## 1. Scope

MV-ARCH-3P validates the last gap left after MV-ARCH-3O: a real person receiving the exact private Windows package and using it on a non-CI Windows machine.

3O already proved deterministic private packaging plus install, authenticated runtime, restart/logout, uninstall, and residue cleanup on GitHub's Windows runner. 3P deliberately does not rebuild or replace that installer merely to add pilot tooling. It freezes the final 3O package as the external-pilot candidate and adds a local-only evidence runner around that exact binary.

The target transition is:

```text
EXTERNAL_PILOT_PREPARED
/ USER_EXECUTION_REQUIRED
/ NOT VERIFIED
/ NOT ACTIVATED

        external Windows run + returned evidence
                         ↓

EXTERNAL_PILOT_VERIFIED
/ PRIVATE_DISTRIBUTION_VALIDATED
/ NOT PUBLICLY RELEASED
/ NOT ACTIVATED
```

The second state must never be granted by CI alone.

## 2. Locked pilot candidate

3P is bound to the final docs-inclusive 3O private package:

```text
version                  = 0.1.0
3O source SHA            = 1eb6d16be87a7f0b67e5302cc96ad902e9a1ebf4
3O checkout SHA          = 271ad7c94ced34031947a9a2941a68eeeef28faf
base main SHA            = f819da2a6568534360adbd4ee4282d22f495b923
3O workflow run          = 31970170083 (#4)
3O artifact ID           = 9269631775
installer                = MasterV_0.1.0_x64-setup.exe
installer SHA256         = d85dae9d5d2a827fb86b3655c9a23821e1c15bb6712fa9d57e60831f6688fe25
Authenticode             = NotSigned
```

The machine-readable authority is:

```text
pilot/windows-private-v0.1.0/PILOT-CANDIDATE.json
```

Changing any of those values is a new pilot candidate, not a continuation of this run.

## 3. External pilot kit

3P adds a private local pilot kit:

```text
pilot/windows-private-v0.1.0/
├─ PILOT-CANDIDATE.json
├─ MasterV-External-Pilot.ps1
├─ START-EXTERNAL-PILOT.cmd
└─ PILOT-INSTRUCTIONS.txt
```

When handed to an operator, those files are placed beside the already verified 3O installer. The runner does not download or replace the installer.

## 4. Preflight authority

Before installation, the PowerShell runner proves:

```text
exact installer filename
exact SHA256 match
Authenticode state = NotSigned
Windows version/build/architecture observation
no pre-existing MasterV uninstall registration
no pre-existing MasterV autorun/service/scheduled-task residue
```

A SHA mismatch, signature-state mismatch, existing MasterV installation, or pre-existing MasterV OS residue terminates the pilot before installation and records a release blocker.

The runner also observes whether the downloaded installer has a Windows Mark-of-the-Web stream when available. It does not remove that stream or disable Windows Security.

## 5. Human-use sequence

The external pilot intentionally requires human observation for the parts CI cannot establish as real user experience:

```text
Windows security / SmartScreen behavior
installer interaction
first visible launch
login inside MasterV
Reference Library
YouTube Discovery
Deep Analysis
Production Guidance
close + process restart
expected SIGNED OUT state after restart
explicit logout
normal uninstaller interaction
```

The runner never asks for the MasterV password. Authentication is performed only inside the application.

## 6. Automated post-uninstall checks

After the normal uninstaller completes, the runner checks:

```text
MasterV uninstall registry entries
installed masterv-desktop.exe residue
installer-created directory residual files
MasterV autorun residue
MasterV Windows service residue
MasterV scheduled-task residue
```

These checks mirror the existing 3L/3O cleanup authority but are executed on the external Windows environment.

## 7. Provider-health separation

Deep Analysis and Production Guidance are recorded using explicit outcomes:

```text
success
provider-rate-limit
provider-error
product-error
not-tested
```

Classification remains separated:

- package/core failure -> release blocker / pilot fail
- provider rate limit or provider error with otherwise clean package quality -> `MASTERV_EXTERNAL_PILOT_PROVIDER_BLOCKED`
- product error in Deep Analysis or Production Guidance -> pilot fail
- both provider functions successful plus package/core pass -> `MASTERV_EXTERNAL_PILOT_PASS`

Provider availability does not activate Background Batch or Desktop production capability.

## 8. Privacy and upload boundary

The pilot runner intentionally does not collect:

```text
Windows username
computer name
IP address
hardware serial / device identifier
MasterV password
Supabase test credentials
Gemini key
YouTube key
service-role key
```

It records only coarse Windows version/architecture plus pilot observations needed to reproduce the result.

Evidence stays local as:

```text
MasterV-external-pilot-evidence.json
MasterV-external-pilot-log.txt
```

There is no automatic HTTP request, Drive upload, email send, GitHub upload, or telemetry path in the runner. The operator returns the JSON manually.

## 9. Readiness workflow boundary

3P adds:

```text
.github/workflows/desktop-external-pilot-readiness.yml
```

This workflow verifies only that the external-pilot kit is ready to be run. It:

```text
uses exact pinned checkout/setup-node/upload-artifact actions
uses Node 24.19.0
retains MV-ARCH-3K determinism authority
runs the 3P static contract
PowerShell parse-checks the external runner on windows-2025
records readiness evidence
```

It explicitly records:

```text
external_execution_performed = false
pilot_verified                = false
user_execution_required       = true
activation_allowed            = false
```

It does not build, install, launch, publish, sign, activate, or upload the MasterV installer.

## 10. Static contract

3P adds:

```text
scripts/desktop-external-pilot-contract.mjs
```

The contract binds the pilot tooling to the exact 3O candidate, prevents credential/network/publication authority from entering the external runner, ensures the readiness workflow cannot claim external verification, and requires the new workflow to remain inside the central 3K pinned-action authority.

Expected marker:

```text
MASTERV_DESKTOP_EXTERNAL_PILOT_CONTRACT_PASS
```

## 11. Explicitly not done

3P preparation does not perform or authorize:

```text
external Windows execution by CI
Google Drive upload
email sending
GitHub Release
Git tag
public download publication
Windows code signing
certificate/provider purchase
updater introduction
Desktop production activation
Background Batch activation
PR Ready-for-review
PR merge
main deployment
```

## 12. Completion rule

The stage remains **USER_EXECUTION_REQUIRED** until an evidence file from a real external Windows run is returned and reviewed against this contract.

CI success can establish only:

```text
EXTERNAL_PILOT_PREPARED
```

It cannot establish:

```text
EXTERNAL_PILOT_VERIFIED
```

The implementation/readiness run IDs and final lifecycle freeze will be appended only after repository verification succeeds. The real external pilot result will be appended only after the operator returns `MasterV-external-pilot-evidence.json`.
