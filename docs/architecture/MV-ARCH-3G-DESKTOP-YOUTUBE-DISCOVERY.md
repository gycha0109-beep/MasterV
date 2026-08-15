# MV-ARCH-3G — Desktop YouTube Discovery Hosted Boundary

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

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

Desktop includes an authenticated YouTube Search / Discovery surface.

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

Desktop does not call the local Next route `/api/discover/youtube` and does not call `googleapis.com/youtube` directly.

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

## 6. Static implementation and verification

Canonical implementation commit:

`a721455f2a6614c0972f75e9b6e8428783eeff34`

Initial implementation CI:

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
- hosted YouTube discovery source-pin/security contract
- production Next build
- Linux Tauri build
- production dependency audit

## 7. Initial runtime config blocker

Before the hosted provider secret was configured, Windows Tauri/WebView2 verification truthfully produced:

```text
status                        = MASTERV_WINDOWS_YOUTUBE_DISCOVERY_CONFIG_BLOCKED
hosted_route                  = true
hosted_provider_configured    = false
provider_authority            = hosted-secret
desktop_provider_credentials  = false
analysis_authority            = metadata-only
client_youtube_api_delta      = 0
local_next_discovery_requests = 0
gemini_requests               = 0
logout_clear                  = true
```

The blocker was:

```text
YOUTUBE_DATA_API_KEY missing from Supabase Edge Function environment
```

That state established secret isolation and honest capability blocking, but did not qualify as `RUNTIME_VERIFIED`.

## 8. Hosted secret unblock and regression-contract correction

After `YOUTUBE_DATA_API_KEY` was configured in the Supabase Edge Function hosted environment, the live capability changed from `PENDING` to `READY` without putting the provider credential in Desktop or GitHub Actions.

A rerun of the previous Windows job first failed in the older MV-ARCH-3D smoke because that smoke still asserted that YouTube discovery must always remain `PENDING`. The actual observed value was `READY`.

This was a stale cross-stage test assumption, not a Reference Library regression. MV-ARCH-3D does not own YouTube discovery readiness, while MV-ARCH-3G has the dedicated strict provider/runtime smoke.

The regression contract was minimally corrected in:

- commit: `8f0d02e876bd98347ab7396021ad0ae93ebe6980`
- message: `test(arch3g): decouple 3D smoke from discovery config`

The 3D smoke now accepts the hosted discovery capability as either `PENDING` or `READY`. The MV-ARCH-3G smoke remains strict and still requires `READY`, an actual hosted provider search, no direct Desktop provider traffic, and no provider credential in the Desktop process/job.

## 9. Actual Windows runtime verification

Runtime-verification CI:

- commit: `8f0d02e876bd98347ab7396021ad0ae93ebe6980`
- run: `31891143508` (#691)
- `validate`: SUCCESS
- `desktop-shell`: SUCCESS
- `desktop-windows-runtime`: SUCCESS

The Windows job built the native Tauri executable and then passed MV-ARCH-3D, 3E, and 3F regression smokes before the dedicated 3G smoke.

Actual MV-ARCH-3G evidence:

```text
status                         = MASTERV_WINDOWS_YOUTUBE_DISCOVERY_RUNTIME_PASS
webview2_runtime_version       = 151.0.4129.72
cdp_browser                    = Edg/151.0.4129.72
attach_mode                    = true
surface                        = desktop
auth_status                    = AUTHENTICATED
hosted_api_status              = CONNECTED
youtube_discovery_capability   = READY
hosted_provider_configured     = true
provider_authority             = hosted-secret
analysis_authority             = metadata-only
candidate_count                = 12
youtube_api_requests           = 2
client_youtube_api_delta       = 0
client_hosted_function_delta   = 1
local_next_discovery_requests  = 0
desktop_provider_credentials   = false
gemini_requests                = 0
deep_analysis_migrated         = false
persistence_write              = false
logout_clear                   = true
screenshot                     = youtube-discovery.png
```

This proves an actual authenticated Desktop → hosted Edge Function → YouTube Data API metadata-discovery path while maintaining the intended secret boundary.

The search produced 12 metadata candidates and required two hosted YouTube API requests. The Desktop itself made zero direct YouTube Data API requests and exactly one hosted-function request for the search.

## 10. Previous-stage runtime regressions in the same Windows run

MV-ARCH-3D:

```text
status                       = MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS
reference_library_list       = PASS
reference_delete_ui          = PASS
reference_delete_db          = PASS
cross_workspace_write_denied = true
cleanup                      = PASS
logout                       = PASS
```

MV-ARCH-3E:

```text
status                         = MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS
reference_detail_lazy_load     = true
reference_compare_surface      = PASS
compare_selection_count        = 2
cleanup                        = PASS
logout_clear                   = PASS
```

MV-ARCH-3F:

```text
status                            = MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS
hosted_compiler_authority         = canonical
workspace_authority               = jwt-derived
persistence_authority             = user-jwt-rls
arbitrary_workspace_body_ignored  = true
comparison_sample_size            = 2
evidence_rule_count               = 11
desktop_compare_raw_analysis_fetch = false
client_reference_fetch_delta      = 0
client_hosted_function_delta      = 1
cleanup                           = PASS
logout_clear                      = PASS
```

## 11. Runtime evidence artifact

Runtime-verification artifact:

- ID: `9248646432`
- name: `masterv-windows-desktop-smoke`
- run: `31891143508`
- branch head under verification: `8f0d02e876bd98347ab7396021ad0ae93ebe6980`
- size: `1,380,747` bytes
- digest: `sha256:f7ed5d8d33ea103775f4b34c3c8638aad382e055ad6370df344bcdcdbef9954c`

The artifact contains 3D/3E/3F/3G Windows runtime evidence, screenshots, and the unsigned NSIS smoke installer.

The installer remains unsigned and is verification output only. It is not an activation or release artifact.

## 12. Live hosted authority and cleanup

After the hosted secret configuration, the live function was observed as:

```text
slug       = masterv-api-boundary
version    = 4
status     = ACTIVE
verify_jwt = true
import_map = true
```

The function code hash remained unchanged from the 3G deployment; version 4 reflects hosted runtime configuration rather than a Desktop credential migration.

Independent database cleanup check for run `31891143508`:

```text
remaining MV3D fixtures = 0
remaining MV3E fixtures = 0
remaining MV3F fixtures = 0
```

MV-ARCH-3G itself creates no Reference Library database fixture.

## 13. Runtime gate result

The required runtime gate is now satisfied:

1. Hosted `YOUTUBE_DATA_API_KEY` is configured.
2. Desktop Windows CI contains no YouTube provider credential.
3. The authoritative branch head executed a real hosted YouTube search through native Tauri/WebView2.
4. Runtime evidence shows hosted YouTube provider requests > 0.
5. Desktop direct YouTube API request delta is zero.
6. Local Next discovery request delta is zero.
7. Gemini request count is zero for this metadata-only stage.
8. Previous 3D/3E/3F runtime regressions remain green.
9. Runtime fixtures are cleaned.

Therefore the lifecycle state is promoted to:

**RUNTIME_VERIFIED / NOT ACTIVATED**

A documentation-inclusive exact-head CI run is still required after this lifecycle-record update before the stage is considered frozen.

## 14. Non-activation boundary

MV-ARCH-3G does not authorize:

- making PR #1 ready
- merging PR #1
- Desktop release or activation
- signing
- updater introduction
- provider secret placement in Desktop or CI
- Deep Analysis migration
- Product Truth migration

MV-ARCH-3G stops after documentation-inclusive exact-head verification. A subsequent Deep Analysis hosted-compute stage requires separate scope/approval and must not be inferred from this runtime pass.
