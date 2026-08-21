# MV-ARCH-3I — Desktop Product Truth / Production Guidance Hosted Boundary

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

## 1. Goal

MV-ARCH-3I connects the native Desktop Deep Analysis result to the existing canonical Product Truth interpretation and single-video production guidance pipeline without placing Gemini credentials, model authority, semantic interpretation authority, or persistence authority in the Desktop runtime.

The intended Desktop flow is:

```text
public YouTube URL
  -> 3H hosted Deep Analysis
  -> validated analysis held only in Desktop process memory
  -> user-entered raw Product Truth
  -> 3I authenticated hosted boundary
  -> server-side analysis validation
  -> server-side deterministic metric derivation
  -> canonical reference mechanism derivation
  -> hosted Product Truth semantic matcher when required
  -> canonical single-video production guide compiler
  -> Desktop production guidance UI
```

This stage does **not** migrate Background Batch, does not automatically persist the Deep Analysis result or Production Guidance result, and does not authorize signing, release, updater introduction, merge, or Desktop activation.

## 2. Why 3I is Product Truth / Production Guidance

After MV-ARCH-3H, the Desktop roadmap had the following remaining product-facing surface before Background Batch:

```text
Product Truth / Production Guidance
```

The existing Web application already had a Product Truth semantic matcher and canonical single-video production compiler. Therefore 3I migrates that boundary rather than introducing a second interpretation implementation in Desktop.

Background Batch remains explicitly separate. Earlier 1H work demonstrated a separate background execution design and lifecycle, and 3I does not bypass or redefine that boundary.

## 3. Canonical Product Truth source split

The pre-existing Web Product Truth interpreter mixed canonical semantic matching with Node environment resolution in `lib/product-truth-interpreter.ts`.

MV-ARCH-3I first extracted a runtime-portable canonical core:

- `lib/product-truth-interpreter-core.ts`
  - canonical semantic matching prompt
  - `GoogleGenAI` provider interaction
  - `productTruthInterpretationJsonSchema`
  - raw fact preservation validation
  - `interpretProductTruthAgainstReferenceWithKey()`
  - no `process.env`
- `lib/product-truth-interpreter.ts`
  - remains the Web runtime wrapper
  - resolves `process.env.GEMINI_API_KEY`
  - resolves `GEMINI_PRODUCT_TRUTH_MODEL || GEMINI_MODEL`
  - delegates to the canonical core

Prerequisite commit:

```text
9ded32bb278f6f873166ea3d0ec6cb484122becf
refactor(arch3i): extract runtime portable Product Truth interpreter
```

The immutable hosted source pin for 3I canonical Product Truth / Production Guidance code is:

```text
9ded32bb278f6f873166ea3d0ec6cb484122becf
```

Pinned Git blobs:

```text
lib/product-truth-interpreter-core.ts  b0f81590547f70d73de1fe4deeeb11c0df966f05
lib/product-truth-interpretation.ts    00f9934f69ff5a461cf77ca8f85c05c6183aa047
lib/reference-adaptation.ts            95d5650b93e29ff8d87864da3a3319be8028b7a8
lib/single-video-production.ts         c70e6112e7face6a1b87d02ff10b06f5585155d2
```

The hosted Gemini SDK remains pinned exactly:

```text
npm:@google/genai@2.17.1
```

Prerequisite CI:

- run: `31896172839` (#711)
- prerequisite head: `9ded32bb278f6f873166ea3d0ec6cb484122becf`
- conclusion: `SUCCESS`

## 4. Hosted operation

`masterv-api-boundary` adds the authenticated operation:

```json
{
  "operation": "production_guidance",
  "analysis": { "...": "current validated Deep Analysis payload" },
  "product_truth": {
    "product_name": "...",
    "verified_facts": "...",
    "target_customer": "...",
    "price_offer": "..."
  }
}
```

Only the following Product Truth fields are accepted:

```text
product_name      <= 160 chars
verified_facts    <= 4000 chars
target_customer   <= 500 chars
price_offer       <= 500 chars
```

Unknown Product Truth fields are rejected.

The Desktop request does not carry:

- `GEMINI_API_KEY`
- `YOUTUBE_DATA_API_KEY`
- Gemini model authority
- `workspace_id`
- caller-supplied semantic interpretation
- caller-supplied reference mechanisms
- caller-supplied derived metrics
- service-role authority
- persistence command
- Background Batch command

## 5. Hosted trust and computation boundary

The 3I hosted operation performs the following sequence:

1. requires an authenticated JWT,
2. validates the submitted analysis with `validateVideoAnalysis()`,
3. validates and bounds the raw Product Truth fields,
4. re-derives `deriveVideoMetrics()` server-side,
5. runs `compileSingleVideoProductionGuide()` to derive canonical reference mechanisms,
6. when semantic interpretation is required **and at least one reference mechanism exists**, reads the hosted Gemini credential/model and invokes the canonical Product Truth matcher,
7. recompiles the canonical production guide with the returned interpretation,
8. returns the production guide without persistence or Background Batch execution.

Successful authority markers are:

```text
provider_authority           = hosted-secret
compute_authority            = hosted-production-guidance
product_truth_authority      = user-input-raw
reference_analysis_authority = validated-hosted-result-transit
metrics_authority            = server-derived
persistence_authority        = none
```

Diagnostics are truthful to actual execution:

```text
gemini_requests           = 0 or 1
persistence_writes        = 0
background_batch_requests = 0
```

`gemini_requests=1` is emitted only when the Product Truth semantic matcher actually invokes Gemini. A deterministic/no-mechanism path is not falsely counted as a provider request.

## 6. Important authority caveat

`reference_analysis_authority = validated-hosted-result-transit` describes the **intended native Desktop flow**: a 3H hosted Deep Analysis result is retained only in the Desktop process and forwarded to 3I.

The 3I Edge operation does enforce the canonical analysis schema before using the payload, but this stage does **not** add a cryptographic attestation, signed result token, server-side result handle, or persistence lookup proving that an arbitrary direct API caller obtained that exact analysis from 3H.

Therefore 3I proves:

- native Desktop 3H -> 3I transit behavior,
- server-side schema validation,
- server-side metric/mechanism authority,
- hosted semantic matching authority,
- Desktop credential isolation.

It does not claim cryptographic provenance for arbitrary callers outside that intended Desktop flow.

## 7. Product Truth authority

The user's raw text is the sole product-fact authority.

The canonical semantic matcher may understand misspellings, slang, abbreviations, or informal wording for the purpose of matching a fact to a reference mechanism, but it may not strengthen or invent the fact.

Examples of prohibited strengthening include turning informal water-resistance wording into an invented IP rating, inventing dimensions from portability wording, or creating unsupported efficacy claims.

The canonical core validates that matched facts are copied from the provided source facts instead of being newly generated factual assertions.

## 8. Desktop surface

The native Desktop adds a Product Truth / Production Guidance panel after the current Deep Analysis result exists.

Inputs:

- product name
- target customer
- price / offer
- verified facts / specifications

The current 3H `analysis` object is held in the pre-app script closure as `latestAnalysis` and is not written to:

- `window`
- `localStorage`
- disk
- persistent application state

Changing the Deep Analysis URL clears stale Product Truth / guidance state. Logout clears:

- captured access token,
- current Deep Analysis result,
- Product Truth inputs,
- generated Production Guidance output,
- model / runtime counters.

Desktop output includes:

- direction summary,
- recommended production flow,
- asset groups,
- critical warnings,
- four independent prompt actions:
  - script
  - shooting
  - assets
  - editing

The Desktop does not directly call Gemini and does not call the local Next Product Truth or Analyze routes.

## 9. Capability contract

The legacy Desktop marker remains:

```text
analyze = false
```

3I adds independent hosted capabilities:

```text
product_truth_route      = true
product_truth            = true when hosted GEMINI_API_KEY exists
production_guidance_route = true
production_guidance       = true when hosted GEMINI_API_KEY exists
```

This does not redefine 3H or earlier lifecycle markers.

## 10. Implementation commits and verification corrections

Primary implementation:

```text
d048d790a7e088f94e24ccdc8314ca7d00d21fb5
feat(arch3i): add hosted Product Truth production guidance boundary
```

During native verification, three verification-quality issues were found and corrected without weakening owned invariants.

### 10.1 3D regression ownership

The old 3D smoke asserted that Product Truth must remain `PENDING`. Once 3I legitimately made the capability `READY`, the 3D job failed before reaching 3I even though the Reference Library behavior itself was correct.

Correction:

```text
c1de7bc108796c03ee5405e692ca623148bf24a8
test(arch3i): scope 3D runtime regression to owned capability
```

3D still verifies its Reference Library, RLS, projection, delete, cleanup, logout, credential-isolation, and legacy Next Analyze invariants. Later independent capability state is observed rather than owned by 3D.

### 10.2 Exact semantic matcher diagnostics

The portable matcher returns deterministically without Gemini when there are no reference mechanisms. The Edge initially could have recorded `gemini_requests=1` on that path even though no provider request occurred.

Correction:

```text
398cc8ffa4bf40ef5a22b33a6ca51ef4902f07ba
fix(arch3i): report semantic matcher requests exactly
```

The hosted boundary now invokes/counts the semantic matcher only when:

```text
interpretation_required = true
AND
reference_mechanisms.length > 0
```

### 10.3 Duplicate capability probe

The 3I pre-app script initially observed the main Desktop capability GET and then issued a second capability GET. On a cold hosted runtime that extra request could land inside the 3F measurement window and falsely make 3F appear to perform two hosted transports.

Correction:

```text
09c4a9c01468d05bc7a68068975775a06805e2e4
fix(arch3i): reuse hosted capability probe response
```

The pre-app script now clones and reuses the already-occurring successful hosted capability GET response. It falls back to its own probe only when the observed response cannot establish the capability contract.

This restores the strict 3F invariant:

```text
client_hosted_function_delta = 1
```

without loosening the 3F test.

## 11. Static contract

New static contract:

```text
scripts/hosted-production-guidance-contract.mjs
MASTERV_HOSTED_PRODUCTION_GUIDANCE_CONTRACT_PASS
```

It verifies:

- immutable canonical source pins and Git blobs,
- portable Product Truth core / Web wrapper separation,
- exact Gemini SDK pin,
- authenticated hosted `production_guidance` operation,
- server-side analysis validation,
- server-side deterministic metrics,
- canonical production guide compiler use,
- hosted-only Gemini credential/model authority,
- raw Product Truth authority,
- no caller interpretation/mechanism/metric/provider authority,
- no service-role introduction,
- no automatic persistence,
- no Background Batch migration,
- Desktop UI/request/authority markers,
- no Desktop Gemini/local Next/localStorage authority,
- logout clearing,
- package and CI wiring.

The contract runs in both `validate` and `desktop-shell`.

## 12. Live hosted authority

Observed hosted function for the verified 3I runtime:

```text
slug        = masterv-api-boundary
version     = 9
status      = ACTIVE
verify_jwt  = true
import_map  = true
ezbr_sha256 = d7ce45bdd5491965bc8d190ba852216c3609dbb64273e1ab733413beafaca860
```

The 3I hosted source uses the immutable 9ded canonical imports. The later `09c4a9c...` code-head correction changed only Desktop capability-probe reuse and therefore did not require another Edge source version.

This hosted deployment is runtime verification infrastructure. It is not a Desktop release or activation.

## 13. Authoritative code-head verification

Authoritative implementation code head before this document:

```text
09c4a9c01468d05bc7a68068975775a06805e2e4
```

CI:

```text
run        = 31898018372
run number = #719
conclusion = SUCCESS
```

The same run passed:

- `validate`
- `desktop-shell`
- `desktop-windows-runtime`

and included the 3I static contract, production Next build, production dependency audit, native Tauri build, all 3D-3I native runtime checks, and unsigned NSIS smoke packaging.

## 14. Native Windows 3I runtime evidence

Run #719 produced:

```text
status                       = MASTERV_WINDOWS_PRODUCTION_GUIDANCE_RUNTIME_PASS
webview2_runtime_version     = 151.0.4129.72
cdp_browser                  = Edg/151.0.4129.72
attach_mode                  = true
surface                      = desktop
auth_status                  = AUTHENTICATED
hosted_api_status            = CONNECTED
product_truth_capability     = READY
production_guidance_capability = READY
provider_authority           = hosted-secret
compute_authority            = hosted-production-guidance
product_truth_authority      = user-input-raw
reference_analysis_authority = validated-hosted-result-transit
metrics_authority            = server-derived
persistence_authority        = none
model                        = gemini-3.6-flash
gemini_requests              = 1
client_gemini_api_delta      = 0
client_hosted_function_delta = 1
local_next_product_truth_requests = 0
local_next_analyze_requests  = 0
client_youtube_api_delta     = 0
desktop_provider_credentials = false
persistence_writes           = 0
background_batch_requests    = 0
background_batch_migrated    = false
prompt_actions               = 4
logout_clear                 = true
screenshot                   = production-guidance.png
```

This run exercised a Product Truth input with verified facts and actual reference mechanisms, so the semantic matcher legitimately made exactly one hosted Gemini request.

## 15. 3D-3H regressions in the same run

The same exact-head Windows job produced:

```text
MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS
MASTERV_WINDOWS_YOUTUBE_DISCOVERY_RUNTIME_PASS
MASTERV_WINDOWS_DEEP_ANALYSIS_RUNTIME_PASS
MASTERV_WINDOWS_PRODUCTION_GUIDANCE_RUNTIME_PASS
```

Important retained invariants include:

```text
3F client_hosted_function_delta = 1
3F raw analysis fetch           = false
3F evidence_rule_count          = 11

3G youtube_api_requests         = 2
3G client_youtube_api_delta     = 0
3G client_hosted_function_delta = 1
3G gemini_requests              = 0

3H gemini_requests              = 1
3H client_gemini_api_delta      = 0
3H client_hosted_function_delta = 1
3H local_next_analyze_requests  = 0
3H persistence_writes           = 0
```

This confirms 3I did not collapse Search/Discovery, canonical Reference compilation, Deep Analysis, and Product Truth/Production Guidance into one client-side authority.

## 16. Runtime artifact and database cleanup

Run #719 artifact:

```text
ID     = 9250435211
name   = masterv-windows-desktop-smoke
size   = 1,591,639 bytes
SHA256 = 6920d6e1dbd96434928dc7317a0f29b2eb5ef3da4bfa4f07ed8bd8c67c0c8930
head   = 09c4a9c01468d05bc7a68068975775a06805e2e4
expired = false
```

The artifact includes the Product Truth / Production Guidance runtime evidence and screenshot together with 3D-3H regression evidence and the unsigned NSIS smoke installer.

Independent database cleanup after run #719:

```text
remaining MV3D fixtures = 0
remaining MV3E fixtures = 0
remaining MV3F fixtures = 0
```

3G, 3H, and 3I create no Reference Library fixtures in these runtime smokes.

## 17. Lifecycle decision

The 3I gate is satisfied for the implemented native Desktop flow:

1. Product Truth / Production Guidance hosted routes exist and report ready.
2. Product Truth raw text remains the user fact authority.
3. Gemini credential/model authority remains hosted.
4. Transit analysis is schema-validated server-side.
5. Deterministic metrics are recomputed server-side.
6. Reference mechanisms are derived by the canonical compiler rather than the Desktop.
7. Semantic interpretation is canonical and hosted.
8. Native Windows Tauri/WebView2 produced `MASTERV_WINDOWS_PRODUCTION_GUIDANCE_RUNTIME_PASS`.
9. The measured Product Truth flow issued exactly one hosted function transport.
10. Direct Desktop Gemini requests remained zero.
11. Local Next Product Truth and Analyze requests remained zero.
12. Direct YouTube Data API requests remained zero for the 3I operation.
13. Persistence writes remained zero.
14. Background Batch requests remained zero.
15. Four production prompt actions were rendered.
16. Logout cleared runtime state.
17. 3D-3H native regressions remained green.
18. Strict 3F hosted transport delta remained exactly one.

Therefore the lifecycle state is:

**RUNTIME_VERIFIED / NOT ACTIVATED**

This is not `QUALITY_VALIDATED` and not `ACTIVATED`.

## 18. Explicit non-migrations and non-activation boundary

MV-ARCH-3I does not authorize or imply:

- Background Batch migration
- automatic Reference Library persistence of 3H analysis
- automatic persistence of Production Guidance
- service-role database authority
- Gemini credential storage in Desktop
- Gemini credential storage in Windows CI
- YouTube provider credential storage in Desktop
- Product Truth fact invention
- cryptographic 3H result provenance for arbitrary direct API callers
- making PR #1 ready
- merging PR #1
- signing
- release
- updater introduction
- Desktop activation

Stop after MV-ARCH-3I. Any subsequent architecture stage requires a separate scope decision and lifecycle gate.
