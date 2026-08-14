# MV-ARCH-2B — Supabase Reference Library Adapter

Status: **STATIC_VERIFIED / LIVE_SCHEMA_VERIFIED / AUTHENTICATED_CRUD_NOT_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Provide a production-capable persistence adapter for the MV-ARCH-2A Reference Library contract without activating unauthenticated public writes.

Target flow:

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

Workspace membership must be established through a trusted authenticated flow or an explicit administrative bootstrap before the store can be used.

### Live applied migrations

The live MasterV database now contains:

```text
reference_library
reference_library_security_hardening
reference_library_performance_hardening
```

The initial schema migration applied successfully, then two hardening migrations were added after advisor review.

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

The expected authenticated policies are present:

- workspace members can read own membership;
- workspace members can read references;
- workspace members can insert references;
- workspace members can update references;
- workspace members can delete references.

## Advisor verification

After the security hardening migration:

```text
security advisor lints: 0
```

After the performance hardening migration, the only remaining performance notices are `unused_index` INFO notices for newly created indexes on empty/unused tables.

Those indexes are intentionally retained. A zero-row, not-yet-activated table naturally has no index usage history.

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

`lib/reference-library-supabase.ts` implements `ReferenceLibraryStore` over Supabase PostgREST using native `fetch`.

No new Supabase JavaScript dependency is required.

Configuration is injected:

```text
project_url
api_key
access_token
fetch_impl (optional test seam)
```

The adapter does not read hard-coded credentials from source code.

An authenticated user flow can use a publishable API key plus that user's access token, allowing RLS to authorize workspace access.

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

The Supabase contract, all prior regression contracts, browser smoke script syntax check, typecheck, and production build passed before the live migration was applied.

## Authentication boundary

RLS is intentionally designed around `auth.uid()` workspace membership.

The live MasterV project currently has:

```text
auth.users count = 0
```

Therefore authenticated save/list/update/delete and cross-workspace denial cannot yet be truthfully marked runtime verified.

MasterV does not yet have a user sign-in/session flow wired into the application. This stage does not expose a public persistence API and does not replace the browser-session comparison tray yet.

A client-supplied arbitrary `workspace_id` must never be treated as authorization.

## Activation gate

Already satisfied:

1. dedicated MasterV Supabase project is healthy;
2. connector can access it by project ref;
3. schema migration and hardening migrations applied successfully;
4. tables, RLS policies, trigger and constraints verified live;
5. security advisor is clean;
6. performance advisor has no actionable warning beyond expected unused-index INFO on empty tables.

Still required before full `RUNTIME_VERIFIED`:

1. at least one authenticated test user/workspace membership is bootstrapped;
2. RLS proves cross-workspace denial;
3. real save/list/update/delete smoke passes.

Before `ACTIVATED`:

1. MasterV auth/session authority is wired;
2. server/UI persistence path uses the authenticated user token or equivalent trusted server identity;
3. refresh persistence is browser-tested;
4. no service-role credential is exposed to client code.

## Next

`MV-ARCH-2C — Auth/Workspace Bootstrap + Live Supabase Persistence Smoke`

The next unresolved product decision is the authentication model for the MVP. The live database is ready for that stage; it should not be bypassed with a client-exposed service-role credential.
