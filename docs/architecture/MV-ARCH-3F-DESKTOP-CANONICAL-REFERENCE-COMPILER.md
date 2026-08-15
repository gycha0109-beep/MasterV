# MV-ARCH-3F — Desktop Canonical Compare / Evidence Boundary

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

MV-ARCH-3F moves the Reference Compare / Evidence execution boundary out of the static Desktop client without creating a second comparison or evidence authority.

The Desktop must send only selected persisted `source_id` values. The authenticated hosted boundary must derive the personal workspace from the validated user JWT, read the persisted analyses under the same user-JWT/RLS authority, run the canonical deterministic compilers, and return compiled comparison/evidence output.

This stage does not migrate Deep Analysis, YouTube Discovery, Product Truth, background batch execution, or provider credentials into the Desktop.

## Canonical authority

The compiler authority remains the repository `lib/*` implementation:

- `lib/analysis-schema.ts`
- `lib/derived-metrics.ts`
- `lib/reference-compare.ts`
- `lib/evidence-rules.ts`

The Edge Function does not contain copied implementations of `compareVideoAnalyses()` or `compileEvidenceRules()`.

For the 3F deployment, `supabase/functions/masterv-api-boundary/deno.json` pins the exact canonical source state from commit:

`796e0469b20159f6057d625d0f03d33478a8767e`

The static 3F contract verifies the Git blob SHA of all four canonical files. If any canonical source changes, CI fails until the hosted source pin is intentionally advanced and reverified.

Pinned canonical blob authority:

- `lib/analysis-schema.ts` → `5292023ee739488f9d0d29b96c4c01717abd3956`
- `lib/derived-metrics.ts` → `f9d51039d0d746954da38c26bdacded819361167`
- `lib/reference-compare.ts` → `705732247718ec191fbc24c5613608d9737e93ce`
- `lib/evidence-rules.ts` → `8dcfaa54b34246e8c163dfed68ceaedbca076913`

## Hosted data flow

```text
Desktop Reference Library
  → metadata-only list remains unchanged
  → user selects 2..8 persisted source IDs
  → POST /functions/v1/masterv-api-boundary
       body: { operation: "reference_workflow", source_ids: [...] }
       Authorization: end-user JWT
       apikey: public publishable key
  → Supabase gateway verify_jwt=true
  → hosted boundary derives user:${JWT.sub}
  → hosted boundary reads reference_library_entries
       exact workspace_id + source_id
       forwarded end-user JWT + publishable key
       RLS remains authoritative
  → canonical compareVideoAnalyses()
  → canonical compileEvidenceRules()
  → aggregate comparison + deterministic evidence rules
  → Desktop presentation
```

The Desktop does **not** send a workspace authority value and does **not** send raw analysis payloads to the hosted compiler.

An arbitrary `workspace_id` field supplied by a caller is not used as authority; the server derives the personal workspace from the authenticated JWT subject.

## Reference Detail boundary

MV-ARCH-3E single-reference Detail behavior remains intentionally separate:

- Reference Library list remains metadata-only.
- Explicitly opening one Detail still performs one workspace/source-scoped persisted `analysis` lazy-load to the Desktop.
- Compare no longer fans out `fetchReferenceDetail()` calls and does not reuse the Detail transport to obtain raw analyses.

This preserves the 3E Detail surface while tightening the multi-reference Compare boundary.

## Desktop surface

The Desktop now exposes a truthful hosted capability row:

- Boundary probe: hosted
- Reference Compare / Evidence: hosted canonical compiler
- Analyze: not migrated
- YouTube Discovery: not migrated
- Product Truth: not migrated

For a canonical comparison, the Desktop renders:

- sample-level aggregate comparison facts,
- selected-reference comparison cards,
- deterministic evidence rules,
- support count/percent,
- confidence,
- rule status,
- default-selection semantics.

The static Desktop bundle does not contain a copied `compareVideoAnalyses()` or `compileEvidenceRules()` implementation.

## Authorization and persistence authority

The hosted boundary is deployed with:

- `verify_jwt = true`
- personal workspace derived as `user:${JWT.sub}`
- persisted Reference Library reads using the caller's user JWT
- existing RLS as the database authorization authority
- public Supabase publishable key only

No service-role credential was introduced.

No database migration or RLS change was required for 3F.

## Secret / compute boundary

Still excluded from Desktop runtime and Desktop CI job:

- `GEMINI_API_KEY`
- `YOUTUBE_DATA_API_KEY`
- Supabase service-role key
- database password
- refresh-token persistence
- local Next.js `/api` dependency

The 3F runtime smoke executes zero Gemini requests and zero YouTube provider requests.

## Static verification

3F adds `scripts/hosted-reference-compiler-contract.mjs` and runs it in both `validate` and `desktop-shell` CI jobs.

It verifies:

- canonical Git blob SHA pin integrity,
- pinned Deno canonical imports,
- hosted POST operation contract,
- JWT-derived workspace authority,
- user-JWT/RLS persisted read authority,
- exact workspace/source persisted filters,
- absence of service-role/provider credential dependencies,
- Desktop POST body contains selected source IDs only,
- Desktop compare does not send workspace authority,
- Desktop compare does not send raw analysis,
- Desktop compare does not call `fetchReferenceDetail()`,
- canonical compare/evidence implementations are not copied into `desktop/app.js`.

Code-head static and native gates were verified at:

`981362be106669e284f0d7b07ed553425c4f3f4b`

CI run:

`31857876133` (#681)

All required jobs succeeded:

- `validate`
- `desktop-shell`
- `desktop-windows-runtime`

## Runtime verification

The Windows runtime smoke uses the real release-mode Tauri executable and the existing WebView2 remote-debug/EdgeDriver attach verification path.

3F creates two unique RLS-authorized synthetic persisted Reference Library fixtures containing contract-shaped observation data. They do not invoke external providers.

The runtime sequence verifies:

1. authenticated user session,
2. personal workspace bootstrap,
3. two persisted fixtures,
4. live hosted compiler POST succeeds,
5. caller-supplied arbitrary `workspace_id` does not override JWT-derived authority,
6. canonical comparison sample size is 2,
7. canonical evidence rules are generated,
8. actual Desktop launches and lists both fixtures,
9. Reference compiler hosted capability reports READY,
10. user selects two references without opening Detail,
11. Desktop Compare becomes READY,
12. canonical comparison and evidence rules are rendered,
13. compare causes no additional direct browser Reference Library REST fetch,
14. compare causes exactly one additional hosted compiler request,
15. Detail remains unopened during Compare,
16. fixtures are deleted and independently absent from persistence,
17. logout clears list/detail/compare state.

Observed 3F code-head runtime evidence:

```text
status = MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS
surface = desktop
auth_status = AUTHENTICATED
hosted_api_status = CONNECTED
boundary_probe = true
reference_compiler_capability = READY
hosted_reference_compiler = PASS
hosted_compiler_authority = canonical
workspace_authority = jwt-derived
persistence_authority = user-jwt-rls
arbitrary_workspace_body_ignored = true
comparison_sample_size = 2
evidence_rule_count = 11
desktop_compare_surface = PASS
desktop_compare_raw_analysis_fetch = false
client_reference_fetch_delta = 0
client_hosted_function_delta = 1
cleanup = PASS
logout_clear = PASS
local_next_api_required = false
provider_credentials_in_desktop_job = false
gemini_requests = 0
youtube_requests = 0
screenshot = reference-compiler.png
```

Existing 3D Reference Library and 3E Detail/Compare Windows runtime smokes also passed in the same code-head run.

## Runtime artifact

Code-head Windows evidence artifact:

- workflow run: `31857876133`
- exact code head: `981362be106669e284f0d7b07ed553425c4f3f4b`
- artifact name: `masterv-windows-desktop-smoke`
- artifact id: `9239671465`
- SHA-256: `8fbc186ac91fedc68fd3992cbdc2111f59802c1308d44390033ec328d6a6277f`

The artifact includes 3D, 3E, and 3F runtime evidence plus the unsigned NSIS installer smoke output.

## Live hosted authority

After the 3F code commit, hosted Supabase authority was verified as:

- function: `masterv-api-boundary`
- version: `2`
- status: `ACTIVE`
- `verify_jwt: true`
- import map: enabled

This deployment is the hosted runtime boundary used by verification. It does not mean the unreleased Desktop application has been activated or distributed to production users.

## Cleanup

After code-head runtime verification, live Supabase was independently queried for fixture prefixes from run `31857876133`.

Remaining rows:

- MV-ARCH-3D fixtures: `0`
- MV-ARCH-3E fixtures: `0`
- MV-ARCH-3F fixtures: `0`

## Not migrated / not activated

3F does not claim any of the following:

- Deep Analysis Desktop migration
- YouTube Discovery Desktop migration
- Product Truth Desktop migration
- background batch Desktop migration
- production Desktop release
- signed installer release
- updater activation
- PR Ready status
- PR merge

The hosted compiler function being live for authenticated runtime verification is not equivalent to Desktop product activation.

## Exact-head freeze rule

This document records the code-head runtime proof at `981362be106669e284f0d7b07ed553425c4f3f4b`.

After this documentation commit, the documentation-inclusive branch HEAD must independently pass the same required CI jobs before MV-ARCH-3F is frozen at `RUNTIME_VERIFIED / NOT ACTIVATED`.

No further documentation edit should be made solely to write that final CI run number into this file unless another exact-head CI cycle is also performed.

## Remaining boundary

The next architecture candidate is Search / Discovery hosted migration. That stage should preserve the same principles established here:

- Desktop sends user intent, not provider credentials,
- hosted runtime owns provider calls,
- authenticated authorization remains explicit,
- canonical business logic is not forked into the Desktop,
- runtime verification precedes any activation claim.
