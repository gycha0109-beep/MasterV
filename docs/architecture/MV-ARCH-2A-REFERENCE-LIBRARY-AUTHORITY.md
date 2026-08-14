# MV-ARCH-2A — Persistent Reference Library Authority

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Move the comparison/reference domain away from a browser-session-only identity model without pretending that local process state is production persistence.

Original pre-2A behavior:

```text
Deep analysis result
  -> React SavedReference[]
  -> comparison
  -> refresh/tab loss removes the saved set
```

Verified architecture:

```text
Deep analysis result
  -> canonical reference snapshot
  -> authenticated workspace-scoped Reference Library Store
  -> Supabase Postgres + RLS
  -> list/get/upsert/delete
  -> browser reload
  -> session + DB reference restore
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

Consumers derive current metrics at read/use time.

## Workspace isolation

The store contract is scoped by `workspace_id`.

Runtime authorization is supplied by the later Supabase/Auth layers:

```text
workspace_id = user:<auth.uid()>
```

RLS, not a client-supplied workspace string, is the authorization authority.

The final live smoke proved that an authenticated user cannot write to an unowned workspace.

## Store contract

```ts
interface ReferenceLibraryStore {
  list(workspaceId): Promise<ReferenceLibraryRecord[]>;
  get(workspaceId, sourceId): Promise<ReferenceLibraryRecord | null>;
  upsert(input): Promise<ReferenceLibraryRecord>;
  delete(workspaceId, sourceId): Promise<boolean>;
}
```

`InMemoryReferenceLibraryStore` remains the executable domain contract adapter.

Production persistence is provided separately by `SupabaseReferenceLibraryStore`; the in-memory adapter itself is never treated as durable persistence.

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

`referenceLibraryRecordToComparisonInput()` converts a stored record into the existing `ReferenceComparisonInput` without changing comparison semantics.

Comparison identity uses canonical `source_id`, while display text uses the saved label.

## Executable domain contract

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

## Static verification evidence

Initial CI run `31766899568` reached the new contract after all preceding regressions passed, then failed only because the test harness used top-level `await` while the current `tsx` path emitted CJS.

The harness entrypoint was corrected without changing store semantics.

Verification run:

```text
run_id: 31766974850
head: 24744d9f309585e1db7ea63ef7dc9049cdacd10f
result: SUCCESS
```

The domain contract has remained in every subsequent CI run.

## Production implementation

MV-ARCH-2B replaced the earlier SQL design target with the live Supabase implementation:

- `masterv_workspace_members`;
- `reference_library_entries`;
- primary key `(workspace_id, source_id)`;
- RLS;
- database-owned revision/timestamps;
- authenticated PostgREST adapter;
- read-time canonical/cache-key integrity validation.

MV-ARCH-2C added:

- real Supabase Auth session;
- deterministic personal workspace bootstrap;
- React persistence wiring;
- session restore;
- browser reload restoration.

## Final runtime evidence

Final successful persistence Runtime Smoke:

```text
run_id: 31834335727
execution_ref: feat/mvp-foundation
checkout_sha: 10ac63448ce74b5cf37c10eaabf27db2649a01d6
job: reference-library-smoke
conclusion: success
```

Server-side Reference Library result:

```text
status: REFERENCE_LIBRARY_LIVE_SMOKE_PASS
source_id: yt:MVpersist01
revision: 2
first_saved_at_preserved: true
cross_workspace_write_denied: true
gemini_requests_executed: 0
youtube_requests_executed: 0
```

Browser persistence result:

```text
status: REFERENCE_LIBRARY_BROWSER_SMOKE_PASS
reference_rest_requests: 6
analyze_requests: 0
restored_after_reload: true
```

This proves the 2A authority contract is not only statically modeled but used by the real authenticated Supabase persistence path and restored after browser reload.

Cleanup also passed. Direct DB verification after the workflow confirmed:

```text
workspace_members = 1
reference_entries = 0
```

The personal workspace membership remains intentionally durable while the synthetic smoke reference is removed.

## Runtime verdict

The original 2A blockers are resolved:

- a dedicated MasterV production-capable store exists;
- authenticated workspace authority exists;
- RLS isolation is verified live;
- real natural-key upsert/revision behavior is verified live;
- browser reload restores the DB-backed library;
- comparison can consume persisted records through the existing conversion boundary.

Therefore:

```text
MV-ARCH-2A = RUNTIME_VERIFIED / NOT ACTIVATED
```

## Activation boundary

`RUNTIME_VERIFIED` does not mean end-user production activation.

Before `ACTIVATED`:

- the intended deployment environment must receive the public Supabase configuration;
- deployed real-user Auth/onboarding behavior must be accepted;
- deployed persistence must receive its own smoke verification;
- no service-role credential may be exposed to browser code.

## Next

Persistence architecture 2A -> 2B -> 2C is runtime-verified. The next persistence work is deployment/activation hardening, not another storage-contract stage.
