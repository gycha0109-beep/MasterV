# MV-SUPABASE-EXIT-1B-3 — Deep Analysis / Background Batch Consumer Rewiring

## Status

Implemented on `feat/mvp-foundation`. This phase changes Desktop consumer ownership only. Product authority remains unchanged.

## Objective

Remove the remaining direct Supabase/hosted transport knowledge from the active Deep Analysis, Production Guidance, and Background Batch Desktop consumers.

The target runtime shape for this phase is:

```text
Desktop consumers
  ├─ app.js
  ├─ deep-analysis.js
  └─ background-batch.js
        ↓
MASTERV_BACKEND
  ├─ Session runtime
  ├─ WorkDataProvider
  └─ RemoteOperationClient
        ↓
legacy adapters
  ├─ Supabase session
  ├─ Supabase work data
  └─ existing hosted API
```

## Changes

### Provider runtime state

`desktop/backend/provider-boundary.js` now owns process-memory active-session state and the latest main capability snapshot.

Neutral runtime methods:

- `backend.session.current()`
- `backend.session.subscribe(listener)`
- `backend.remoteOperations.currentCapabilities()`
- `backend.remoteOperations.subscribeCapabilities(listener)`

The session credential is still the existing legacy bearer credential. This phase does not introduce product keys, device credentials, Polar, or Gateway session credentials.

### Deep Analysis / Production Guidance

`desktop/deep-analysis.js` no longer:

- reads `MASTERV_DESKTOP_CONFIG`
- reads a Supabase publishable key
- constructs Authorization/apikey headers
- knows the hosted boundary URL
- patches `window.fetch`
- discovers a bearer credential by observing another consumer's request

It delegates:

- Deep Analysis → `backend.remoteOperations.analyzeYouTube`
- Production Guidance → `backend.remoteOperations.generateProductionGuidance`

Capability state is received through the provider runtime capability subscription.

### Background Batch

`desktop/background-batch.js` no longer:

- reads `MASTERV_DESKTOP_CONFIG`
- constructs Authorization/apikey headers
- knows the background boundary URL
- patches `window.fetch`
- extracts credentials from unrelated hosted requests

It delegates capability/list/submit/check operations through `RemoteOperationClient`.

The existing user-triggered refresh semantics are preserved. Background Batch does not auto-probe, auto-list, auto-poll, or auto-submit after login.

### Runtime load compatibility

The existing static script order is preserved for release regression stability. Deep Analysis and Background Batch register a bounded `masterv:backend-ready` initializer when `MASTERV_BACKEND` is not available yet. `backend.js` emits that neutral readiness event after composition.

This is not an authentication transport and carries no credential or provider-specific data.

## Authority invariants

```text
product_authority_active       = false
supabase_authority_unchanged   = true
local_sqlite_authority_active  = false
gateway_active                 = false
polar_active                   = false
fetch_monkey_patch_active      = false
```

Reference Library authority remains Supabase/PostgREST/RLS. Hosted AI and Background Batch authority remain the existing hosted functions. Local SQLite remains foundation-only.

## Non-goals

This phase does not:

- switch Reference Library authority to SQLite
- migrate hosted data
- remove Supabase Auth
- remove Supabase build/runtime config
- implement MasterV Gateway
- implement Polar/product-key activation
- alter Background Batch provider gates
- alter updater authority
- merge PR #1

## Verification

The dedicated contract requires:

- zero direct `fetch()` calls in active Deep/Batch consumers
- zero `window.fetch` monkey patches in active Deep/Batch consumers
- zero Supabase URL/key/auth-header knowledge in those consumers
- provider-backed session state
- provider-backed capability state
- preserved Deep Analysis, Production Guidance, and Background Batch hosted contracts
- unchanged SQLite/Supabase product-authority flags
