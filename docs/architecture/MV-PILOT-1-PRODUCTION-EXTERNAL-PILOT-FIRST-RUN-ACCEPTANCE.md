# MV-PILOT-1 — Production External Pilot & First-Run Acceptance

Status: PILOT GATE CANDIDATE — EXTERNAL HUMAN PILOT NOT STARTED  
Starting repository authority: `fa8c43269cfb7687ea242d65dafd1621d11e0e7e`  
Starting tree: `6e3e8313c50aa9aef4546ab3f91e3c17b7ad11f4`  
Production baseline: `v0.1.4`  
Architecture authority: `MV-ARCH-001` / `MASTERV_TARGET_ARCHITECTURE(1).md`

## 1. Purpose

`MV-ARCH-001-FINAL` is merged and the Target Architecture is repository authority.

```text
MV_ARCH_001 = CLOSED
PRODUCTION_BASELINE = v0.1.4
```

`MV-PILOT-1` begins the post-architecture production acceptance phase. It does not redesign the architecture and does not publish a new release.

This stage has two evidence classes that must not be conflated:

1. **Production First-Run Acceptance** — deterministic Windows verification of the immutable published `v0.1.4` release on a clean external runner.
2. **External Human Pilot** — a real external person installs/activates/uses MasterV and reports first-run usability evidence.

Automated CI is allowed to establish the first class only. It must never fabricate the second.

```text
PRODUCTION_FIRST_RUN_ACCEPTANCE = REQUIRED
EXTERNAL_HUMAN_PILOT = NOT_STARTED
```

When the exact-head automated gates are green, this change may establish:

```text
MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT
```

It does **not** establish `MV_PILOT_1 = CLOSED`.

## 2. Frozen architecture inherited from MV-ARCH-001

The pilot must exercise the architecture that is already closed:

```text
MASTERV_ARCHITECTURE = LOCAL_FIRST_PRODUCT_KEY_DESKTOP
MASTERV_CENTRAL_DB = NONE
MASTERV_AUTH_MODEL = LICENSE_ACTIVATION
MASTERV_PAYMENT_PROVIDER = POLAR
MASTERV_USER_DATA_AUTHORITY = LOCAL_SQLITE
MASTERV_GATEWAY = STATELESS
MASTERV_UPDATE_CHANNEL = INDEPENDENT_TAURI_SIGNED
SUPABASE_RUNTIME_DEPENDENCY = ZERO
```

Pilot work cannot reopen these decisions.

## 3. Production First-Run Acceptance authority

The automated acceptance path must start from the already-published production asset rather than a locally rebuilt or unsigned candidate:

```text
public latest.json
→ v0.1.4
→ public MasterV_0.1.4_x64-setup.exe
→ clean Windows runner
→ install
→ first launch
→ Local SQLite ready
→ Product Key activation surface visible
→ no prior device credential
→ no login/Supabase migration surface
→ updater panel reports LATEST
→ local work data remains usable before activation
→ restart persistence
```

The published release is read-only evidence. The verifier must not:

- build a production-signed artifact;
- use the updater signing private key;
- create or edit a GitHub Release;
- upload or replace a release asset;
- mutate `latest.json`;
- call Polar production mutation APIs;
- submit a Product Key;
- consume Gemini/YouTube/Polar application secrets.

## 4. First-run acceptance criteria

The immutable published `v0.1.4` installer must satisfy all of the following on an ephemeral Windows runner.

### 4.1 Installation and release identity

```text
published manifest version = 0.1.4
published installer URL     = v0.1.4 canonical asset
manifest signature          = present
Windows installed version   = 0.1.4
Desktop release_track       = 0.1.4
```

The existing REL-1C evidence remains the signature-acceptance authority. MV-PILOT-1 does not re-sign or republish the release.

### 4.2 Fresh activation state

On first launch before any Product Key is submitted:

```text
visible auth state               = LOCAL ONLY
Product Key activation form      = present
Product Key input                = empty
email/password login             = absent
legacy migration UI              = absent
remote discovery surface         = not active
persisted device credential      = absent
secure-store backend             = Windows DPAPI
Product Key persisted            = false
session credential persisted     = false
```

Product Key is not persisted.

Session credential remains memory-only.

### 4.3 Local-first behavior before activation

The product must not hold local work data hostage behind licensing.

Required:

```text
Local SQLite authority           = active
workspace                        = local:masterv
remote work-data fallback        = false
Reference Library                = usable before activation
local write                      = PASS
process restart persistence      = PASS
local delete/cleanup             = PASS
```

Local SQLite remains usable before Product Key activation.

This is required by the target architecture's separation between local user-data authority and paid remote AI entitlement.

### 4.4 Browser/session persistence boundary

Fresh first-run and restart must both prove:

```text
localStorage auth material   = none
sessionStorage auth material = none
```

No bootstrap credential may be silently copied into browser persistence.

### 4.5 Update independence

The production updater surface must exist before activation and resolve the current public stable channel as latest:

```text
updater panel                      = present
subscription_independent           = true
updater status                     = LATEST / 최신 버전
```

Updater remains subscription-independent.

### 4.6 Network / credential boundary

The automated first-run verifier must receive none of:

```text
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
POLAR_ACCESS_TOKEN
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

It also does not submit the Product Key form.

Therefore:

```text
No Polar production mutation
No release mutation
```

## 5. Deterministic verifier

The production first-run verifier is:

```text
scripts/desktop-pilot-1-first-run-windows.mjs
```

It downloads only the immutable public production installer and public `latest.json`, installs `v0.1.4` on an ephemeral Windows runner, attaches to the actual installed Tauri/WebView2 application, exercises the local-first first-run path, restarts the application, and writes durable evidence.

Required success marker:

```text
MASTERV_PILOT_1_PRODUCTION_FIRST_RUN_ACCEPTANCE_PASS
```

Required evidence artifact name:

```text
masterv-0.1.4-pilot-1-first-run-acceptance
```

The evidence must explicitly record:

```text
product_key_submitted = false
application_credentials_used = false
signing_credentials_used = false
polar_mutation = false
release_mutation = false
external_human_pilot_executed = false
```

## 6. Deterministic source contract

Repository governance is frozen by:

```text
scripts/desktop-pilot-1-contract.mjs
```

The contract reuses `MV-ARCH-001` closure authority and verifies:

- the production baseline remains `v0.1.4`;
- the new verifier uses the published production asset;
- first-run validation does not call product-key activation;
- no application/signing/Polar production credential is consumed;
- no release mutation command is present;
- first-run verification is integrated into the existing `CI` Windows quality job;
- automatic PR governance remains exactly `CI + MV EXIT-3 0.1.3 Clean Cut`;
- the historical `Desktop External Pilot Readiness` workflow remains manual, unsigned, no-distribution, and no-publication authority.

No new automatic workflow is introduced.

## 7. Historical external-pilot readiness workflow

`.github/workflows/desktop-external-pilot-readiness.yml` is a historical pre-release `0.1.3` readiness workflow.

It is intentionally not rewritten into the current production pilot plane. Its historical contract remains useful as evidence that pre-release pilot distribution/signing/publication was previously kept fail-closed.

Current production first-run authority is the published `v0.1.4` verifier in the existing governed CI.

## 8. External human pilot acceptance

After the deterministic production first-run gate is green and the corresponding PR is merged, a real external pilot may begin.

The human pilot must use the real production `v0.1.4` installer. A future pilot evidence record should capture at minimum:

```text
pilot installation source          published v0.1.4
fresh install completed             yes/no
first launch completed              yes/no
Product Key activation completed    yes/no
device resume after restart         yes/no
local Reference Library usable      yes/no
one entitled remote operation       yes/no
update panel visible                yes/no
update panel state                  LATEST/other
unrecoverable blocker               none/details
```

The human pilot record must not contain:

- the raw Product Key;
- device credential;
- session credential;
- Polar server credential;
- Gemini/YouTube secret;
- signing private key or password.

A real Product Key activation may create a Polar device activation and usage/entitlement evidence. That production mutation belongs to the actual external pilot execution and must be explicitly attributable to the pilot. Automated MV-PILOT-1 CI does not perform it.

## 9. Closure semantics

Automated first-run success permits only:

```text
PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS
EXTERNAL_HUMAN_PILOT = NOT_STARTED
MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT
```

Full stage closure requires separately captured real external pilot evidence:

```text
PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS
EXTERNAL_HUMAN_PILOT = PASS
MV_PILOT_1 = CLOSED
```

No automated runner may substitute for a human pilot or claim human usability acceptance.
