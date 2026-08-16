# MV-ARCH-3N — Desktop Signing Integration Readiness

Status: **SIGNING_INTEGRATION_VERIFIED / SIGNING_PROVIDER_REQUIRED / PROVIDER_HEALTH_BLOCKED / NOT ACTIVATED**

## 1. Scope

MV-ARCH-3N validates the Windows code-signing integration boundary without selecting, provisioning, or consuming a real signing identity.

MV-ARCH-3M already established a formal unsigned Windows release-candidate path with exact source identity, locked dependency authority, explicit Authenticode `NotSigned` verification, credential isolation, and publication/activation gates held closed.

3N answers the next, narrower question:

> Can MasterV route every Windows/NSIS binary that Tauri expects to sign through one controlled `bundle.windows.signCommand` integration, prove that boundary on the real Windows bundler, and still fail closed before any provider credential, certificate, signature, publication, updater, or activation authority exists?

The answer is now yes.

3N does **not** authorize or perform:

```text
signing-provider selection
certificate purchase or provisioning
cloud signing account creation
signing credential installation
live Authenticode signing
signed installer production
git tag creation
GitHub Release publication
public installer distribution
PR Ready-for-review
PR merge
main activation
Desktop activation
auto-update / updater introduction
MV-ARCH-3J Background Batch gate activation
```

## 2. Preserved prior authorities

The following ownership boundaries remain unchanged.

### MV-ARCH-3K

Build/dependency determinism remains authoritative for pinned Node, Rust, npm/Cargo lockfiles, and immutable GitHub Action SHAs.

3N adds `.github/workflows/desktop-signing-readiness.yml` to the 3K central workflow set. The new signing workflow is therefore subject to the same immutable toolchain/action policy as the existing Desktop build and release-readiness workflows.

### MV-ARCH-3L

Installed Windows quality remains a separate unsigned-installer authority. 3N does not replace or reinterpret the installed-quality candidate as a signed release.

### MV-ARCH-3M

The formal release-candidate path remains unsigned and publication-disabled. The existing `src-tauri/tauri.windows-release.conf.json` remains unchanged as the 3M release-readiness authority.

## 3. Signing-readiness integration files

3N adds:

```text
src-tauri/tauri.windows-signing-readiness.template.json
scripts/prepare-windows-signing-config.mjs
scripts/windows-signing-bridge.mjs
scripts/desktop-signing-readiness-contract.mjs
scripts/desktop-signing-readiness-audit-windows.mjs
.github/workflows/desktop-signing-readiness.yml
```

The static template enables bundling and preserves the already validated Windows WebView2 transport:

```text
webviewInstallMode = downloadBootstrapper
```

It introduces a Tauri custom signing hook through:

```text
bundle.windows.signCommand
```

The repository template contains placeholders only. The workflow generates an ephemeral runtime config with absolute paths to the pinned Node executable and MasterV signing bridge. The generated config is removed after execution and is not repository authority.

## 4. Provider-neutral fail-closed bridge

The current bridge accepts exactly one mode:

```text
MASTERV_SIGNING_MODE=dry-run
```

Any attempt to use the bridge outside that mode fails with:

```text
MASTERV_SIGNING_PROVIDER_REQUIRED
```

The bridge contains no:

```text
child_process external signer execution
signtool invocation
Azure / Artifact Signing implementation
certificate thumbprint
certificate file
private key
client secret
timestamp service
GitHub secret consumption
release publication operation
```

For each target passed by Tauri, the bridge requires a real Windows PE image by checking the `MZ` header before accepting the target.

No signature is written. Each invocation records:

```text
signing_provider_configured = false
signing_identity_configured = false
credentials_consumed        = false
external_signer_invoked      = false
signature_written            = false
```

## 5. Tauri / NSIS signing target coverage

The first 3N runtime execution exposed an important integration detail.

Initial commit:

```text
0e9616bc38bb8a92b272f43dad22f115b6b6a2c6
feat(arch3n): add desktop signing integration readiness
```

The initial bridge accepted `.exe` and `.dll` targets. During the real NSIS bundle, Tauri also invoked `signCommand` for the generated uninstaller while it existed as an NSIS temporary `.tmp` PE file.

The bridge correctly rejected that extension, but NSIS did not propagate the nested signing-command failure as an overall bundle failure. The workflow therefore ended green even though one signing target had not traversed the intended integration successfully.

That run is **not accepted as 3N authority**.

Correction:

```text
9569361a23e43765f0283f0f48299e19952f2c85
fix(arch3n): cover NSIS temporary uninstaller signing hook
```

The correction does not blindly allow arbitrary `.tmp` files. It requires the target to be a Windows PE image first, then classifies a valid temporary PE target as:

```text
nsis-uninstaller-temp
```

The audit was strengthened to require the complete signing-hook set rather than merely a successful final NSIS bundle.

## 6. Central determinism ownership

After the runtime hook correction, 3N also extended the existing 3K central workflow authority.

Commit:

```text
6d9e2c722c9488e7f2ee9c2d1e71f2c0ba927d79
test(arch3n): include signing workflow in determinism authority
```

The 3K contract now includes:

```text
.github/workflows/desktop-signing-readiness.yml
```

in its pinned workflow set.

This means the 3N workflow cannot silently float:

```text
Node
Rust
actions/checkout
actions/setup-node
dtolnay/rust-toolchain
actions/upload-artifact
```

No dependency or determinism requirement was relaxed.

## 7. Signing-readiness workflow authority

3N adds:

```text
.github/workflows/desktop-signing-readiness.yml
```

The workflow supports two source-authority modes.

### Pull-request verification

For `pull_request`, GitHub checks out the normal synthetic merge authority while separately recording:

```text
raw PR head SHA
base SHA
actual synthetic-merge checkout SHA
source_authority = pr-synthetic-merge
```

### Manual exact-SHA dry-run

`workflow_dispatch` exposes:

```text
source_sha
allow_signing_dry_run
```

The manual gate defaults closed:

```text
allow_signing_dry_run = false
```

When explicitly enabled, it requires an exact 40-character commit SHA and verifies:

```text
git rev-parse HEAD == requested source_sha
```

This manual path still performs only signing-integration dry-run validation. It has no live signing or publication authority.

### Permission boundary

The workflow declares only:

```text
permissions:
  contents: read
```

It consumes no signing-provider secrets, certificate material, provider credentials, GitHub write permission, release action, tag operation, or push operation.

## 8. Static 3N contract

3N adds:

```text
scripts/desktop-signing-readiness-contract.mjs
```

Verified marker:

```text
MASTERV_DESKTOP_SIGNING_READINESS_CONTRACT_PASS
```

Among other invariants, it requires:

- the 3L/3M/3N Windows WebView2 installer mode to remain aligned,
- the signing template to remain provider-neutral,
- the runtime config to materialize absolute Node/bridge paths,
- live provider execution to remain unavailable,
- each signing target to be a Windows PE image,
- NSIS temporary uninstaller coverage to be explicit,
- PR and manual exact-SHA source authority to remain distinct,
- manual dry-run execution to default closed,
- repository permission to remain read-only,
- Node/Rust/actions to remain immutable,
- 3K and 3M contracts to run before the 3N runtime build,
- app and final installer to remain `NotSigned` in dry-run,
- no unsigned installer to be uploaded as a signed-distribution artifact,
- no signer/certificate/provider credential to be consumed,
- no Git tag, GitHub Release, updater, activation, or 3J gate change.

## 9. Authoritative implementation-head signing verification

Authoritative implementation head:

```text
6d9e2c722c9488e7f2ee9c2d1e71f2c0ba927d79
```

Base main:

```text
f819da2a6568534360adbd4ee4282d22f495b923
```

PR synthetic merge used by the successful signing run:

```text
90fafd558e41fab89cf3a3a42069f6e1d723f390
```

Dedicated signing-readiness workflow:

```text
run ID     = 31921377914
run number = #3
conclusion = SUCCESS
```

The same run passed, in order:

```text
npm ci
MV-ARCH-3K build determinism contract
MV-ARCH-3M release-readiness contract
MV-ARCH-3N signing-readiness contract
cargo metadata --locked
native Windows Tauri build
post-build lockfile zero-delta
platform icon generation
provider-neutral signing evidence boundary creation
absolute-path signing config generation
real Tauri / NSIS bundle through signCommand
post-bundle lockfile zero-delta
app Authenticode NotSigned assertion
installer Authenticode NotSigned assertion
signing-integration evidence audit
generated signing-config cleanup
evidence-only artifact upload
```

## 10. Exact signing-hook evidence

The authoritative run observed exactly eight signing-hook invocations across the complete Tauri/NSIS path.

```text
1. masterv-desktop.exe              -> app-executable
2. NSISdl.dll                       -> nsis-plugin-or-dll
3. StartMenu.dll                    -> nsis-plugin-or-dll
4. System.dll                       -> nsis-plugin-or-dll
5. nsDialogs.dll                    -> nsis-plugin-or-dll
6. nsis_tauri_utils.dll             -> nsis-plugin-or-dll
7. NSIS temporary .tmp PE           -> nsis-uninstaller-temp
8. MasterV_0.1.0_x64-setup.exe      -> nsis-installer
```

Every accepted target recorded:

```text
portable_executable        = true
credentials_consumed       = false
external_signer_invoked    = false
signature_written          = false
```

The final 3N manifest records:

```text
status                         = MASTERV_DESKTOP_SIGNING_INTEGRATION_PASS
version                        = 0.1.0
source_sha                     = 6d9e2c722c9488e7f2ee9c2d1e71f2c0ba927d79
checkout_sha                   = 90fafd558e41fab89cf3a3a42069f6e1d723f390
base_sha                       = f819da2a6568534360adbd4ee4282d22f495b923
source_authority               = pr-synthetic-merge
signing_mode                   = dry-run
signing_hook_invocations       = 8
installer                      = MasterV_0.1.0_x64-setup.exe
installer_sha256               = 518e7799ee0d8fa3ded9b2b865e60edfa0b9845c094a2f04afebc3dcd239a34c
installer_signature_status     = NotSigned
app_signature_status           = NotSigned
provider_selected              = false
signing_identity_configured    = false
signing_credentials_consumed   = false
signed_artifact_produced       = false
publish_allowed                = false
activation_allowed             = false
updater_enabled                = false
background_batch_gate_changed  = false
```

Signing-readiness artifact:

```text
artifact ID = 9256502086
name        = masterv-windows-signing-readiness
size        = 1,189 bytes
SHA256      = a4088b4f163dc33984bc1c49e6820d4d085555f78456957934b4093ceb6aa0c2
expired     = false
```

Only evidence files are uploaded by this workflow. The dry-run unsigned installer is intentionally not published as a signing artifact.

## 11. 3M release-readiness regression on the same head

The same implementation head completed the existing release-readiness workflow:

```text
run ID     = 31921377824
run number = #7
conclusion = SUCCESS
```

Release-readiness artifact:

```text
artifact ID = 9256503406
name        = masterv-windows-release-readiness
size        = 1,054,636 bytes
SHA256      = 12d62e3888423f350661b56934449c1a78c99da982cc048c0174ab32cdda7c3f
expired     = false
```

The existing 3M authority therefore remains intact after 3N.

## 12. Full installed-quality regression on the same head

The authoritative implementation head also completed the existing full CI workflow:

```text
run ID     = 31921377812
run number = #820
conclusion = SUCCESS
```

Jobs:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-quality  SUCCESS
```

The actual Windows checkout was the same PR synthetic merge:

```text
90fafd558e41fab89cf3a3a42069f6e1d723f390
```

The unsigned installed-quality candidate produced:

```text
installer SHA256     = e3c92f58cb8b7bdfeb81802bdd272f544c9e7fdb6b97ca16539334bbfef0d96c
installed EXE SHA256 = b1f2414cacadd6185359fbbbf69f47766c865db372c8b61b514947d42391e43e
```

Installer and installed EXE credential scans returned no forbidden hits.

The candidate created no MasterV autorun entry, Windows service, or scheduled task.

Native and installed deterministic regressions for 3E/3F/3G/3J all passed.

Preserved 3F authority included:

```text
client_hosted_function_delta = 1
evidence_rule_count          = 11
gemini_requests              = 0
youtube_requests             = 0
```

Preserved 3G authority included:

```text
candidate_count              = 12
youtube_api_requests         = 2
client_youtube_api_delta     = 0
client_hosted_function_delta = 1
gemini_requests              = 0
```

Preserved 3J blocked-state authority included:

```text
provider_precondition_confirmed = false
live_batch_verified             = false
desktop_submit_enabled          = false
submit_capability               = false
batch_submit_requests           = 0
batch_create_attempts           = 0
client_gemini_api_delta         = 0
local_next_api_delta            = 0
reference_library_writes        = 0
```

## 13. Restart / session / uninstall quality

The installed application again produced:

```text
MASTERV_WINDOWS_INSTALLED_QUALITY_PASS
```

with:

```text
installed_launch                 = PASS
authenticated_runtime            = PASS
process_restart_without_logout   = PASS
restart_auth_status              = SIGNED OUT
persistent_auth_storage          = false
explicit_logout_clear            = true
direct_gemini_requests           = 0
direct_youtube_data_api_requests = 0
local_next_api_requests          = 0
uninstall                        = PASS
uninstall_cleanup_wait_ms        = 2457
installed_executable_removed     = true
uninstall_registry_removed       = true
autorun_residue                  = false
service_residue                  = false
scheduled_task_residue           = false
updater_created                  = false
activation                       = false
```

CI #820 uploaded:

```text
artifact ID = 9256543754
name        = masterv-windows-desktop-smoke
size        = 1,507,830 bytes
SHA256      = a76ff7dcd808fedc087af7e3af65969276ddb76c014db22fa13ee802330ab9c0
expired     = false
files       = 30
```

## 14. Provider health remains a separate blocker

After deterministic product/install/signing-integration gates passed, #820 observed current Gemini provider health.

Deep Analysis attempts returned quota-limit behavior:

```text
attempt 1: retry hint 35s, waited 38s
attempt 2: retry hint 43s, waited 46s
attempt 3: retry hint 44s, provider observation remained failed
```

Production Guidance was skipped because the prerequisite provider-health observation remained blocked.

Recorded provider state:

```text
status                    = PROVIDER_HEALTH_BLOCKED
deep_analysis             = failure
production_guidance       = skipped
product_quality_authority = separate
activation_allowed        = false
```

Provider availability therefore does not invalidate the 3N signing-integration evidence, but it still does not authorize Desktop activation.

## 15. Hosted / DB poststate

After #820, the live database was independently re-read.

```text
MV3D fixture count       = 0
MV3E fixture count       = 0
MV3F fixture count       = 0
background_batch_jobs    = 0
```

The Background Batch gate remains:

```text
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
```

3N therefore did not open or weaken MV-ARCH-3J.

## 16. Lifecycle conclusion

MV-ARCH-3N is promoted to:

**SIGNING_INTEGRATION_VERIFIED / SIGNING_PROVIDER_REQUIRED / PROVIDER_HEALTH_BLOCKED / NOT ACTIVATED**

This promotion means:

- the real Tauri v2 Windows `signCommand` integration is wired,
- every observed Windows/NSIS signing target traverses the controlled bridge,
- temporary NSIS uninstaller signing is explicitly covered,
- all accepted signing targets are validated as Windows PE images,
- the signing workflow is now centrally owned by 3K determinism policy,
- the bridge fails closed outside dry-run mode,
- no signing provider or signing identity has been selected,
- no signing credentials were consumed,
- no signature was written,
- no signed artifact was produced,
- 3M unsigned release-readiness still passes,
- 3L installed runtime quality still passes,
- provider health remains independently blocked,
- publication, updater, merge, and activation remain closed.

3N **does not** mean:

```text
MasterV is code signed
MasterV has a certificate
MasterV has a signing provider
MasterV is publicly downloadable
MasterV has a GitHub Release
MasterV is ready to activate
Background Batch is enabled
```

## 17. Next authority required

Further progress now requires an explicit distribution/signing decision rather than additional internal wiring.

Candidate directions are intentionally not selected by 3N:

```text
A. direct Windows Authenticode signing while preserving the validated NSIS distribution path
B. Microsoft Store / store-mediated Windows distribution, accepting packaging/distribution divergence
C. defer public signing/distribution and retain the current unsigned, non-public lifecycle
```

A concrete signing provider, legal signing identity, certificate/account setup, credential storage model, and any provider cost must be selected before live signing can begin.

No later stage should infer that choice from this document.

## 18. STOP

Do not perform any of the following without a new explicit authority decision and fresh repository/provider re-read:

```text
select or purchase a signing certificate/provider
create cloud signing resources
add signing credentials to GitHub
change MASTERV_SIGNING_MODE to live
produce a signed MasterV binary
publish a GitHub Release
create a release tag
introduce updater artifacts
mark PR #1 ready
merge PR #1
activate Desktop
change MV-ARCH-3J gate values
```
