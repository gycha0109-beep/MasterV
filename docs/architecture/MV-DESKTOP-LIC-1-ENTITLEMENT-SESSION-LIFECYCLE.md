# MV-DESKTOP-LIC-1 — Desktop Entitlement & Session Lifecycle

Status: IMPLEMENTED_UNVERIFIED  
Starting repository authority: `2a0a5b055622d4492f511b3bc1080c447ed58293`  
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

The error projection explicitly preserves Local SQLite availability for licensing/usage denial cases.

## 8. Deterministic verification

Source/runtime contract:

```text
scripts/desktop-lic-1-contract.mjs
```

The contract verifies without any application, Polar, provider, or signing credential:

- 60-second near-expiry refresh threshold;
- device-resume session replacement;
- memory-only refreshed session authority;
- Local-only comparison remains usable without Gateway session;
- Analyze 5-unit fixture readback (`30 → 25`);
- Guidance 1-unit fixture readback (`25 → 24`);
- entitlement UI surface and packaging;
- DPAPI Device Credential boundary;
- Product Key non-persistence;
- Session Credential non-persistence;
- paid-operation failure after session close;
- no production Polar/signing/release mutation.

Success marker:

```text
MASTERV_DESKTOP_LIC_1_CONTRACT_PASS
```

The contract is attached to the existing `test:post-exit-1` CI path. No workflow is added.

## 9. Verification state

At implementation commit time:

```text
SOURCE_IMPLEMENTATION              IMPLEMENTED_UNVERIFIED
DETERMINISTIC_CONTRACT             PENDING_CI
DESKTOP_BUILD_REGRESSION           PENDING_CI
WINDOWS_RUNTIME_REGRESSION         PENDING_CI
LIVE_TAURI_TO_DENO_SANDBOX_E2E     NOT_EXECUTED
SANDBOX_CREDENTIAL_CLEANUP         DEFERRED
PRODUCTION_POLAR_MUTATION          NOT_AUTHORIZED
PRODUCTION_SIGNING_MUTATION        NOT_AUTHORIZED
RELEASE_PUBLICATION                NOT_AUTHORIZED
```

Live Sandbox Desktop E2E must not be fabricated from deterministic fixtures. It is a separate later verification step using the already-deployed Sandbox Gateway/Polar state, without placing raw Product Key, Device Credential, or Session Credential into repository evidence.

## 10. Known residual outside this stage

The existing Device Credential itself has a longer expiry than the Session Credential. This stage refreshes only short-lived sessions through the existing `/v1/session` contract. Long-horizon Device Credential renewal/rotation remains a separate concern and is not silently redesigned here.
