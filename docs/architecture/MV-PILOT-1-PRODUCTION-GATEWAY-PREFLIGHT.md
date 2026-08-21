# MV-PILOT-1 — Published Production Gateway Preflight

Status: READ-ONLY PRODUCTION PREFLIGHT — HUMAN PILOT NOT EXECUTED  
Starting repository authority: `080dc72979ba557823a7aa3f63d3140a8ea99d85`  
Production baseline: `v0.1.4`  
Architecture authority: `MV-ARCH-001` / `MASTERV_TARGET_ARCHITECTURE(1).md`

## 1. Purpose

`MV-PILOT-1` has already established:

```text
PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS
HUMAN_PILOT_EXECUTION_CONTRACT = READY
EXTERNAL_HUMAN_PILOT = NOT_EXECUTED
```

Before a real person is asked to enter a Product Key, the immutable published `v0.1.4` binary must be observed directly to determine whether its native Gateway transport is configured.

This is a **read-only preflight**. It must not turn infrastructure absence into a synthetic human-pilot failure and must not mutate production.

## 2. Why this preflight is required

The native Desktop Gateway transport obtains its base URL from:

```text
MASTERV_GATEWAY_BASE_URL
```

using runtime environment authority or a release-build-time `option_env!` value.

The published `v0.1.4` signing/publication provenance does not establish that this value was embedded in the production binary. Source-level architecture closure is not sufficient evidence for the configuration of a specific immutable published installer.

Therefore:

```text
SOURCE_CONTRACT_PASS != PUBLISHED_BINARY_GATEWAY_CONFIGURED
```

and a human must not be asked to consume a Product Key until the published binary is observed directly.

## 3. Authority boundary

The preflight may:

- read public `latest.json`;
- download the immutable public `v0.1.4` installer;
- install it on an ephemeral Windows runner;
- launch the installed Tauri application;
- call only `desktop_gateway_status`;
- record privacy-safe diagnostic evidence;
- uninstall the application from the ephemeral runner.

The preflight must not:

- submit a Product Key;
- call `desktop_gateway_activate`;
- call `/v1/license/activate`;
- create a Polar device activation;
- resume a paid session;
- execute discovery, analysis, or guidance;
- consume Gemini, YouTube, Polar, or Tauri signing credentials;
- create, edit, upload, or replace a GitHub Release;
- deploy or mutate Gateway infrastructure;
- claim that an external human pilot occurred.

```text
PRODUCT_KEY_SUBMITTED = FALSE
POLAR_MUTATION = FALSE
PROVIDER_OPERATION = FALSE
RELEASE_MUTATION = FALSE
EXTERNAL_HUMAN_PILOT_EXECUTED = FALSE
```

## 4. Binary observation

The deterministic Windows observer is:

```text
scripts/desktop-pilot-1-gateway-preflight-windows.mjs
```

It must record the native `desktop_gateway_status` result:

```text
configured
architecture_authority
transport
authorization_product_key_bearer_allowed
device_credential_persisted
session_credential_persisted
```

Expected invariant values independent of whether a URL is configured:

```text
architecture_authority = masterv-gateway
transport = native-https-json
authorization_product_key_bearer_allowed = false
device_credential_persisted = true
session_credential_persisted = false
```

`configured` is an observation, not a value forced by the test.

## 5. Fail-closed interpretation

If the immutable published binary reports:

```text
configured = true
```

then this preflight alone establishes only:

```text
PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = TRUE
```

Gateway reachability and production deployment still require separate evidence before a Product Key is used.

If it reports:

```text
configured = false
```

then the correct result is:

```text
PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE
EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION
MV_PILOT_1 = BLOCKED_ON_PRODUCTION_GATEWAY_CONFIGURATION
```

The observer itself still exits successfully because it has correctly measured the immutable production binary. CI success means **the observation was valid**, not that the human pilot may proceed.

## 6. Evidence

The observer writes:

```text
artifacts/desktop-pilot-1-gateway-preflight/gateway-preflight-evidence.json
```

with status:

```text
MASTERV_PILOT_1_PUBLISHED_GATEWAY_PREFLIGHT_OBSERVED
```

and a decision field of exactly one of:

```text
READY_FOR_GATEWAY_REACHABILITY_PREFLIGHT
BLOCKED_GATEWAY_NOT_CONFIGURED
```

No secret or Product Key material is permitted in this evidence.

## 7. CI integration

The preflight runs inside the existing `desktop-windows-quality` job after the already-governed published `v0.1.4` production first-run acceptance.

Its evidence is uploaded separately as:

```text
masterv-0.1.4-pilot-1-gateway-preflight
```

No new workflow is introduced. Automatic pull-request governance remains:

```text
CI + MV EXIT-3 0.1.3 Clean Cut
```

## 8. Human-call boundary

Do not call an external pilot user merely because this diagnostic PR is green.

A person becomes necessary only after repository and production evidence establishes that the immutable candidate can actually reach the intended production Gateway without exposing a Product Key to automation.

Until then:

```text
EXTERNAL_HUMAN_PILOT = NOT_EXECUTED or BLOCKED_PRE_EXECUTION
```

and never `PASS`.
