# MV-ARCH-3H — Desktop Deep Analysis Hosted Compute Boundary

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

## 1. Goal

MV-ARCH-3H moves single-video Deep Analysis compute behind the authenticated hosted boundary without placing Gemini provider credentials or provider/model authority in the Desktop runtime.

The Desktop sends a public YouTube URL only. The hosted Edge Function canonicalizes the source, resolves the hosted Gemini credential/model, invokes the canonical Deep Analysis implementation, validates the result, derives deterministic metrics, and returns the result without automatically persisting it.

This stage does **not** migrate Background Batch, Product Truth, Reference Library persistence, the Web cache/budget/replay runtime, signing, release, or activation.

## 2. Canonical Deep Analysis source boundary

The pre-existing Web analyzer mixed the canonical provider/prompt/schema/validation path with Node environment resolution in `lib/gemini.ts`.

MV-ARCH-3H split the provider-independent runtime boundary:

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

Immutable hosted source pin:

```text
99dcb2fd99bf21be668a2d7fd2e647311e5e6c47
```

Pinned Git blobs:

```text
lib/gemini-deep-core.ts      d11af538abff998e924120dbc163c8fac939b24c
lib/analysis-validation.ts   7b027bc24f5af757c5c6634e649de18f315279ff
lib/gemini-error.ts          4bec006dc0a17541eb2e8f2f85f9b08d19434d63
```

Hosted Gemini SDK pin:

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

`masterv-api-boundary` accepts:

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

Successful hosted authority markers:

```text
provider_authority    = hosted-secret
compute_authority     = hosted-deep-analysis
analysis_tier         = deep
persistence_authority = none
```

Required diagnostics:

```text
gemini_requests    = 1
persistence_writes = 0
```

## 4. Capability separation

The legacy Desktop/Web migration marker remains deliberately unchanged:

```text
analyze = false
```

MV-ARCH-3H uses a separate capability pair:

```text
deep_analysis_route = true
deep_analysis       = true when hosted GEMINI_API_KEY exists
```

`analyze=false` continues to mean the old local/Next analyze capability was not made a Desktop runtime dependency. `deep_analysis` independently describes the hosted-compute route.

## 5. Desktop surface

Desktop adds an authenticated Deep Analysis panel.

The Desktop:

- accepts a public YouTube URL,
- sends only `{ operation: "youtube_deep_analysis", url }`,
- displays the hosted model/source identity,
- renders the validated summary/structure/hook and selected deterministic metrics,
- does not automatically save the analysis to Reference Library.

`desktop/deep-analysis.js` observes the already authenticated hosted-boundary request and keeps the bearer token only in its module closure/process memory. It does not write the token to `window`, `localStorage`, disk, or persistent application state.

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

Multi-operation regression contract corrections:

```text
c4865e76efb5b0111292011247e466d0637c3e3d
3F Reference compiler provider isolation scoped to compileReferenceWorkflow

9a7b796017ae93abfef71b65d290f9d38674132b
3G YouTube discovery Gemini isolation scoped to discoverYouTube
```

3G transport-baseline correction after 3H capability probing was introduced:

```text
daca8cdc7835261e6c5116c0db28c4d5ae8fd14c
test(arch3h): settle deep capability before 3G transport baseline
```

This preserves these invariants:

- 3F Reference workflow remains independent of YouTube/Gemini provider compute.
- 3G metadata discovery remains independent of Gemini Deep Analysis.
- 3G discovery still requires exactly one hosted-function request for its search operation.
- 3H Deep Analysis has its own independent hosted-compute contract.

Static contract:

```text
scripts/hosted-deep-analysis-contract.mjs
MASTERV_HOSTED_DEEP_ANALYSIS_CONTRACT_PASS
```

It verifies canonical source pinning, hosted-only provider authority, request shape, model authority, no service role, no automatic persistence, Desktop secret isolation, no local Next analyze dependency, logout clearing, package wiring, and CI wiring.

## 8. Static verification

Implementation/static verification passed before hosted-secret activation:

- run: `31892634119` (#703)
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS

Final pre-unblock exact-head CI:

- run: `31893489684` (#707), attempt 1
- head: `daca8cdc7835261e6c5116c0db28c4d5ae8fd14c`
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS
- 3H result: truthful `CONFIG_BLOCKED` while `GEMINI_API_KEY` was absent

## 9. Live hosted authority

Observed live hosted function:

```text
slug        = masterv-api-boundary
version     = 6
status      = ACTIVE
verify_jwt  = true
import_map  = true
ezbr_sha256 = d67fdc8413f63bd595a4866b30ed4976271b8035932991d66d8df4d8f3bba769
```

Version 6 is deployed from the exact repository source and is the hosted authority for this stage.

`GEMINI_API_KEY` is configured only in the Supabase hosted Edge Function environment. It remains absent from Desktop and GitHub Actions runtime environments.

Deployment is verification infrastructure. It is not Desktop release or product activation.

## 10. Actual Windows runtime verification

After the hosted `GEMINI_API_KEY` was configured, the existing exact-head Windows job from run `31893489684` (#707) was re-run without changing application code.

3H produced:

```text
status                       = MASTERV_WINDOWS_DEEP_ANALYSIS_RUNTIME_PASS
webview2_runtime_version     = 151.0.4129.72
cdp_browser                  = Edg/151.0.4129.72
attach_mode                  = true
surface                      = desktop
auth_status                  = AUTHENTICATED
hosted_api_status            = CONNECTED
deep_analysis_capability     = READY
hosted_provider_configured   = true
provider_authority           = hosted-secret
compute_authority            = hosted-deep-analysis
analysis_tier                = deep
persistence_authority        = none
source_id                    = yt:9hE5-98ZeCg
model                        = gemini-3.6-flash
gemini_requests              = 1
client_gemini_api_delta      = 0
client_hosted_function_delta = 1
local_next_analyze_requests  = 0
client_youtube_api_delta     = 0
desktop_provider_credentials = false
persistence_writes           = 0
product_truth_migrated       = false
background_batch_migrated    = false
logout_clear                 = true
```

This is an actual hosted Gemini Deep Analysis executed from the native Windows Tauri/WebView2 surface.

The result proves:

- hosted provider secret resolution is active,
- the Desktop does not possess or directly use the Gemini credential,
- exactly one hosted-function analysis request is made,
- no local Next analyze route is used,
- no direct YouTube Data API call is introduced by Deep Analysis,
- no automatic persistence occurs,
- Product Truth and Background Batch remain non-migrated,
- logout clears the Deep Analysis runtime state.

MV-ARCH-3H is therefore **RUNTIME_VERIFIED**.

## 11. 3D–3G runtime regressions in the same re-run

The same Windows re-run produced:

```text
MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS
MASTERV_WINDOWS_YOUTUBE_DISCOVERY_RUNTIME_PASS
```

3G evidence remained:

```text
candidate_count               = 12
youtube_api_requests          = 2
client_youtube_api_delta      = 0
client_hosted_function_delta  = 1
local_next_discovery_requests = 0
gemini_requests               = 0
```

This confirms 3H did not pull Deep Analysis compute into the 3G metadata-only operation.

## 12. Runtime evidence artifact and cleanup

Run `31893489684` (#707) re-run Windows artifact:

```text
ID     = 9249513531
name   = masterv-windows-desktop-smoke
size   = 1,499,660 bytes
SHA256 = e1037c5bb063f3649a5ccf5f07bdee9acfbecd1bfb3bd5d5c84b66f26d9f5667
```

The artifact contains 3D/3E/3F/3G evidence, the 3H runtime-pass JSON/screenshot, and the unsigned NSIS smoke installer.

Reference Library smoke fixtures are cleaned by the existing 3D/3E/3F runtime paths. 3G and 3H create no Reference Library fixtures.

## 13. Runtime gate result

The RUNTIME_VERIFIED gate is satisfied:

1. `GEMINI_API_KEY` exists in the Supabase hosted environment — PASS.
2. `GEMINI_API_KEY` remains absent from Desktop source/runtime and Windows CI — PASS.
3. `deep_analysis_route=true` and `deep_analysis=true` — PASS.
4. Native Windows Tauri/WebView2 executes actual hosted Deep Analysis — PASS.
5. `MASTERV_WINDOWS_DEEP_ANALYSIS_RUNTIME_PASS` — PASS.
6. `gemini_requests=1` — PASS.
7. Desktop direct Gemini provider delta `0` — PASS.
8. Hosted-function request delta exactly `1` — PASS.
9. Local Next `/api/analyze` delta `0` — PASS.
10. Direct YouTube Data API delta for Deep Analysis `0` — PASS.
11. Persistence writes `0` — PASS.
12. 3D/3E/3F/3G native regressions green — PASS.
13. Logout clears Deep Analysis state — PASS.
14. Documentation-inclusive exact-head CI — required after this documentation commit before final stage closure.

Current lifecycle state after runtime evidence:

**RUNTIME_VERIFIED / NOT ACTIVATED**

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

After the documentation-inclusive exact-head CI succeeds, stop MV-ARCH-3H. Do not begin the next architecture stage without separate approval.
