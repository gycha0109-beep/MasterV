# MV-ARCH-3E — Desktop Reference Detail / Compare Surface

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Extend the already-runtime-verified Desktop Reference Library with an explicit detail and comparison surface without expanding the desktop trust boundary or moving provider workloads into the native executable.

The verified product path is:

```text
Desktop Reference Library metadata list
  -> explicit reference detail request
  -> workspace + source scoped persisted analysis lazy-load
  -> detail facts

or

Desktop Reference Library metadata list
  -> select two or more references
  -> lazy-load only the selected persisted analyses
  -> side-by-side comparison facts
```

This stage does not migrate the canonical aggregate comparison compiler into the static desktop client.

## Authority

Existing authorities remain unchanged:

```text
Reference persistence schema/identity  lib/reference-library.ts
Canonical source identity              lib/source-identity.ts
Canonical aggregate comparison         lib/reference-compare.ts
Hosted persistence/RLS                 Supabase reference_library_entries
Workspace membership                   Supabase masterv_workspace_members
Desktop auth                           authenticated Supabase user JWT
```

`compareVideoAnalyses` remains the aggregate comparison authority. MV-ARCH-3E does not duplicate that compiler in `desktop/app.js`.

## Desktop data flow

```text
Tauri native shell
  -> local static HTML/CSS/JS
  -> Supabase password auth
  -> memory-only authenticated access token
  -> personal workspace bootstrap under existing membership RLS
  -> metadata-only Reference Library list
  -> explicit detail/compare action
  -> authenticated Supabase REST query under RLS
```

There is no local Next.js `/api` requirement.

## List projection boundary

The list projection remains metadata-only:

```text
source_id
canonical_url
label
analysis_provenance
revision
first_saved_at
updated_at
```

The list does not select `analysis`.

## Detail lazy-load

Only an explicit detail action loads persisted analysis for one item.

Detail query scope:

```text
workspace_id = authenticated personal workspace
source_id    = selected canonical source id
limit        = 1
```

Detail projection:

```text
source_id
canonical_url
label
analysis_provenance
revision
first_saved_at
updated_at
analysis
```

The detail surface presents bounded facts from the persisted analysis, including summary, structure, duration, hook, product-first-seen timing, CTA, observation-segment count, provenance, and revision.

`analysis_cache_key` is not loaded for this surface.

## Compare semantics

The desktop comparison surface requires at least two selected references.

Only selected entries are lazy-loaded, and the UI renders side-by-side persisted facts.

This is intentionally not a new comparison authority:

```text
aggregate_compare_compiler_migrated = false
```

The existing `lib/reference-compare.ts` compiler remains canonical for aggregate comparison/evidence logic.

## Workspace authorization

Detail and comparison reads use the authenticated user JWT and existing Supabase RLS.

The desktop client does not treat an arbitrary client-provided workspace id as authorization. The personal workspace is derived from the authenticated user and bootstrapped under the existing self-membership policy.

No service-role path was introduced.

## Delete and state convergence

The existing 3D delete authority remains:

```text
authenticated JWT
+ workspace_id scope
+ source_id scope
+ Supabase RLS
```

If a deleted item is selected for detail or comparison, the desktop state is reconciled with the reloaded persisted list.

Logout clears list, detail, comparison selection, and rendered comparison/detail state from process memory.

## Secret boundary

No new private secret is embedded in the desktop application.

Forbidden desktop-provider credentials remain absent:

```text
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
Supabase service role
DB password
SUPABASE_TEST_PASSWORD
```

The Windows runtime job uses only the existing test account credentials from GitHub Secrets at runtime. They are not compiled into the static bundle or executable.

Auth persistence remains memory-only. MV-ARCH-3E does not add localStorage refresh-token persistence or ad-hoc Stronghold persistence.

## Static verification

New contract:

```text
npm run test:desktop-reference-detail-compare
```

It verifies:

- list projection remains metadata-only;
- detail projection explicitly includes `analysis` exactly once;
- detail fetch is scoped by `workspace_id + source_id` and bounded to one row;
- comparison requires at least two selected references;
- only selected references are lazy-loaded;
- canonical `compareVideoAnalyses` is not copied into the static desktop client;
- logout clears list/detail/compare state;
- no local Next `/api` dependency exists;
- no localStorage or refresh-token persistence was introduced;
- provider/service-role secret markers are absent from the desktop bundle.

The general validation suite, production build, production dependency audit, Linux Tauri compile, and existing 3D desktop contract remain regression gates.

## Windows runtime verification

New runtime smoke:

```text
scripts/desktop-reference-detail-compare-windows-smoke.mjs
```

It uses the same validated Windows execution pattern as 3C/3D:

```text
actual masterv-desktop.exe
  -> CI-only WebView2 remote debugging
  -> matching msedgedriver
  -> debuggerAddress attach
  -> real desktop DOM interaction
```

The runtime test prepares two unique, contract-valid synthetic YouTube Reference Library fixtures through the authenticated test user's RLS authority. It does not invoke Gemini or YouTube APIs.

Observed sequence:

1. authenticate the test user;
2. bootstrap the personal workspace;
3. prepare two unique persisted Reference Library fixtures;
4. launch the actual Windows Tauri executable;
5. authenticate through the real desktop UI;
6. confirm hosted API CONNECTED and Reference Library READY;
7. verify both fixtures are visible in the metadata-only list;
8. open one detail surface and verify persisted `analysis` is lazy-loaded;
9. select both references and verify the compare surface renders both;
10. clear credential inputs before screenshot capture;
11. delete one fixture from the Desktop UI;
12. verify that deletion through authenticated Supabase read;
13. remove the remaining fixture exactly;
14. verify cleanup;
15. log out and verify list/detail/compare state is hidden and cleared;
16. terminate WebDriver and application processes.

## Observed runtime evidence

Code head tested:

```text
6fa55959b0ae9e8652832a06bba860310f8edbed
```

GitHub Actions code-head verification:

```text
run_id: 31854114774
run_number: 673
result: SUCCESS
```

Required code-head jobs:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-runtime  SUCCESS
```

Observed 3E runtime result:

```json
{
  "status": "MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS",
  "webview2_runtime_version": "151.0.4129.72",
  "cdp_browser": "Edg/151.0.4129.72",
  "attach_mode": true,
  "surface": "desktop",
  "auth_status": "AUTHENTICATED",
  "hosted_api_status": "CONNECTED",
  "boundary_probe": true,
  "workspace_bootstrap": true,
  "reference_library_list": "PASS",
  "list_projection_metadata_only": true,
  "reference_detail_lazy_load": true,
  "detail_projection_includes_analysis": true,
  "reference_compare_surface": "PASS",
  "compare_selection_count": 2,
  "aggregate_compare_compiler_migrated": false,
  "reference_delete_ui": "PASS",
  "reference_delete_db": "PASS",
  "cleanup": "PASS",
  "logout_clear": "PASS",
  "local_next_api_required": false,
  "provider_credentials_in_desktop_job": false,
  "gemini_requests": 0,
  "youtube_requests": 0,
  "screenshot": "reference-detail-compare.png"
}
```

The same exact code-head Windows job also reran the 3D Reference Library runtime smoke successfully, including cross-workspace write denial and metadata-only list projection.

A separate live Supabase cleanup query after the run found zero remaining 3D and zero remaining 3E runtime fixtures for run `31854114774`.

## Evidence artifact

GitHub Actions artifact:

```text
name: masterv-windows-desktop-smoke
artifact_id: 9238564374
sha256: 941909c6965be6abf35d399b67e1da26715ff6abcf3f8d27f568cec355dc2cc5
```

It includes evidence from both desktop runtime smoke directories plus the unsigned Windows installer smoke.

The screenshot is captured only after credential fields are cleared.

## What is not migrated

MV-ARCH-3E does not claim any of the following:

```text
canonical aggregate compare compiler in desktop  NO
Gemini Deep Analysis desktop migration           NO
YouTube Discovery desktop migration              NO
Product Truth desktop migration                  NO
background batch activation                      NO
service-role proxy                               NO
persistent desktop auth vault                    NO
production installer signing                     NO
public release                                   NO
```

## Dependency determinism boundary

Dependency determinism remains a separate open architecture concern. CI still resolves semver ranges with `npm install`, and Cargo resolution is not fully frozen by this stage.

MV-ARCH-3E does not expand into a lockfile/dependency-determinism overhaul because that is not a direct blocker for the bounded detail/compare runtime proof.

## Activation boundary

MV-ARCH-3E is not `ACTIVATED`.

The verified Windows executable and unsigned installer are CI/runtime evidence only. No production release, signing, updater, public distribution, or merge to `main` is implied.

PR #1 remains Open / Draft / Unmerged unless separately approved.

## Exact-head promotion gate

This runtime evidence is recorded from code head `6fa55959...`.

After this documentation commit, the new documentation-inclusive branch HEAD must run the full required CI again. The stage is authoritative only when that exact HEAD has:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-runtime  SUCCESS
```

The prior runtime run is evidence of observed behavior, but it is not reused as the final exact-head regression proof for a later documentation commit.

## Remaining boundary / next candidate

Reference list, detail, and bounded side-by-side persisted-fact comparison are now proven in the native desktop surface.

A subsequent stage may decide between:

- exposing the canonical aggregate Compare/Evidence compiler through an appropriate hosted/client-safe boundary; or
- migrating Search / Discovery behind a hosted route.

Neither is part of MV-ARCH-3E and neither is automatically implemented by this stage.
