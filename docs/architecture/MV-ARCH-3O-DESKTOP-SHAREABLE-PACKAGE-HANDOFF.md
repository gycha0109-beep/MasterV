# MV-ARCH-3O — Desktop Shareable Package & Handoff

Status: **SHAREABLE_PACKAGE_VERIFIED / UNSIGNED / PRIVATE_DISTRIBUTION_READY / NOT PUBLICLY RELEASED / NOT ACTIVATED**

## 1. Scope

MV-ARCH-3O closes the Desktop MVP packaging baseline around the actual intended distribution model:

```text
MasterV Windows build
-> unsigned NSIS installer
-> deterministic private handoff package
-> direct Drive/email-link style sharing by an operator
```

The stage does not build a public distribution platform. It proves that a specific MasterV source revision can produce a private Windows package that is self-identifying, hashable, installable, executable, authenticated-runtime verified, restart/logout verified, uninstallable, and safe to hand off without silently crossing signing, updater, publication, or activation boundaries.

The target lifecycle is therefore:

```text
SHAREABLE_PACKAGE_VERIFIED
/ UNSIGNED
/ PRIVATE_DISTRIBUTION_READY
/ NOT PUBLICLY RELEASED
/ NOT ACTIVATED
```

## 2. Preserved prior authorities

3O does not replace the authorities established by earlier Desktop stages.

### MV-ARCH-3K — build determinism

Pinned Node/Rust versions, npm/Cargo locks, and immutable GitHub Action SHAs remain authoritative. The 3O workflow is added to the same central workflow set.

### MV-ARCH-3L — installed Windows quality

Existing install, authenticated runtime, restart/session, logout, uninstall, and OS-residue checks are reused rather than duplicated with weaker handoff-only assertions.

### MV-ARCH-3M — release readiness

3O reuses the existing explicit Windows release candidate configuration and NSIS path:

```text
src-tauri/tauri.windows-release.conf.json
npm run desktop:bundle:windows-release-candidate
```

The validated WebView2 installer mode remains:

```text
downloadBootstrapper
```

### MV-ARCH-3N — signing integration readiness

3N remains optional future infrastructure. 3O does not select a signing provider, install a certificate, consume signing credentials, or produce a signed artifact.

### MV-ARCH-3J — Background Batch activation guard

3O does not modify or reinterpret Background Batch activation gates.

The authoritative poststate remains:

```text
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
background_batch_jobs           = 0
```

Provider health and Background Batch activation eligibility remain separate concerns.

## 3. 3O implementation surface

3O adds:

```text
.github/workflows/desktop-shareable-package.yml
scripts/desktop-shareable-package-contract.mjs
scripts/prepare-desktop-shareable-package-windows.mjs
scripts/desktop-shareable-package-audit-windows.mjs
```

and extends:

```text
package.json
scripts/desktop-build-determinism-contract.mjs
```

The package scripts are:

```text
desktop:prepare:shareable-package-windows
test:desktop-shareable-package
test:desktop-shareable-package-audit-windows
```

## 4. Private handoff package contract

The generated package has this structure:

```text
artifacts/desktop-shareable-package/
├─ MasterV-v0.1.0/
│  ├─ MasterV_0.1.0_x64-setup.exe
│  ├─ INSTALL.txt
│  ├─ SHA256.txt
│  └─ release-manifest.json
├─ packaged-authenticode-evidence.json
├─ audit-diagnostic.json
└─ shareable-package-evidence.json
```

`INSTALL.txt` identifies the version, states that the build is an unsigned private test build, and explains that a Windows warning may appear.

`SHA256.txt` binds the handoff installer to an exact SHA256.

`release-manifest.json` binds the artifact to:

```text
product
version
raw source SHA
actual checkout SHA
base SHA when applicable
source-authority mode
architecture
installer filename
installer SHA256
Authenticode state
private-distribution lifecycle flags
```

The intended delivery modes are recorded as:

```text
drive-link
email-link
```

This is metadata only. 3O itself does not upload to Drive or send email.

## 5. Source authority and manual private-build gate

The 3O workflow supports two source-authority modes.

### Pull-request verification

For `pull_request`, GitHub checks out the PR synthetic merge while separately recording:

```text
raw PR head SHA
base SHA
actual synthetic-merge checkout SHA
source_authority = pr-synthetic-merge
```

### Manual exact-SHA private package

`workflow_dispatch` exposes:

```text
source_sha
allow_private_package
```

The manual gate defaults closed:

```text
allow_private_package = false
```

When explicitly enabled, the requested source must be an exact 40-character commit SHA and the workflow verifies:

```text
git rev-parse HEAD == requested source_sha
```

This manual path authorizes only generation/verification of a private unsigned package. It does not authorize Drive upload, email sending, public publication, signing, updater creation, or activation.

## 6. Security and publication boundary

The workflow has repository permission:

```text
permissions:
  contents: read
```

The 3O build consumes no:

```text
SUPABASE_SERVICE_ROLE_KEY
Gemini provider key
YouTube provider key
code-signing private key
certificate thumbprint
signing-provider credential
GitHub release-write authority
```

The package preparation pass also scans the installer bytes for forbidden credential identifier strings.

The following remain explicitly false:

```text
signed
Drive uploaded
email sent
GitHub Release created
public release
publish allowed
updater enabled
activation allowed
Background Batch gate changed
```

## 7. Installed-runtime handoff verification

3O verifies the exact packaged installer rather than merely proving that some installer from the same build tree can run.

The sequence is:

```text
locked dependency verification
-> native Windows Tauri build
-> lockfile zero-delta
-> NSIS release-candidate bundle
-> lockfile zero-delta
-> source installer Authenticode NotSigned
-> materialize handoff package
-> packaged-copy SHA256 + Authenticode NotSigned
-> install exact package candidate
-> installed executable audit
-> authenticated runtime
-> process restart/session behavior
-> explicit logout clear
-> uninstall
-> executable/registry/persistence residue audit
-> final handoff evidence closure
```

This means `PRIVATE_DISTRIBUTION_READY` is not granted merely because an EXE exists. It is granted only after the packaged copy itself completes the installed-quality lifecycle.

## 8. Initial audit failure and remediation

The first two 3O workflow runs are not accepted as final authority.

### Run #1

```text
run ID = 31968705831
```

The build, NSIS bundle, install, authenticated runtime, restart/logout lifecycle, and uninstall all succeeded. The final evidence audit failed.

### Run #2

```text
run ID = 31969122600
```

The same product/runtime sequence succeeded again and the final audit failure reproduced. Forensic upload had been strengthened so the failed run retained its evidence artifact.

The retained diagnostic showed that the problem was not the installer or its Authenticode state. The Node audit spawned a child `powershell.exe` process for `Get-AuthenticodeSignature`, and that nested process failed to autoload `Microsoft.PowerShell.Security` on the GitHub Windows runner.

The workflow-native PowerShell Authenticode checks had already succeeded.

The correction therefore did not remove Authenticode verification. It strengthened the boundary:

```text
1. verify the original NSIS installer with native workflow pwsh
2. copy the installer into the private handoff package
3. verify the packaged copy again with native workflow pwsh
4. persist packaged filename + SHA256 + Authenticode status
5. have the Node final audit cross-check that evidence against the actual packaged bytes
```

The upload step also remains `if: always()` so a future final-audit failure retains forensic package/evidence data.

Corrective implementation head:

```text
d8d2b9686bc70e571967ab384d8607b424970597
fix(arch3o): verify packaged Authenticode in workflow shell
```

## 9. Authoritative implementation-head 3O verification

Authoritative implementation head:

```text
d8d2b9686bc70e571967ab384d8607b424970597
```

Base main:

```text
f819da2a6568534360adbd4ee4282d22f495b923
```

PR synthetic merge used by the successful 3O run:

```text
83d84b9be020fbba53e8155c1bce7a5b4d493711
```

Dedicated 3O workflow:

```text
run ID     = 31969525400
run number = #3
conclusion = SUCCESS
```

The run passed every build, package, Authenticode, install, runtime, restart/logout, uninstall, final audit, and artifact-upload step.

3O artifact:

```text
artifact ID = 9269460186
name        = masterv-windows-private-share-package
size        = 1,070,115 bytes
zip SHA256  = ca61d319159436bd857978298a5bb4025cd7c5bc312a7987ae3e030c853acbe7
expired     = false
```

Final package evidence:

```text
status                         = MASTERV_DESKTOP_SHAREABLE_PACKAGE_PASS
version                        = 0.1.0
source_sha                     = d8d2b9686bc70e571967ab384d8607b424970597
checkout_sha                   = 83d84b9be020fbba53e8155c1bce7a5b4d493711
base_sha                       = f819da2a6568534360adbd4ee4282d22f495b923
source_authority               = pr-synthetic-merge
package_directory              = MasterV-v0.1.0
package_format                 = nsis-exe
architecture                   = x64
installer                      = MasterV_0.1.0_x64-setup.exe
installer_sha256               = 7f3609cf79d157e93021cd9256edd205ddf49f5c4d6e450365e8dd53b2e612fe
signature_status               = NotSigned
signed                         = false
installed_runtime_verified     = true
installed_launch               = PASS
authenticated_runtime          = PASS
process_restart_without_logout = PASS
restart_auth_status            = SIGNED OUT
explicit_logout_clear          = true
uninstall                      = PASS
uninstall_residue              = false
distribution                   = private-direct-share
private_distribution_ready     = true
drive_uploaded                 = false
email_sent                     = false
github_release_created         = false
public_release                 = false
publish_allowed                = false
updater_enabled                = false
activation_allowed             = false
background_batch_gate_changed  = false
```

The packaged-copy Authenticode record was:

```text
status           = MASTERV_PACKAGED_AUTHENTICODE_CHECK_PASS
installer        = MasterV_0.1.0_x64-setup.exe
sha256           = 7f3609cf79d157e93021cd9256edd205ddf49f5c4d6e450365e8dd53b2e612fe
signature_status = NotSigned
```

## 10. Installed-quality evidence for the private package

The exact 3O package candidate installed as:

```text
installer SHA256     = 7f3609cf79d157e93021cd9256edd205ddf49f5c4d6e450365e8dd53b2e612fe
installed EXE SHA256 = dfc353d5bd286589379e0457945751c37a1366e8f2d111403f94df9374c14f98
```

Credential-identifier scans returned no forbidden hits for either the installer or installed EXE.

Installed lifecycle evidence recorded:

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
uninstall_cleanup_wait_ms        = 2388
installed_executable_removed     = true
uninstall_registry_removed       = true
autorun_residue                  = false
service_residue                  = false
scheduled_task_residue           = false
updater_created                  = false
activation                       = false
```

## 11. Same-head release/signing/CI regression authority

The 3O implementation head also preserved the previous Desktop authorities.

### Release Readiness

```text
run ID     = 31969525389
run number = #11
conclusion = SUCCESS

artifact ID = 9269465241
name        = masterv-windows-release-readiness
size        = 1,054,892 bytes
zip SHA256  = 0250fd1ff5c76ebd78f063520c4bf0294fea0b67f3c7dd420e57dd80282d8c51
```

### Signing Integration Readiness

```text
run ID     = 31969525396
run number = #7
conclusion = SUCCESS

artifact ID = 9269459101
name        = masterv-windows-signing-readiness
size        = 1,189 bytes
zip SHA256  = 4364076f869fe9fa2ea19f3c9fce5ad2270e49041c5ad4aaa2683e57d8d9a95c
```

This remains dry-run/provider-neutral signing integration only; 3O did not perform live signing.

### Full CI

```text
run ID     = 31969525401
run number = #828
conclusion = SUCCESS
```

CI artifact:

```text
artifact ID = 9269505843
name        = masterv-windows-desktop-smoke
size        = 1,691,515 bytes
zip SHA256  = afbbc7883c8e80bd3c374b2f6ed6af0c4ae550098b641c6877ce4f5a2fb7a37c
```

The full Windows quality path again passed native runtime checks, installed runtime checks, restart/session/uninstall quality, and provider observation without altering activation boundaries.

## 12. Provider health recovered, activation remains closed

The same-head CI #828 provider observation recorded:

```text
status                    = PROVIDER_HEALTH_GREEN
deep_analysis             = success
production_guidance       = success
product_quality_authority = separate
activation_allowed        = false
```

This is a provider-health recovery relative to earlier blocked observations. It does not automatically activate Desktop or Background Batch capabilities.

Background Batch remains explicitly guarded:

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

Fresh Supabase poststate after CI #828 confirmed:

```text
background_batch_jobs           = 0
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
```

Provider availability therefore remains separate from activation authority.

## 13. Explicitly not done

MV-ARCH-3O does **not** perform or authorize:

```text
Google Drive upload
email sending
public download-page publication
GitHub Release creation
Git tag creation
Windows code signing
signing certificate/provider purchase
updater introduction
Desktop production activation
Background Batch activation
PR Ready-for-review
PR merge
main deployment
```

Those require separate explicit decisions.

## 14. Lifecycle freeze

The Desktop private-distribution baseline is frozen as:

```text
SHAREABLE_PACKAGE_VERIFIED
/ UNSIGNED
/ PRIVATE_DISTRIBUTION_READY
/ NOT PUBLICLY RELEASED
/ NOT ACTIVATED
```

The implementation-head authority is `d8d2b9686bc70e571967ab384d8607b424970597` and its successful real Windows package run is `31969525400`.

Documentation-only commits after that implementation head may trigger fresh PR synthetic-merge regression runs; those runs confirm that the documentation/contract freeze did not regress the package authority but do not replace the non-recursive implementation-head record above.
