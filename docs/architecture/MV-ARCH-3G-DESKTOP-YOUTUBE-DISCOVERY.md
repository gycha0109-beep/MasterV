# MV-ARCH-3G — Desktop YouTube Discovery Hosted Boundary

Status: **STATIC_VERIFIED / CONFIG_BLOCKED / NOT ACTIVATED**

## 1. Goal

MV-ARCH-3G moves YouTube metadata candidate discovery behind the authenticated hosted boundary without placing the YouTube Data API credential in the Desktop runtime.

This stage does **not** migrate Deep Analysis, progressive/coarse analysis orchestration, background batch execution, Product Truth, or provider credentials into Desktop.

## 2. Canonical discovery source boundary

The existing YouTube discovery implementation previously mixed metadata candidate discovery with progressive coarse-analysis orchestration. MV-ARCH-3G first split the provider/candidate metadata logic into a runtime-portable canonical module:

- `lib/youtube-discovery-core.ts`
- prerequisite commit: `b8a0d4dd34e5080919d75b23b08c12d3e2293efb`

The existing Web wrapper remains `lib/youtube-discovery.ts` and keeps server-side environment-key resolution plus `discoverYouTubeProgressive()` orchestration. The hosted function imports the exact canonical candidate-discovery source from the immutable prerequisite commit rather than copying provider logic.

The canonical pin contract verifies exact Git blob identity for:

- `lib/youtube-discovery-core.ts`
- `lib/discovery.ts`
- `lib/source-identity.ts`
- `lib/tiered-analysis.ts`

C1 prerequisite CI:

- commit: `b8a0d4dd34e5080919d75b23b08c12d3e2293efb`
- run: `31859021305` (#685)
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS

## 3. Hosted route

`supabase/functions/masterv-api-boundary` retains the MV-ARCH-3F canonical Reference Compare/Evidence operation and adds:

```json
{
  "operation": "youtube_discovery",
  "query": "...",
  "options": {}
}
```

The caller may send only bounded discovery options. Unknown option keys are rejected.

The provider credential is read only from:

```text
Deno.env.get("YOUTUBE_DATA_API_KEY")
```

The route does not accept a provider credential in the request body, Desktop public config, or Windows CI environment.

A successful response is explicitly identified as:

```text
provider_authority = hosted-secret
analysis_authority = metadata-only
```

GET capability semantics distinguish deployment from readiness:

```text
youtube_discovery_route = true
youtube_discovery       = true only when the hosted provider secret exists
```

## 4. Desktop surface

Desktop now includes an authenticated YouTube Search / Discovery surface.

Desktop sends:

- query
- bounded region/language/duration/search-limit options

Desktop does not send or contain:

- `YOUTUBE_DATA_API_KEY`
- `GEMINI_API_KEY`
- service role
- workspace authority
- raw analysis payload

Desktop renders metadata only:

- title
- creator
- duration
- view count when available
- publication time when available
- canonical YouTube URL

Remote provider thumbnails are deliberately not rendered. Tauri CSP was not expanded with Google/YouTube image origins.

Desktop also does not call the local Next route `/api/discover/youtube` and does not call `googleapis.com/youtube` directly.

Logout removes Search/Discovery state and query/result content from process memory.

## 5. Deep Analysis non-migration boundary

MV-ARCH-3G deliberately stops at candidate metadata discovery.

The following remain outside this stage:

- `discoverYouTubeProgressive()` coarse-analysis orchestration
- Gemini analysis
- Deep Analysis compute placement
- background batch
- Product Truth
- persistence of discovered candidates

This prevents a metadata search migration from implicitly becoming an analysis-compute migration.

## 6. Static verification

Code-head implementation commit:

`a721455f2a6614c0972f75e9b6e8428783eeff34`

Code-head CI:

- run: `31859400550` (#687)
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS

Static gates include:

- existing YouTube discovery regression contract
- existing Search UX regression contract
- MV-ARCH-3D Reference Library contract
- MV-ARCH-3E Detail/Compare contract
- MV-ARCH-3F hosted canonical Reference compiler contract
- new hosted YouTube discovery source-pin/security contract
- production Next build
- Linux Tauri build
- production dependency audit

## 7. Windows runtime observation

Actual Windows Tauri/WebView2 verification at code head used:

- run: `31859400550` (#687)
- WebView2 runtime: `151.0.4129.72`
- CDP browser: `Edg/151.0.4129.72`
- test-only debugger attach: true

MV-ARCH-3D, 3E, and 3F runtime regression smokes all passed before the 3G smoke.

The 3G smoke produced:

```text
status                       = MASTERV_WINDOWS_YOUTUBE_DISCOVERY_CONFIG_BLOCKED
surface                      = desktop
auth_status                  = AUTHENTICATED
hosted_api_status            = CONNECTED
hosted_route                 = true
hosted_provider_configured   = false
provider_authority           = hosted-secret
desktop_provider_credentials = false
analysis_authority           = metadata-only
client_youtube_api_delta     = 0
local_next_discovery_requests = 0
gemini_requests              = 0
logout_clear                 = true
```

Lifecycle blocker:

```text
YOUTUBE_DATA_API_KEY missing from Supabase Edge Function environment
```

This proves the deployed/authenticated boundary and the Desktop secret isolation/config-blocking behavior, but it does **not** prove an actual hosted YouTube provider search.

Therefore MV-ARCH-3G is not `RUNTIME_VERIFIED`.

## 8. Runtime evidence artifact

Code-head artifact:

- ID: `9240132212`
- name: `masterv-windows-desktop-smoke`
- run: `31859400550`
- head: `a721455f2a6614c0972f75e9b6e8428783eeff34`
- digest: `sha256:264aabcd6b3a7664e4ced939c810f57b736e10db50f3ef22e503d7352a216d11`

The artifact includes the blocked-state screenshot and runtime evidence JSON.

## 9. Live hosted authority and cleanup

Observed live hosted function after C2 deployment:

```text
slug       = masterv-api-boundary
version    = 3
status     = ACTIVE
verify_jwt = true
import_map = true
```

The live function deployment is verification infrastructure and does not activate or release the Desktop product.

Independent database cleanup check for run `31859400550`:

```text
remaining MV3D fixtures = 0
remaining MV3E fixtures = 0
remaining MV3F fixtures = 0
```

MV-ARCH-3G creates no Reference Library database fixture.

## 10. Required gate to reach RUNTIME_VERIFIED

MV-ARCH-3G may be promoted to `RUNTIME_VERIFIED` only after all of the following are true:

1. `YOUTUBE_DATA_API_KEY` exists in the Supabase Edge Function hosted environment.
2. Desktop Windows CI still contains no YouTube provider credential.
3. The exact authoritative branch head runs an actual hosted YouTube search through the real Tauri/WebView2 surface.
4. Runtime evidence shows at least one hosted YouTube provider request.
5. Desktop direct `googleapis.com/youtube` request delta remains zero.
6. Local Next discovery request delta remains zero.
7. Gemini request count remains zero for this metadata-only stage.
8. Previous 3D/3E/3F runtime regressions remain green.
9. Documentation-inclusive exact-head CI succeeds.

Until that gate is met, the authoritative lifecycle state is:

**STATIC_VERIFIED / CONFIG_BLOCKED / NOT ACTIVATED**

## 11. Non-activation boundary

MV-ARCH-3G does not authorize:

- making PR #1 ready
- merging PR #1
- Desktop release or activation
- signing
- updater introduction
- provider secret placement in Desktop or CI
- Deep Analysis migration
- Product Truth migration

The next architecture stage should not bypass the unresolved hosted provider-secret gate. Resolve and re-run MV-ARCH-3G first; only after a real provider runtime pass should a subsequent Deep Analysis hosted-compute boundary be advanced.
