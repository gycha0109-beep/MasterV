# MV-ARCH-2B — Supabase Reference Library Adapter

Status: **IMPLEMENTED_UNVERIFIED / LIVE_DB_NOT_APPLIED / NOT ACTIVATED**

Date: 2026-08-14

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

## Current boundary

A dedicated Supabase project named `MasterV` has been created externally, but at the time of this checkpoint it is still provisioning and is not yet visible through the connected Supabase MCP project list.

No migration has been applied to a live database in this stage.

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

## Authentication boundary

RLS is intentionally designed around `auth.uid()` workspace membership.

MasterV does not yet have a user sign-in/session flow wired into the application. Therefore this stage does not expose a public persistence API and does not replace the browser-session comparison tray yet.

A client-supplied arbitrary `workspace_id` must never be treated as authorization.

## Activation gate

Before `RUNTIME_VERIFIED`:

1. dedicated MasterV Supabase project reaches healthy state;
2. connector or trusted migration path can access it;
3. migration applies successfully;
4. at least one authenticated test user/workspace membership is bootstrapped;
5. RLS proves cross-workspace denial;
6. real save/list/update/delete smoke passes;
7. security and performance advisors are reviewed.

Before `ACTIVATED`:

1. MasterV auth/session authority is wired;
2. server/UI persistence path uses the authenticated user token or equivalent trusted server identity;
3. refresh persistence is browser-tested;
4. no service-role credential is exposed to client code.

## Next

`MV-ARCH-2C — Auth/Workspace Bootstrap + Live Supabase Persistence Smoke`

If the dedicated Supabase project becomes available first, apply and verify the migration before UI wiring.
