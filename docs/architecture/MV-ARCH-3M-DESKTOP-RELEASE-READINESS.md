# MV-ARCH-3M — Desktop Release Candidate & Activation Readiness

Status: **RELEASE_READINESS_VERIFIED / PROVIDER_HEALTH_BLOCKED / NOT ACTIVATED**

## 1. Scope

MV-ARCH-3M establishes a formal Windows Desktop release-candidate authority without publishing or activating MasterV.

MV-ARCH-3L already proved that the deterministic unsigned NSIS artifact can be installed as a real Windows application, exercised through the established Desktop runtime/security boundaries, restarted without durable authentication restoration, explicitly logged out, and cleanly uninstalled.

3M answers the next, separate question:

> Can the validated Desktop build be produced through an explicit release-candidate path with exact source identity, locked dependencies, immutable CI evidence, unsigned-state verification, credential isolation, and no publication/activation authority?

The answer is now yes.

3M does **not** authorize or perform:

```text
code signing
certificate provisioning
git tag creation
GitHub Release publication
PR Ready-for-review
PR merge
main activation
Desktop activation
auto-update / updater introduction
MV-ARCH-3J Background Batch gate activation
```

## 2. Release configuration authority

The normal Desktop configuration remains deliberately non-bundling:

```text
src-tauri/tauri.conf.json
bundle.active = false
```

The existing installed-quality path remains separate:

```text
src-tauri/tauri.windows-smoke.conf.json
```

3M adds a formal release-candidate overlay:

```text
src-tauri/tauri.windows-release.conf.json
```

Its current installer authority is intentionally minimal and matches the already validated 3L Windows installer transport:

```json
{
  "bundle": {
    "active": true,
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

The release-candidate overlay contains no signing certificate, sign command, timestamp authority, updater endpoint, updater public key, or automatic activation setting.

The explicit package command is:

```text
npm run desktop:bundle:windows-release-candidate
```

which resolves to:

```text
tauri bundle --bundles nsis --config src-tauri/tauri.windows-release.conf.json
```

Thus a normal `desktop:build` still does not silently become a release operation.

## 3. Release identity

The current Desktop product identity remains:

```text
version    = 0.1.0
identifier = com.masterv.desktop
installer  = MasterV_0.1.0_x64-setup.exe
```

The release-candidate audit requires `package.json` and `src-tauri/tauri.conf.json` versions to match.

Each runtime release-candidate evidence record binds:

```text
version
raw source SHA
actual checkout SHA
base SHA when applicable
source authority mode
installer filename
installer SHA256
signature state
credential audit result
publication authority
activation authority
updater state
Background Batch gate-change state
```

This prevents a generic branch-tip installer from being treated as an unidentified release candidate.

## 4. Gated release-readiness workflow

3M adds:

```text
.github/workflows/desktop-release-readiness.yml
```

The workflow has two distinct source-authority modes.

### 4.1 Pull-request verification path

On `pull_request`, GitHub Actions checks out the normal synthetic merge ref while separately recording:

```text
raw PR head SHA
base SHA
actual synthetic-merge checkout SHA
source_authority = pr-synthetic-merge
```

This path is the currently runtime-verified 3M authority.

### 4.2 Manual exact-SHA release-candidate path

The workflow also exposes `workflow_dispatch` inputs:

```text
source_sha
allow_unsigned_rc
```

The unsigned RC gate defaults closed:

```text
allow_unsigned_rc = false
```

When explicitly enabled, the workflow requires a 40-character commit SHA, checks out exactly that requested SHA, and verifies:

```text
git rev-parse HEAD == requested source_sha
```

This manual path is statically guarded by the 3M contract. It has **not** been used to publish or activate anything in 3M, and no claim is made that a manual dispatch itself was executed as part of this stage.

### 4.3 Permission boundary

The workflow declares only:

```text
permissions:
  contents: read
```

It contains no:

```text
contents: write
release creation action
gh release command
git tag
git push
TAURI_SIGNING_PRIVATE_KEY
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_TEST_EMAIL
SUPABASE_TEST_PASSWORD
```

The release-readiness workflow therefore has build/audit authority but not publication, provider, test-account, or signing authority.

## 5. Static release-readiness contract

3M adds:

```text
scripts/desktop-release-readiness-contract.mjs
npm run test:desktop-release-readiness
```

Verified marker:

```text
MASTERV_DESKTOP_RELEASE_READINESS_CONTRACT_PASS
```

The contract requires, among other invariants:

- default Tauri bundling remains disabled,
- 3L smoke bundling remains intact,
- a separate 3M release-candidate overlay exists,
- release and installed-quality WebView2 installer mode do not silently diverge,
- no signing/updater authority is introduced,
- PR and manually gated exact-SHA source modes exist,
- manual unsigned-RC execution defaults closed,
- repository permission is read-only,
- Node/Rust/actions remain deterministically pinned,
- release build preserves npm/Cargo lockfiles,
- Authenticode unsigned state is explicitly checked,
- no release/tag/push mechanism exists,
- no protected provider/test/signing credential is consumed,
- evidence records publication/activation/updater/3J-gate state as disabled/unchanged.

## 6. Runtime release-candidate audit

3M adds:

```text
scripts/desktop-release-candidate-audit-windows.mjs
npm run test:desktop-release-candidate-audit-windows
```

The runtime audit requires exactly one installer named:

```text
MasterV_0.1.0_x64-setup.exe
```

It rejects a release candidate if forbidden credential identifiers are embedded in either UTF-8 or UTF-16LE form:

```text
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_TEST_EMAIL
SUPABASE_TEST_PASSWORD
TAURI_SIGNING_PRIVATE_KEY
```

It also requires the Windows Authenticode state to be exactly:

```text
NotSigned
```

This is deliberate. 3M verifies unsigned release readiness; it does not pretend code signing has occurred.

The final manifest explicitly records:

```text
publish_allowed                = false
activation_allowed             = false
updater_enabled                = false
background_batch_gate_changed  = false
```

## 7. Build determinism ownership extension

3M extends the existing MV-ARCH-3K dependency/build authority so the new release-readiness workflow is covered by the same immutable action/toolchain checks.

During the first Windows release-readiness execution, the 3K Cargo.lock parser exposed a pre-existing portability assumption: it matched LF-only line endings and therefore failed to read the locked `tauri` version from a Windows CRLF checkout.

Correction:

```text
f06504a79029d1d0d8fbcee441d2ff59f0a76baf
fix(arch3m): make build determinism contract Windows-safe
```

The parser now accepts `\r?\n` while retaining the exact same locked-version requirements.

The release-readiness workflow was also added to 3K's pinned-workflow set, so its action SHAs and Node/Rust versions cannot silently float.

No dependency requirement was relaxed.

## 8. Windows WebView2 harness readiness correction

The first complete 3M-era existing-quality regression reached the installed 3F Canonical Reference Compiler after installation, but the WebDriver session attached during the WebView's transient `about:blank` phase.

The login action was therefore sent before the Desktop DOM existed. The script returned `false`, the page subsequently loaded normally, and the smoke later timed out while still signed out.

This was a test-attachment readiness race rather than a product authentication/runtime regression.

Correction:

```text
159d05947dfc08fa5ca2df7fd744da2873580a1a
fix(arch3m): wait for desktop DOM before WebView smoke
```

The shared Windows WebView2 attach helper now returns only after all of the following are true:

```text
location starts with https://tauri.localhost/
document.readyState != loading
#surface-badge == desktop
```

The correction applies centrally to native and installed Windows smokes rather than special-casing 3F.

Requirements were not weakened. On the corrected head, native and installed 3E/3F/3G/3J all passed.

## 9. Authoritative 3M implementation-head release readiness

Authoritative implementation head:

```text
159d05947dfc08fa5ca2df7fd744da2873580a1a
```

Base main:

```text
f819da2a6568534360adbd4ee4282d22f495b923
```

Pull-request synthetic merge used by the successful release-readiness run:

```text
6419fc7859ba31fddf223e34b191be7bf47000b6
```

Dedicated release-readiness workflow:

```text
run ID     = 31915703845
run number = #3
conclusion = SUCCESS
```

All release-readiness steps passed, including:

```text
npm ci
MV-ARCH-3K determinism contract
MV-ARCH-3M release-readiness contract
cargo metadata --locked
native Windows Tauri build
post-build lockfile zero-delta
formal NSIS release-candidate build
post-installer lockfile zero-delta
Authenticode NotSigned assertion
release-candidate credential/identity audit
evidence upload
```

Release-readiness artifact:

```text
artifact ID = 9254888862
name        = masterv-windows-release-readiness
size        = 1,054,755 bytes
SHA256      = 1a42c23bf7ea27824e08941cc687f38361b183283a090d3526b92fc2200564b0
expired     = false
```

Manifest authority:

```text
status                          = MASTERV_DESKTOP_RELEASE_READINESS_PASS
version                         = 0.1.0
source_sha                      = 159d05947dfc08fa5ca2df7fd744da2873580a1a
checkout_sha                    = 6419fc7859ba31fddf223e34b191be7bf47000b6
base_sha                        = f819da2a6568534360adbd4ee4282d22f495b923
source_authority                = pr-synthetic-merge
installer                       = MasterV_0.1.0_x64-setup.exe
installer_sha256                = fbaf82b02fcb97912a92c49f347253a5f53a5d58e3d1c471c19ea07294fea0fe
signature_status                = NotSigned
credential_identifiers_present  = false
publish_allowed                 = false
activation_allowed              = false
updater_enabled                 = false
background_batch_gate_changed   = false
```

The installer digest was independently recomputed from the downloaded workflow artifact and matched the manifest.

## 10. Existing installed-quality regression on the same head

The corrected implementation head also completed the existing full CI workflow:

```text
run ID     = 31915703843
run number = #812
conclusion = SUCCESS
```

Jobs:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-quality  SUCCESS
```

The actual PR checkout was the same synthetic merge authority:

```text
6419fc7859ba31fddf223e34b191be7bf47000b6
```

The Windows job passed all deterministic native and installed boundaries before provider-health observation.

### 10.1 Installed candidate

```text
installer SHA256     = 9386843fa8cc5683d4358f946346293a8c4c7881fb80e46c4b353703a3ba54b7
installed EXE SHA256 = d6f4b9d0d6396cd826879ecbeb2589ccae94626583eb5db7f06eeb560f0ce5a6
```

Installer/EXE credential scans returned no forbidden hits.

The installed candidate created no MasterV autorun entry, Windows service, or scheduled task.

### 10.2 Installed deterministic regressions

The installed application passed:

```text
MV-ARCH-3E Reference Detail / Compare
MV-ARCH-3F Canonical Reference Compiler / Evidence
MV-ARCH-3G Hosted YouTube Discovery
MV-ARCH-3J Guarded Background Batch
```

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

### 10.3 Restart/session/uninstall quality

The installed lifecycle again produced:

```text
MASTERV_WINDOWS_INSTALLED_QUALITY_PASS
```

with:

```text
installed_launch               = PASS
authenticated_runtime          = PASS
process_restart_without_logout = PASS
restart_auth_status            = SIGNED OUT
persistent_auth_storage        = false
explicit_logout_clear          = true
direct_gemini_requests         = 0
direct_youtube_data_api_requests = 0
local_next_api_requests        = 0
uninstall                      = PASS
installed_executable_removed   = true
uninstall_registry_removed     = true
autorun_residue                = false
service_residue                = false
scheduled_task_residue         = false
updater_created                = false
activation                     = false
```

NSIS cleanup required bounded polling for approximately:

```text
uninstall_cleanup_wait_ms = 6420
```

The strict removal requirement remained unchanged.

## 11. Current provider health remains separate

After deterministic product/release-quality gates passed, #812 observed current Gemini health.

Deep Analysis attempts returned quota-limit behavior:

```text
attempt 1: retry hint 31s, waited 34s
attempt 2: retry hint 43s, waited 46s
attempt 3: retry hint 44s, provider observation remained failed
```

Production Guidance was skipped because its prerequisite provider-health observation was blocked.

Recorded provider state:

```text
status                    = PROVIDER_HEALTH_BLOCKED
deep_analysis             = failure
production_guidance       = skipped
product_quality_authority = separate
activation_allowed        = false
```

Therefore provider availability does not invalidate successful release-readiness/product-quality evidence, but it also does not authorize activation.

## 12. Windows quality artifact

CI #812 uploaded:

```text
artifact ID = 9254933841
name        = masterv-windows-desktop-smoke
size        = 1,505,287 bytes
SHA256      = 39a1469e1bcf05489e0e4bf4b7b39c5f81399dc3491cc2f3440225bdf7751ca6
expired     = false
files       = 30
```

The artifact contains the installed-quality and provider-health evidence used above.

## 13. Hosted/DB poststate

After #812, the live database was independently re-read.

Smoke fixture residue:

```text
MV3D prefix count      = 0
MV3E prefix count      = 0
MV3F prefix count      = 0
background_batch_jobs  = 0
```

The Background Batch gate remains:

```text
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
```

Thus 3M did not open or weaken MV-ARCH-3J.

## 14. Lifecycle conclusion

MV-ARCH-3M is promoted to:

**RELEASE_READINESS_VERIFIED / PROVIDER_HEALTH_BLOCKED / NOT ACTIVATED**

This promotion means:

- MasterV has a distinct formal Windows release-candidate configuration,
- release source identity is explicit,
- the PR release path is runtime-verified,
- a guarded exact-SHA manual RC path exists and defaults closed,
- the release build uses the locked dependency/toolchain authority,
- release artifacts remain unsigned and are identified as such,
- credential identifiers are audited out of the candidate,
- publication permission is absent,
- updater/activation remain absent,
- the existing installed-runtime quality chain still passes,
- Gemini provider health is still independently blocked,
- the Background Batch gate remains closed.

3M is release **readiness**, not release publication.

## 15. STOP boundary

3M does not authorize:

```text
certificate purchase/provisioning
code signing
signing-secret configuration
Git tag creation
GitHub Release publication
public installer distribution
updater introduction
auto-update
PR Ready-for-review
PR merge
main activation
Desktop activation
MV-ARCH-3J provider gate activation
```

Do not infer or begin MV-ARCH-3N without a separate instruction and fresh authority read.
