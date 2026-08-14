# MV-ARCH-2A — Persistent Reference Library Authority

Status: **IMPLEMENTED_UNVERIFIED / PRODUCTION_STORE_NOT_CONFIGURED / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Move the comparison/reference domain away from a browser-session-only identity model without pretending that local process state is production persistence.

Current UI behavior before 2A:

```text
Deep analysis result
  -> React SavedReference[]
  -> comparison
  -> refresh/tab loss removes the saved set
```

Target architecture:

```text
Deep analysis result
  -> canonical reference snapshot
  -> authenticated workspace-scoped Reference Library Store
  -> list/get/upsert/delete
  -> comparison derives current metrics from stored analysis snapshots
```

## Domain boundary

Reference Library is not the analysis cache.

- analysis cache answers: "can this exact analyzer request be reused?"
- reference library answers: "did this workspace intentionally save this reference for later work?"

Cache eviction must not delete a saved reference. Removing a saved reference must not invalidate analysis cache.

## Canonical natural key

MVP natural key:

```text
(workspace_id, canonical source_id)
```

For YouTube:

```text
source_id = yt:<native video id>
```

`youtu.be`, `/watch`, `/shorts`, `/embed`, and `/live` URL variants therefore converge on the same saved reference.

A re-save of the same canonical source updates the current snapshot and increments `revision`; it does not create a duplicate row.

## Record contract

`lib/reference-library.ts` defines `reference-library-v1`:

```text
schema_version
workspace_id
source {
  platform
  source_id
  canonical_url
  native_id
}
label
analysis
analysis_cache_key
analysis_provenance
first_saved_at
updated_at
revision
```

Only Deep analysis snapshots can enter the library in v1.

The analysis cache key is parsed and checked so that:

- provider is `youtube`;
- analyzer tier is `deep`;
- cache-key source ID equals the canonical URL source ID.

This prevents a valid analysis snapshot from being persisted under the wrong video identity.

## Derived metrics policy

`DerivedVideoMetrics` are intentionally **not persisted** in the Reference Library record.

They are deterministic application output derived from the stored `VideoAnalysis`. Persisting them would make old records retain stale derived values when metric logic changes.

Consumers should derive current metrics at read/use time.

## Workspace isolation

The store contract is scoped by `workspace_id` and the in-memory contract verifies cross-workspace isolation.

This is not an authentication mechanism.

Production API routes must obtain the workspace scope from trusted server-side authentication/membership state. A production route must not trust a client-supplied arbitrary `workspace_id` as authorization.

Because MasterV does not yet have that authenticated workspace authority, 2A does **not** expose a production Reference Library API and does **not** activate a database adapter.

## Store contract

```ts
interface ReferenceLibraryStore {
  list(workspaceId): Promise<ReferenceLibraryRecord[]>;
  get(workspaceId, sourceId): Promise<ReferenceLibraryRecord | null>;
  upsert(input): Promise<ReferenceLibraryRecord>;
  delete(workspaceId, sourceId): Promise<boolean>;
}
```

`InMemoryReferenceLibraryStore` exists only as the executable contract adapter.

It verifies semantics but is not durable and is not a production persistence claim.

## Upsert semantics

For a first save:

```text
revision = 1
first_saved_at = now
updated_at = now
```

For a later save of the same `(workspace_id, source_id)`:

```text
revision += 1
first_saved_at = preserved
updated_at = now
analysis = latest snapshot
analysis_cache_key = latest identity
analysis_provenance = latest provenance
label = latest label
```

List ordering is newest `updated_at` first with canonical source ID as a stable tie-breaker.

Returned records are cloned so callers cannot mutate store authority by changing an object they previously read.

## Comparison compatibility

`referenceLibraryRecordToComparisonInput()` converts a persisted record into the existing `ReferenceComparisonInput` without changing comparison semantics.

Comparison identity uses canonical `source_id`, while display text uses the saved label.

## Executable contract

`scripts/reference-library-contract.ts` verifies:

- deep cache-key parsing;
- rejection of coarse snapshots;
- canonical URL/source convergence;
- source/cache-key mismatch rejection;
- workspace ID validation;
- no persisted derived metrics;
- revision and timestamp semantics;
- same-source dedupe via upsert;
- workspace isolation;
- newest-first ordering;
- clone isolation;
- scoped deletion;
- comparison-input conversion.

CI command:

```text
npm run test:reference-library
```

## Production SQL target

A future relational adapter should map the domain approximately as:

```sql
create table reference_library_entries (
  workspace_id text not null,
  source_platform text not null,
  source_id text not null,
  native_id text not null,
  canonical_url text not null,
  label text not null,
  analysis jsonb not null,
  analysis_cache_key text not null,
  analysis_provenance text not null,
  schema_version text not null,
  revision integer not null,
  first_saved_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, source_id)
);
```

Before activation the production implementation must additionally provide:

- authenticated workspace membership authority;
- RLS or equivalent server authorization;
- transactional upsert preserving `first_saved_at` and incrementing `revision`;
- indexes for workspace/newest-first listing;
- bounded payload/error handling;
- deletion scoped to the authenticated workspace.

The SQL above is a design target only. No migration is applied in 2A.

## Supabase boundary

A Supabase connector is available, but no MasterV-specific production project/database was selected or created during 2A.

Existing unrelated projects are not reused implicitly.

Creating or selecting the production database is a separate activation decision.

## Status boundary

2A can become `STATIC_VERIFIED` after the new contract and the full existing CI/build pass on the exact branch head.

It cannot become `RUNTIME_VERIFIED` or `ACTIVATED` from the in-memory adapter.

## Next

`MV-ARCH-2B — Supabase Reference Library Adapter + Authenticated Server API`

2B should:

1. resolve the production workspace/auth model;
2. select or create the MasterV Supabase project explicitly;
3. apply a reviewed migration with RLS;
4. implement a server-only Supabase adapter;
5. expose scoped list/save/delete APIs;
6. wire the existing comparison tray to server authority;
7. verify refresh persistence and workspace isolation in runtime.
