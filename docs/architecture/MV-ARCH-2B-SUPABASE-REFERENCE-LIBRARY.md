# MV-ARCH-2B — Supabase Reference Library Adapter

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Provide a production-capable persistence adapter for the MV-ARCH-2A Reference Library contract without activating unauthenticated public writes.

Verified flow:

```text
authenticated user
  -> trusted workspace membership
  -> Reference Library API/store
  -> Supabase Postgres + RLS
  -> persisted Deep analysis snapshots
```

## Current live project

Dedicated Supabase project:

```text
name: MasterV
project_ref: euqkjrmrhhvnyzasppnd
region: ap-northeast-1
status: ACTIVE_HEALTHY
```

The connected account was granted Developer access to the organization that owns this project. `list_projects` did not immediately refresh to include the new organization, but direct project-ref access succeeds, so the connector can operate on the MasterV project.

## Migration

`supabase/migrations/202608140001_reference_library.sql` defines:

- `masterv_workspace_members`
- `reference_library_entries`
- primary key `(workspace_id, source_id)`
- newest-first workspace index
- RLS enabled on both tables
- membership helper `masterv_is_workspace_member(text)`
- authenticated CRUD policies on reference entries
- anon grants revoked
- DB-owned revision/timestamp trigger

The migration does not create users or silently bootstrap a membership.

Workspace membership is established through the authenticated MV-ARCH-2C personal-workspace bootstrap flow.

### Live applied migrations

The live MasterV database contains the Reference Library schema plus security/performance hardening and the later personal-workspace bootstrap migration.

Core 2B migrations:

```text
reference_library
reference_library_security_hardening
reference_library_performance_hardening
```

`202608150001_reference_library_security_hardening.sql`:

- changes `masterv_is_workspace_member(text)` from `SECURITY DEFINER` to `SECURITY INVOKER`;
- revokes public/anon execution;
- permits authenticated execution only.

This removed Supabase security-advisor warnings that the helper could be invoked as an exposed SECURITY DEFINER RPC.

`202608150002_reference_library_performance_hardening.sql`:

- adds an index on `masterv_workspace_members(user_id)` for the auth-user foreign key/access path;
- rewrites the membership RLS policy to use `(select auth.uid())`, avoiding per-row auth function re-evaluation.

## Live schema verification

Live introspection confirms:

```text
public.masterv_workspace_members
  RLS: enabled
  PK: (workspace_id, user_id)
  FK: user_id -> auth.users(id)

public.reference_library_entries
  RLS: enabled
  PK: (workspace_id, source_id)
```

The reference table has the expected checks for:

- `source_platform = youtube`;
- label length 1..120;
- provenance in `cache | replay | live`;
- `schema_version = reference-library-v1`;
- positive revision.

The live trigger is present:

```text
reference_library_revision_trigger
BEFORE INSERT OR UPDATE
-> masterv_reference_library_revision()
```

The expected authenticated policies are present for workspace-scoped reference read/insert/update/delete.

## Advisor verification

After the security hardening migration:

```text
security advisor lints: 0
```

After the performance hardening migration, the only remaining performance notices were `unused_index` INFO notices for newly created indexes on empty/unused tables.

Those indexes are intentionally retained.

## Database-owned upsert semantics

The application submits the current reference snapshot but does not submit:

```text
revision
first_saved_at
updated_at
```

The database trigger owns those fields.

Insert:

```text
revision = 1
first_saved_at = now
updated_at = now
```

Conflict update on `(workspace_id, source_id)`:

```text
revision = old.revision + 1
first_saved_at = old.first_saved_at
updated_at = now
```

This avoids an application read-modify-write race for revision numbering.

## Adapter

`lib/reference-library-supabase.ts` implements `ReferenceLibraryStore` over Supabase PostgREST using native fetch semantics.

No new Supabase JavaScript dependency is required.

Configuration is injected:

```text
project_url
api_key
access_token
fetch_impl (optional test seam)
```

The adapter does not read secret service-role credentials from source code.

An authenticated user flow uses a publishable API key plus that user's access token, allowing RLS to authorize workspace access.

Service-role bypass is not activated by this checkpoint.

## Request semantics

List:

```text
GET reference_library_entries
  workspace_id = eq.<trusted workspace>
  order = updated_at desc, source_id asc
```

Get:

```text
GET reference_library_entries
  workspace_id = eq.<trusted workspace>
  source_id = eq.<canonical source id>
  limit = 1
```

Upsert:

```text
POST reference_library_entries
on_conflict = workspace_id,source_id
Prefer = resolution=merge-duplicates,return=representation
```

Delete:

```text
DELETE reference_library_entries
  workspace_id = eq.<trusted workspace>
  source_id = eq.<canonical source id>
Prefer = return=representation
```

## Read-time integrity validation

Rows returned by Supabase are not promoted directly into application authority.

The adapter revalidates:

- workspace ID format;
- source platform = YouTube;
- schema version = `reference-library-v1`;
- positive integer revision;
- label bounds;
- provenance enum;
- canonical URL -> source ID/native ID;
- Deep analysis cache key -> same source ID;
- saved timestamps.

A manually corrupted or mismatched database row therefore fails before entering comparison logic.

## Credential/error boundary

Supabase upstream error code/message/details may be surfaced for diagnostics.

Configured API keys and bearer tokens are never added to thrown messages by the adapter.

## Static contract

`scripts/reference-library-supabase-contract.ts` uses a fake fetch implementation and verifies:

- authenticated REST headers;
- workspace-scoped list/get/delete filters;
- canonical URL/source write payload;
- natural-key PostgREST upsert;
- database-owned fields omitted from writes;
- no derived metrics persisted;
- database revision preserved on returned rows;
- credentials not leaked through error messages;
- zero external Supabase calls in CI.

CI command:

```text
npm run test:reference-library-supabase
```

## Live authenticated CRUD evidence

MV-ARCH-2C Runtime Smoke Run `31834335727` exercised this adapter against the real MasterV Supabase project at checkout SHA:

```text
10ac63448ce74b5cf37c10eaabf27db2649a01d6
```

Observed server-side result:

```text
status: REFERENCE_LIBRARY_LIVE_SMOKE_PASS
source_id: yt:MVpersist01
revision: 2
first_saved_at_preserved: true
cross_workspace_write_denied: true
gemini_requests_executed: 0
youtube_requests_executed: 0
```

This proves the real adapter/database path for authenticated workspace bootstrap, insert, list/get-compatible persistence authority, natural-key update, delete cleanup, database-owned revision semantics, timestamp preservation, and RLS denial of an unowned workspace write.

The production browser path also passed:

```text
status: REFERENCE_LIBRARY_BROWSER_SMOKE_PASS
reference_rest_requests: 6
analyze_requests: 0
restored_after_reload: true
```

The workflow cleanup removed the synthetic row. A subsequent direct live DB check confirmed:

```text
workspace_members = 1
reference_entries = 0
```

## Authentication boundary

RLS remains intentionally designed around `auth.uid()` workspace membership.

MV-ARCH-2C now supplies the authenticated session and deterministic personal workspace bootstrap:

```text
workspace_id = user:<auth.uid()>
```

A client-supplied arbitrary `workspace_id` is never treated as authorization.

The live cross-workspace denial test confirms this boundary under an actual authenticated token.

## Runtime verdict

The 2B runtime promotion conditions are now satisfied:

1. dedicated MasterV Supabase project is healthy;
2. schema and hardening migrations are live;
3. tables, RLS policies, trigger and constraints were verified live;
4. security advisor is clean;
5. authenticated test user and workspace exist;
6. real authenticated Supabase adapter CRUD path passes;
7. revision 1 -> 2 and `first_saved_at` preservation pass;
8. RLS cross-workspace denial passes;
9. cleanup passes.

Therefore:

```text
MV-ARCH-2B = RUNTIME_VERIFIED / NOT ACTIVATED
```

## Activation boundary

`ACTIVATED` remains separate from runtime verification.

Before production activation:

1. deployment environment receives the intended public Supabase configuration;
2. the real deployed application uses the authenticated persistence path;
3. intended real-user onboarding/auth UX is accepted;
4. no service-role credential is exposed to client code;
5. deployment smoke confirms persistence outside GitHub Actions.

## Next

The persistence foundation is now runtime-verified through MV-ARCH-2C. The next persistence milestone is deployment/activation hardening rather than another local adapter stage.
