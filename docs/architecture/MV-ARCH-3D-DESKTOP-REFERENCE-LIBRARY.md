# MV-ARCH-3D — Desktop Reference Library Surface

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Move the already-hosted persistent Reference Library onto the actual MasterV Windows desktop surface without moving Gemini, YouTube Discovery, Product Truth, or privileged server credentials into the executable.

Verified desktop path:

```text
Windows Tauri executable
  -> process-memory Supabase Auth session
  -> authenticated personal workspace bootstrap
  -> Supabase RLS Reference Library metadata list
  -> desktop refresh / empty / loading / error states
  -> workspace + source_id scoped delete
  -> persisted deletion verification
  -> fixture cleanup
  -> logout clears library surface
```

## Authority

Reference Library persistence authority remains the hosted Supabase project.

Existing database authority was reused; MV-ARCH-3D did not add a schema migration.

Relevant authority:

```text
supabase/migrations/202608140001_reference_library.sql
supabase/migrations/202608150001_personal_workspace_bootstrap.sql
lib/reference-library.ts
lib/reference-library-session.ts
```

The desktop does not use a service-role client. Authorization remains `auth.uid()` plus existing workspace-membership RLS.

## Desktop data flow

After password login succeeds, the desktop keeps the returned authenticated session only in process memory.

It then:

1. derives the personal workspace identifier from the authenticated user id as `user:<auth.uid()>`;
2. attempts the existing RLS-authorized personal workspace membership bootstrap through Supabase REST;
3. lists Reference Library rows using the authenticated access token;
4. renders metadata only;
5. refreshes on login or explicit user refresh;
6. deletes a selected row through the same authenticated RLS boundary;
7. reloads the persisted list after deletion;
8. clears the session and Reference Library UI on logout.

A client-selected arbitrary workspace id is not treated as authority. The personal workspace identifier is deterministic from the authenticated user id, while permission is enforced by the hosted RLS policy.

## Metadata projection

Desktop list projection is intentionally limited to:

```text
source_id
canonical_url
label
analysis_provenance
revision
first_saved_at
updated_at
```

Ordering:

```text
updated_at DESC
source_id ASC
```

The list request does not select the full `analysis` JSON payload.

## Delete semantics

Desktop delete uses:

```text
workspace_id = current authenticated personal workspace
source_id = selected canonical source id
```

with the authenticated Supabase JWT and existing `reference_library_entries` DELETE RLS policy.

After DELETE returns successfully, the desktop reloads the hosted list and rejects convergence if the deleted source id remains present.

The Windows runtime smoke independently reads the same fixture through authenticated REST after the UI delete and requires the persisted row to be absent.

## Desktop UI states

The Reference Library surface supports:

```text
signed out -> hidden and cleared
workspace bootstrap -> loading
list fetch -> loading
empty library -> explicit empty state
success -> metadata cards
failure -> explicit error state
manual refresh -> supported
delete -> persisted list reload
logout -> hidden and cleared
```

Minimum card metadata:

```text
label
canonical URL
analysis provenance
revision
updated time
```

## Secret boundary

MV-ARCH-3D does not expand desktop secret authority.

The desktop bundle does not contain or require:

```text
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
Supabase service role
DB password
SUPABASE_TEST_PASSWORD
refresh token persistence
localStorage auth persistence
```

Public desktop build configuration remains:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_MASTERV_API_BASE_URL
```

The GitHub test account email/password are supplied only to the Windows runtime harness through GitHub Secrets and are typed into the real desktop UI at runtime. Credential input fields are cleared before screenshot capture.

## Static verification

New contract:

```text
npm run test:desktop-reference-library
```

The contract verifies:

```text
static desktop build success
Reference Library UI markers
metadata-only list projection
authenticated bearer access token usage
authenticated personal workspace derivation
Supabase REST authority
newest-first ordering
workspace + source_id delete scope
post-delete hosted reload
logout library clear/hide semantics
no local Next /api dependency
no localStorage / refresh-token persistence
no service-role / Gemini / YouTube / test-password markers in desktop bundle
```

The contract is included in both the general `validate` job and Linux `desktop-shell` job.

## Windows runtime verification

Runtime evidence code head:

```text
1609b139abe51712b08250253dcf8412333ee87a
```

GitHub Actions:

```text
run_id: 31852720093
run_number: 669
result: SUCCESS
```

Required jobs on that runtime-evidence head:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-runtime  SUCCESS
```

The Windows job preserved the MV-ARCH-3C WebView2 attach architecture:

```text
masterv-desktop.exe direct launch
  -> test-only WebView2 remote debugging port
  -> exact matching msedgedriver
  -> debuggerAddress attach
  -> W3C WebDriver against the real Tauri WebView
```

It did not return to Tauri-driver launch mode or WebdriverIO/Tauri-service.

## Runtime fixture safety

The runtime harness creates a unique valid synthetic YouTube identity using the existing canonical source format:

```text
yt:MV3D<unique-run-suffix>
```

The fixture is inserted with the authenticated test user's JWT and RLS. It does not call Gemini or the YouTube Data API.

The smoke requires:

```text
pre-cleanup of only the exact unique fixture
cross-workspace write denial
fixture insert
fixture visible in actual desktop UI
UI delete
fixture absent in authenticated DB read
exact fixture cleanup
logout
process cleanup
```

A fallback cleanup path runs on failure and cleanup failure fails the runtime gate.

After run `31852720093`, a live database check for that run's `yt:MV3D31852720093%` fixture prefix returned zero remaining rows.

## Observed evidence

The successful Windows runtime harness is assertion-gated to emit:

```json
{
  "status": "MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS",
  "surface": "desktop",
  "auth_status": "AUTHENTICATED",
  "hosted_api_status": "CONNECTED",
  "boundary_probe": true,
  "workspace_bootstrap": true,
  "reference_library_list": "PASS",
  "analysis_payload_selected": false,
  "fixture_visible": true,
  "reference_delete_ui": "PASS",
  "reference_delete_db": "PASS",
  "cross_workspace_write_denied": true,
  "cleanup": "PASS",
  "logout": "PASS",
  "analyze_migrated": false,
  "youtube_discovery_migrated": false,
  "product_truth_migrated": false,
  "local_next_api_required": false,
  "provider_credentials_in_desktop_job": false,
  "gemini_requests": 0,
  "youtube_requests": 0
}
```

Evidence artifact:

```text
name: masterv-windows-desktop-smoke
artifact_id: 9238080123
```

The artifact includes the runtime JSON, non-secret Reference Library screenshot, process logs, and unsigned NSIS installer smoke output.

## Remaining boundary

MV-ARCH-3D does not migrate or activate:

```text
Gemini Deep Analysis
YouTube Discovery
Product Truth
background batch
service-role proxy
persistent desktop auth vault
Stronghold
installer signing
auto updater
public release
```

Auth therefore remains process-memory-only. Restarting the desktop process requires login again; after re-login, the same hosted Reference Library persists through Supabase.

Overall npm dependency determinism also remains a separate unresolved repository concern. MV-ARCH-3D did not expand into a lockfile/dependency-policy redesign.

## Not activated

`RUNTIME_VERIFIED` means the feature was observed in an actual Windows Tauri/WebView2 runtime under authenticated hosted authority.

It does **not** mean production activation.

PR #1 remains Draft/Open/Unmerged. No signed installer, updater, public release channel, production feature activation, or merge to `main` is part of this stage.

## Final lifecycle gate

After this documentation commit, the branch must pass a fresh exact-head CI run with all required jobs green before MV-ARCH-3D is treated as authoritatively frozen at `RUNTIME_VERIFIED / NOT ACTIVATED`.

The runtime-evidence run above cannot substitute for that final documentation-inclusive exact-head regression.

## Next stage

Do not auto-implement the next stage.

Candidate after explicit approval:

```text
MV-ARCH-3E — Desktop Reference Detail / Compare Surface
```

Search / Discovery migration or hosted Deep Analysis compute migration may be higher priority depending on the architecture state at that point and should be re-evaluated separately.
