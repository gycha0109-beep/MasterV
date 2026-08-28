# MV-DESKTOP-LIC-1 — Desktop Entitlement & Session Lifecycle

Status: IMPLEMENTED / EXACT_HEAD_REGRESSION_VERIFIED / LIVE_SANDBOX_E2E_PENDING  
Starting repository authority: `2a0a5b055622d4492f511b3bc1080c447ed58293`  
Exact-head full regression authority before interactive launcher addition: `0eab71ec3963cf881b6bb9f2e059aef73c3c56af`  
Architecture authority: `MASTERV_TARGET_ARCHITECTURE(1).md` / `MV-ARCH-001`  
Runtime scope: Tauri Desktop + existing Stateless Gateway contract  
Production mutation: NOT AUTHORIZED

## 1. Purpose

This stage does not redesign licensing. Product Key activation, Windows DPAPI device credential persistence, `/v1/session`, `/v1/entitlement`, Local SQLite authority, and the Stateless Gateway already exist.

`MV-DESKTOP-LIC-1` closes the remaining Desktop lifecycle gap between those existing contracts:

```text
Product Key bootstrap or startup device resume
→ memory-only short-lived Session Credential
→ expiry-aware session refresh via Device Credential
→ Gateway entitlement readback
→ Desktop BASIC/license/subscription/credit projection
→ paid remote operation
→ best-effort authoritative entitlement readback
```

The Desktop projection is informational. The Gateway remains the final paid-operation authority.

## 2. Frozen architecture boundaries

The following remain unchanged:

```text
User work data authority        Local SQLite
Central MasterV DB              NONE
Payment/license authority       Polar via Gateway
Gateway                         stateless / DB-less
Product Key                     bootstrap-only
Device Credential               Windows DPAPI protected
Session Credential              memory-only / short-lived
Gemini/YouTube/Polar secrets    Gateway-only
Update authority                independent from subscription
```

Subscription or entitlement failure must never block Local SQLite read/export/delete behavior.

## 3. Existing implementation inherited by this stage

Before this stage, Desktop already had:

- `desktop_gateway_activate`
- random `install_id`
- DPAPI-protected `device_credential`
- Product Key non-persistence
- Session Credential non-persistence
- `desktop_gateway_resume_session`
- automatic startup device-session resume in `desktop/app.js`
- `desktop_gateway_entitlement`
- Gateway Analyze/Guidance transport
- Local SQLite persistence for analysis/guidance

Therefore this stage does not introduce a second auth model or a second credential store.

## 4. Session lifecycle

Gateway session TTL is short-lived. Desktop now treats the current session as process-memory authority and refreshes it when it is within 60 seconds of expiry.

```text
remote operation requested
→ active memory session exists?
→ expiry > 60s: use current session
→ expiry <= 60s: POST /v1/session using DPAPI Device Credential
→ replace active in-memory session
→ notify Desktop session consumers
→ execute remote operation
```

If the Gateway explicitly returns `GATEWAY_CREDENTIAL_EXPIRED`, Desktop performs one device-session refresh and retries the operation once.

A refresh started before logout/session replacement is not allowed to resurrect the superseded memory session. The lifecycle fails closed with `GATEWAY_SESSION_SUPERSEDED`.

Logout clears the in-memory session but deliberately leaves the DPAPI Device Credential intact.

## 5. Entitlement projection

The visible entitlement panel projects these Gateway/Polar fields:

```text
plan
license_status
subscription_status
grace_active
usage_remaining
device_limit
current_period_end
session expires_at
```

The panel declares:

```text
authority             gateway-polar-readback
desktop authority     projection-only
local data authority  local-sqlite
paid operation auth   masterv-gateway
```

This preserves the Target Architecture rule that Desktop-projected plan/usage/license values are not trusted as final authorization.

## 6. Usage readback

Analyze and Guidance already charge through Gateway usage accounting.

After a successful paid operation, Desktop performs a best-effort `/v1/entitlement` readback through the existing capability probe path.

```text
Analyze success
→ local result persisted
→ entitlement readback
→ usage_remaining projection refresh

Guidance success
→ local result persisted
→ entitlement readback
→ usage_remaining projection refresh
```

An entitlement readback failure after a successful paid operation does **not** retroactively convert that operation into a failure. The user can manually request another entitlement refresh from the UI.

## 7. Error projection

Gateway error codes are translated into user-facing licensing state while retaining fail-closed behavior for paid operations.

Covered codes include:

- `GATEWAY_LICENSE_INACTIVE`
- `GATEWAY_CAPABILITY_DENIED`
- `GATEWAY_USAGE_DENIED`
- `GATEWAY_CREDENTIAL_EXPIRED`
- `GATEWAY_CREDENTIAL_INVALID`
- `GATEWAY_SESSION_REQUIRED`
- `GATEWAY_DEVICE_MISMATCH`
- `GATEWAY_PLAN_NOT_CONFIGURED`
- `GATEWAY_USAGE_METER_NOT_CONFIGURED`
- `POLAR_UPSTREAM_ERROR`

Polar activation failures retain only a bounded, secret-safe diagnostic tuple at the Desktop boundary:

```text
phase
upstream_status
upstream_reason
```

`upstream_reason` is a closed allow-list derived from Polar's known license activation failures. Arbitrary upstream detail, Product Keys, OAT values, and request bodies are never surfaced by the Desktop UI.

The error projection explicitly preserves Local SQLite availability for licensing/usage denial cases.

## 8. Deterministic verification

Source/runtime contracts:

```text
scripts/desktop-lic-1-contract.mjs
scripts/desktop-lic-1-sandbox-launcher-contract.mjs
```

The contracts verify without any application, Polar, provider, or signing credential:

- 60-second near-expiry refresh threshold;
- device-resume session replacement;
- memory-only refreshed session authority;
- logout/refresh race fail-closed behavior;
- Local-only comparison remains usable without Gateway session;
- Analyze 5-unit fixture readback (`30 → 25`);
- Guidance 1-unit fixture readback (`25 → 24`);
- entitlement UI surface and packaging;
- DPAPI Device Credential boundary;
- Product Key non-persistence;
- Session Credential non-persistence;
- paid-operation failure after session close;
- Sandbox E2E credential/logging safety markers;
- hidden Product Key prompt rather than a PowerShell command-line parameter;
- exact-head / clean-tracked-tree launcher boundary;
- Sandbox-only `*.deno.net` Gateway launcher boundary;
- no production Polar/signing/release mutation.

Success markers:

```text
MASTERV_DESKTOP_LIC_1_CONTRACT_PASS
MASTERV_DESKTOP_LIC_1_SANDBOX_LAUNCHER_CONTRACT_PASS
```

Both are attached to the existing `test:post-exit-1` CI path. No automatic workflow is added.

## 9. Exact-head regression evidence

The complete stage head `0eab71ec3963cf881b6bb9f2e059aef73c3c56af` completed both existing automatic PR workflows successfully:

```text
CI run #1103 / 32713495372                         SUCCESS
MV EXIT-3 0.1.3 Clean Cut #64 / 32713495210       SUCCESS
```

Verified coverage included:

```text
source / deterministic contracts                    VERIFIED
Linux Local SQLite + automatic backup               VERIFIED
Linux native Tauri build                            VERIFIED
Windows native Tauri build                          VERIFIED
Windows runtime smoke                               VERIFIED
unsigned NSIS installer build                       VERIFIED
Windows install → run → restart → uninstall         VERIFIED
0.1.2 → 0.1.3 Local SQLite upgrade survival         VERIFIED
published 0.1.3 → signed 0.1.4 updater acceptance   VERIFIED
published v0.1.4 first-run acceptance               VERIFIED
published v0.1.4 Gateway preflight harness          VERIFIED
EXIT-3 Windows native lane                          VERIFIED
EXIT-3 Ubuntu native lane                           VERIFIED
signing-readiness unsigned boundary                 VERIFIED
```

The published-v0.1.4 Gateway preflight itself passed as an observation harness but observed `gateway_configured=false`. Therefore the already-published v0.1.4 binary is not valid evidence for live Gateway entitlement E2E.

The interactive launcher was added after `0eab71ec`; its deterministic contract is attached to the same existing CI path and must be green on the newest head before live Sandbox execution.

## 10. Credential-safe Sandbox E2E harness

The manual harness is:

```text
scripts/desktop-lic-1-sandbox-e2e-windows.mjs
npm run test:desktop-lic-1-sandbox-e2e
```

It is intentionally **not** an automatic PR workflow. Live activation requires explicit external inputs and performs a real Sandbox mutation.

Required execution boundaries:

```text
Windows disposable profile only
MASTERV_SANDBOX_E2E_EPHEMERAL_WINDOWS=true
MASTERV_SANDBOX_E2E_ALLOW_NEW_ACTIVATION=true
MASTERV_SANDBOX_E2E_SOURCE_SHA=<exact 40-character checked-out commit SHA>
MASTERV_GATEWAY_BASE_URL=https://<sandbox>.deno.net
MASTERV_SANDBOX_PRODUCT_KEY=<runtime secret only>
```

Before any external activation, the harness requires the checked-out `HEAD` to equal `MASTERV_SANDBOX_E2E_SOURCE_SHA` and requires the tracked working tree to be clean. After the Desktop build it verifies that the build did not mutate tracked repository state.

The harness rejects production/custom Gateway hosts and accepts only HTTPS `*.deno.net` roots. It also rejects Polar/Gemini/YouTube/signing server credentials.

Credential handling:

```text
PowerShell launcher
→ verifies exact Node 24.19.0, locked npm/Tauri dependencies, Rust/Cargo 1.97.1, and MSVC/SDK
→ prepares missing Node and Rust runtimes in an isolated user-scope cache
→ builds the exact-head Sandbox-bound Desktop candidate with no Product Key in memory/environment

Product Key
→ prompted only after the Desktop candidate build succeeds
→ read once from process environment by the lifecycle harness
→ remove from process.env before app launch
→ pass only to the visible Desktop activation form through WebDriver
→ clear Desktop input after normal app activation handling
→ never write raw value to evidence

Gateway URL
→ supplied to the exact-head candidate build before Product Key input
→ reused by the lifecycle harness only for Sandbox health verification
→ removed from runtime process environment
→ candidate must report configured=true from build-time binding
```

For credential-bearing browser interaction, `windows-webview2-attach.mjs` supports disabling verbose EdgeDriver output and suppressing the EdgeDriver log entirely. The Sandbox harness uses both protections and scans all emitted evidence for the exact Product Key before success/failure completion.

### Interactive launcher

To avoid putting the Product Key in a command line or shell history, use:

```powershell
.\scripts\run-desktop-lic-1-sandbox-e2e.ps1 -GatewayUrl https://<sandbox>.deno.net
```

The launcher:

```text
validates Windows + exact git HEAD + clean tracked tree
→ accepts only an HTTPS *.deno.net root
→ reads exact Node authority from .node-version (24.19.0, matching CI)
→ reuses or checksum-verifies an isolated official Node runtime
→ materializes missing locked project dependencies with npm ci
→ verifies project-local Tauri CLI 2.11.4
→ verifies or installs Rust/Cargo 1.97.1 through rustup in user scope
→ fails before secret input if MSVC/Windows SDK is unavailable
→ builds the Sandbox-bound Desktop candidate with MASTERV_SANDBOX_PRODUCT_KEY absent
→ verifies the build left the tracked tree clean and emitted the candidate EXE
→ prompts for Product Key in a masked Windows dialog with Ctrl+V support
→ converts it only in process memory for the child test
→ injects exact source SHA and explicit Sandbox activation flags
→ invokes the Node lifecycle harness without a nested build
→ removes all managed environment variables in finally
```

The Product Key is deliberately **not** a PowerShell parameter. The launcher opens a masked Windows input dialog with Ctrl+V enabled only after the candidate build succeeds, avoiding command history/process command-line exposure and manual transcription errors.

A real Guidance usage charge remains a separate explicit action:

```powershell
.\scripts\run-desktop-lic-1-sandbox-e2e.ps1 -GatewayUrl https://<sandbox>.deno.net -AllowGuidanceCharge
```

When enabled, the harness executes one Guidance operation, requires `charged_units=1`, and verifies the Desktop entitlement projection changes by exactly one credit after the post-operation readback.

The harness does not receive a Polar access token and therefore does not deactivate the server-side Sandbox activation. It records `server_activation_cleanup_performed=false`. If the Sandbox Product Key has `device_limit=1`, activation cleanup/reuse must be handled as a separate authorized external operation rather than hidden inside this Desktop test.

### Secret-safe Polar customer-read diagnostic

The live Sandbox sequence proved that license activation can succeed while the immediately following Polar Customer State read returns `403`. The Gateway must therefore distinguish an OAuth `insufficient_scope` response from a generic business-rule `not_permitted` response.

While this incident remains open, the Sandbox Gateway exposes a bounded read-only probe at:

```text
GET /v1/health?probe=polar-customer-read
```

The probe uses the configured Polar OAT and organization against the same `CustomerRead` authority required by Customer State. It returns only authorization status and fixed safety markers. It does not return customer data, accept a Product Key, create an activation, write usage, or perform any Polar mutation. The probe is diagnostic-only and must be removed after the live authorization incident is closed.

## 11. Live sequence

```text
validate exact HEAD / clean tracked tree / Sandbox URL
→ validate or safely prepare Node / npm / Tauri / Rust / Cargo / MSVC prerequisites
→ exact-head unsigned Desktop build with Sandbox Gateway binding and no Product Key
→ hidden Product Key prompt only after build success
→ GET /v1/health
→ verify stateless / DB-less Sandbox providers
→ fresh disposable Local SQLite + DPAPI state
→ prove Local SQLite access before activation
→ Product Key activation
→ BASIC entitlement projection readback
→ prove Product Key/session non-persistence + DPAPI Device Credential persistence
→ terminate Desktop
→ restart Desktop
→ automatic DPAPI Device Credential session resume
→ authoritative entitlement readback
→ optional explicit one-unit Guidance charge/readback
```

## 12. Current verification state

```text
SOURCE_IMPLEMENTATION                         IMPLEMENTED
EXACT_HEAD_0EAB71EC_FULL_REGRESSION            VERIFIED
DETERMINISTIC_LIFECYCLE_CONTRACT              VERIFIED
DESKTOP_BUILD_REGRESSION                      VERIFIED
WINDOWS_RUNTIME_REGRESSION                    VERIFIED
WINDOWS_INSTALL_RESTART_UNINSTALL             VERIFIED
UPDATER_REGRESSION                            VERIFIED
EXIT_3_WINDOWS_NATIVE                         VERIFIED
EXIT_3_UBUNTU_NATIVE                          VERIFIED
SANDBOX_E2E_HARNESS                           IMPLEMENTED
INTERACTIVE_SANDBOX_LAUNCHER                  IMPLEMENTED / CURRENT_HEAD_CI_PENDING
LIVE_TAURI_TO_DENO_SANDBOX_ACTIVATION_E2E     NOT_EXECUTED
LIVE_SANDBOX_GUIDANCE_USAGE_E2E               NOT_EXECUTED
SANDBOX_SERVER_ACTIVATION_CLEANUP              NOT_EXECUTED / NO CLIENT AUTHORITY
PRODUCTION_POLAR_MUTATION                      NOT_AUTHORIZED
PRODUCTION_SIGNING_MUTATION                    NOT_AUTHORIZED
RELEASE_PUBLICATION                           NOT_AUTHORIZED
```

Live Sandbox Desktop E2E must not be fabricated from deterministic fixtures. A successful live run requires a runtime-only Sandbox Product Key and the explicit activation opt-in above.

## 13. Known residual outside this stage

The existing Device Credential itself has a longer expiry than the Session Credential. This stage refreshes only short-lived sessions through the existing `/v1/session` contract. Long-horizon Device Credential renewal/rotation remains a separate concern and is not silently redesigned here.
