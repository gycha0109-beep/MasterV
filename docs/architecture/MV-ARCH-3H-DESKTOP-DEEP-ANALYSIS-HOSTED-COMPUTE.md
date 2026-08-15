# MV-ARCH-3H — Desktop Deep Analysis Hosted Compute Boundary

Status: **STATIC_VERIFIED / CONFIG_BLOCKED / NOT ACTIVATED**

## 1. Goal

MV-ARCH-3H moves single-video Deep Analysis compute behind the authenticated hosted boundary without placing Gemini provider credentials or provider/model authority in the Desktop runtime.

The Desktop sends a public YouTube URL only. The hosted Edge Function canonicalizes the source, resolves the hosted Gemini credential/model, invokes the canonical Deep Analysis implementation, validates the result, derives deterministic metrics, and returns the result without automatically persisting it.

This stage does **not** migrate Background Batch, Product Truth, Reference Library persistence, the Web cache/budget/replay runtime, signing, release, or activation.

## 2. Canonical Deep Analysis source boundary

The pre-existing Web analyzer mixed the canonical provider/prompt/schema/validation path with Node environment resolution in `lib/gemini.ts`.

MV-ARCH-3H first split the provider-independent runtime boundary:

- `lib/gemini-deep-core.ts`
  - canonical `ANALYSIS_PROMPT`
  - `GoogleGenAI` provider interaction
  - `videoAnalysisJsonSchema`
  - `validateVideoAnalysis()`
  - `analyzeYouTubeVideoWithKey(url, { api_key, model })`
  - no `process.env`
- `lib/gemini.ts`
  - remains the Web runtime wrapper
  - resolves `process.env.GEMINI_API_KEY`
  - resolves `process.env.GEMINI_MODEL`
  - delegates to the canonical core

Prerequisite commits:

```text
8f857e47a7fbe0858c476b8e3895ce371d5cf9b1
refactor(arch3h): extract runtime portable Gemini deep analyzer

99dcb2fd99bf21be668a2d7fd2e647311e5e6c47
refactor(arch3h): route web deep analysis through portable core
```

The immutable hosted source pin is:

```text
99dcb2fd99bf21be668a2d7fd2e647311e5e6c47
```

Pinned Git blobs:

```text
lib/gemini-deep-core.ts      d11af538abff998e924120dbc163c8fac939b24c
lib/analysis-validation.ts   7b027bc24f5af757c5c6634e649de18f315279ff
lib/gemini-error.ts          4bec006dc0a17541eb2e8f2f85f9b08d19434d63
```

The hosted import map also pins the Gemini SDK exactly:

```text
npm:@google/genai@2.17.1
```

Prerequisite CI:

- run: `31892137608` (#697)
- canonical prerequisite head: `99dcb2fd99bf21be668a2d7fd2e647311e5e6c47`
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS

## 3. Hosted operation and trust boundary

`masterv-api-boundary` adds:

```json
{
  "operation": "youtube_deep_analysis",
  "url": "https://www.youtube.com/watch?v=..."
}
```

The request does not carry:

- `GEMINI_API_KEY`
- Gemini model authority
- `workspace_id`
- service-role authority
- an analysis payload
- a persistence command

The Edge Function:

1. requires an authenticated JWT,
2. validates and canonicalizes the public YouTube URL,
3. reads `Deno.env.get("GEMINI_API_KEY")`,
4. optionally reads hosted `Deno.env.get("GEMINI_MODEL")`,
5. invokes the canonical Deep Analysis core,
6. validates the returned analysis,
7. computes deterministic `deriveVideoMetrics()` output,
8. returns the analysis and metrics with no persistence write.

Successful hosted authority markers are:

```text
provider_authority    = hosted-secret
compute_authority     = hosted-deep-analysis
analysis_tier         = deep
persistence_authority = none
```

Diagnostics require:

```text
gemini_requests    = 1
persistence_writes = 0
```

## 4. Capability separation

The legacy Desktop/Web migration marker remains deliberately unchanged:

```text
analyze = false
```

MV-ARCH-3H introduces a separate capability pair:

```text
deep_analysis_route = true
deep_analysis       = true only when the hosted GEMINI_API_KEY exists
```

This avoids redefining earlier lifecycle semantics. `analyze=false` continues to mean the old local/Next analyze capability was not made a Desktop runtime dependency. `deep_analysis` independently describes the new hosted-compute route.

## 5. Desktop surface

Desktop adds an authenticated Deep Analysis panel.

The Desktop:

- accepts a public YouTube URL,
- sends only `{ operation: "youtube_deep_analysis", url }`,
- displays the hosted model/source identity,
- renders the validated summary/structure/hook and selected deterministic metrics,
- does not automatically save the analysis to Reference Library.

A small pre-app script (`desktop/deep-analysis.js`) observes the already authenticated hosted-boundary request and keeps the bearer token only in its module closure/process memory. It does not write the token to `window`, `localStorage`, disk, or persistent application state.

Logout clears:

- captured access token,
- input URL,
- analysis result,
- model/source display,
- runtime counters.

Desktop does not directly call Gemini provider endpoints and does not call the local Next `/api/analyze` route.

## 6. Explicit non-migrations

MV-ARCH-3H does not migrate or imply migration of:

- Background Batch execution
- Product Truth
- automatic Reference Library persistence
- `lib/analysis-service.ts` cache/budget/replay orchestration
- local Next `/api/analyze` as a Desktop dependency
- service-role database authority
- provider credential storage in Desktop
- provider credential storage in Windows CI
- release/signing/updater/activation

## 7. Implementation and regression contracts

Implementation commit:

```text
2c5e3692e5f02b8220ee16c94419ac213fff794f
feat(arch3h): add hosted Deep Analysis desktop boundary
```

As the Edge Function became a multi-operation boundary, two older static contracts were corrected so they test the operation they actually own instead of rejecting another operation's provider credential globally:

```text
c4865e76efb5b0111292011247e466d0637c3e3d
3F Reference compiler provider isolation scoped to compileReferenceWorkflow

9a7b796017ae93abfef71b65d290f9d38674132b
3G YouTube discovery Gemini isolation scoped to discoverYouTube
```

This does not weaken 3F or 3G. It preserves these invariants:

- 3F Reference workflow remains independent of YouTube/Gemini provider compute.
- 3G metadata discovery remains independent of Gemini Deep Analysis.
- 3H Deep Analysis receives its own independent hosted-compute contract.

New static contract:

```text
scripts/hosted-deep-analysis-contract.mjs
MASTERV_HOSTED_DEEP_ANALYSIS_CONTRACT_PASS
```

It verifies canonical source pinning, hosted-only provider authority, request shape, model authority, no service role, no automatic persistence, Desktop secret isolation, no local Next analyze dependency, logout clearing, package wiring, and CI wiring.

## 8. Static verification

Implementation/static authoritative head before this document:

```text
9a7b796017ae93abfef71b65d290f9d38674132b
```

CI:

- run: `31892634119` (#703)
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS

`validate` includes all existing contracts, the new hosted Deep Analysis contract, production Next build, and production dependency audit.

The Linux Desktop job includes all 3D/3E/3F/3G/3H static contracts and Tauri release build.

## 9. Live hosted authority

Observed live hosted function after exact repository source deployment:

```text
slug        = masterv-api-boundary
version     = 6
status      = ACTIVE
verify_jwt  = true
import_map  = true
ezbr_sha256 = d67fdc8413f63bd595a4866b30ed4976271b8035932991d66d8df4d8f3bba769
```

The first 3H deployment was deliberately not accepted as lifecycle evidence because its source formatting differed from the repository file. Version 6 was then redeployed from the exact repository source and is the hosted authority for this stage.

Deployment is verification infrastructure. It is not Desktop release or product activation.

## 10. Actual Windows runtime observation

Actual native Windows Tauri/WebView2 verification at run `31892634119` (#703) produced successful regressions for 3D through 3G and a truthful configuration-blocked result for 3H.

3H evidence:

```text
status                       = MASTERV_WINDOWS_DEEP_ANALYSIS_CONFIG_BLOCKED
webview2_runtime_version     = 151.0.4129.72
cdp_browser                  = Edg/151.0.4129.72
attach_mode                  = true
surface                      = desktop
auth_status                  = AUTHENTICATED
hosted_api_status            = CONNECTED
hosted_route                 = true
hosted_provider_configured   = false
provider_authority           = hosted-secret
compute_authority            = hosted-deep-analysis
analysis_tier                = deep
persistence_authority        = none
desktop_provider_credentials = false
client_gemini_api_delta      = 0
local_next_analyze_requests  = 0
persistence_writes           = 0
logout_clear                 = true
```

Lifecycle blocker:

```text
GEMINI_API_KEY missing from Supabase Edge Function environment
```

This proves the native Desktop surface, authentication, hosted route, provider-secret isolation, non-persistence boundary, and blocked-state behavior. It does **not** prove a real hosted Gemini Deep Analysis call.

Therefore MV-ARCH-3H is **not** `RUNTIME_VERIFIED`.

## 11. 3D–3G runtime regressions in the same run

The same Windows job produced:

```text
MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS
MASTERV_WINDOWS_YOUTUBE_DISCOVERY_RUNTIME_PASS
```

The 3G discovery regression still showed:

```text
candidate_count          = 12
youtube_api_requests     = 2
client_youtube_api_delta = 0
client_hosted_function_delta = 1
local_next_discovery_requests = 0
gemini_requests          = 0
```

This confirms the new 3H route did not pull Deep Analysis compute into the 3G metadata-only operation.

## 12. Runtime evidence artifact and cleanup

Run `31892634119` Windows artifact:

```text
ID     = 9249020014
name   = masterv-windows-desktop-smoke
size   = 1,480,279 bytes
SHA256 = 368469d013d7e3cef0c99e8e02c23e20153491b1caac5f84713d9b334da67b54
```

The artifact contains 3D/3E/3F/3G evidence, the 3H blocked-state JSON/screenshot, and the unsigned NSIS smoke installer.

Independent database cleanup after the run:

```text
remaining MV3D fixtures = 0
remaining MV3E fixtures = 0
remaining MV3F fixtures = 0
```

3G and 3H create no Reference Library fixtures.

## 13. Exact gate to RUNTIME_VERIFIED

MV-ARCH-3H may be promoted to `RUNTIME_VERIFIED` only after all of the following are true:

1. `GEMINI_API_KEY` exists in the Supabase Edge Function hosted environment.
2. `GEMINI_API_KEY` remains absent from Desktop source, Desktop bundle, and Windows CI environment.
3. Hosted GET capability reports `deep_analysis_route=true` and `deep_analysis=true`.
4. The authoritative branch head runs an actual Deep Analysis through the native Windows Tauri/WebView2 surface.
5. Runtime output is `MASTERV_WINDOWS_DEEP_ANALYSIS_RUNTIME_PASS`.
6. Hosted diagnostics show `gemini_requests=1`.
7. Desktop direct Gemini provider request delta remains `0`.
8. Desktop hosted-function request delta for the analysis remains exactly `1`.
9. Local Next `/api/analyze` request delta remains `0`.
10. Direct YouTube Data API request delta for Deep Analysis remains `0`.
11. Persistence writes remain `0`.
12. 3D/3E/3F/3G native runtime regressions remain green.
13. Logout clears the Deep Analysis runtime state.
14. Documentation-inclusive exact-head CI succeeds.

Until this gate is met, the authoritative lifecycle state is:

**STATIC_VERIFIED / CONFIG_BLOCKED / NOT ACTIVATED**

## 14. Non-activation boundary

MV-ARCH-3H does not authorize:

- making PR #1 ready
- merging PR #1
- signing
- release
- updater introduction
- Desktop activation
- moving provider credentials into Desktop or GitHub CI
- Background Batch migration
- Product Truth migration
- automatic analysis persistence

Do not advance the next architecture stage around this blocker. Configure the hosted Gemini secret, rerun the exact 3H runtime gate, and only then consider the subsequent stage.
