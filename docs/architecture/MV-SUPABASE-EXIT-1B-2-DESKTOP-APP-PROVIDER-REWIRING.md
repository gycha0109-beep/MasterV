# MV-SUPABASE-EXIT-1B-2 — Desktop App Provider Rewiring

**Stage:** MV-SUPABASE-EXIT-1B-2  
**Architecture Authority:** `MV-ARCH-001`  
**Implementation Status:** IMPLEMENTED / EXACT-HEAD VERIFICATION REQUIRED  
**Activation Status:** LEGACY AUTHORITY PRESERVED

## Purpose

EXIT-1B-2 moves the primary Desktop consumer behind the backend provider boundary created in EXIT-1B-1. It removes backend implementation knowledge from `desktop/app.js` while preserving the current Supabase and hosted runtime as the active legacy adapters.

This is structural decoupling, not a persistence migration or authority switch.

## Consumer Boundary

```text
desktop/app.js
        |
        v
window.MASTERV_BACKEND
  |-- session
  |-- workData
  `-- remoteOperations
        |
        v
legacy adapters
  |-- Supabase Auth
  |-- Supabase PostgREST / RLS
  `-- existing hosted API boundaries
```

`desktop/app.js` no longer owns Supabase config lookup, `/auth/v1` or `/rest/v1` paths, Authorization/apikey header construction, hosted endpoint construction, or direct `fetch()` transport.

## Session Consumer

Login delegates to `backend.session.openSession(...)`. Logout delegates to `backend.session.closeSession(...)`. The current adapter still performs the existing email/password Supabase authentication and returns a provider-neutral session object.

No Product Key or Polar session is introduced.

## Work Data Consumer

The following application operations now use `WorkDataProvider`:

```text
bootstrapPersonalWorkspace
listReferenceLibrary
fetchReferenceDetail
deleteReferenceLibraryEntry
```

The implementation remains the legacy Supabase/PostgREST adapter. Reference Library product authority is unchanged and Local SQLite remains dormant.

## Remote Operation Consumer

The following `desktop/app.js` operations now use `RemoteOperationClient`:

```text
probeCapabilities
compileReferenceWorkflow
discoverYouTube
```

The current hosted endpoint, JWT transport, contract validation, and operation payload construction remain inside the legacy hosted adapter.

Deep Analysis, Production Guidance, and Background Batch methods are represented by the provider contract but their UI consumers are not rewired in EXIT-1B-2.

## Transitional Runtime Ordering

The current Deep Analysis and Background Batch scripts still intercept hosted requests to discover the authenticated bearer credential. Generated runtime assets therefore load in this order:

```text
config.js
deep-analysis.js
background-batch.js
provider-boundary.js
legacy session adapter
legacy work-data adapter
legacy hosted API adapter
backend.js
app.js
```

This makes the legacy adapters capture the already-wrapped `window.fetch`. The ordering is transitional and should disappear when those consumers are rewired in the next EXIT-1B step.

## Static Asset Packaging

`scripts/build-desktop-static.mjs` copies the complete `desktop/backend` tree into `desktop-dist/backend` and injects the provider scripts before `app.js` in the generated runtime index.

## Authority Boundary

```text
migration_stage                   = MV-SUPABASE-EXIT-1B-2
consumer_wired                    = true
consumer_scope                    = desktop/app.js
deep_analysis_consumer_wired      = false
background_batch_consumer_wired   = false
product_authority_active          = false
supabase_authority_unchanged      = true
local_sqlite_authority_active     = false
gateway_active                    = false
polar_active                      = false
```

## Verification

The dedicated contract requires `desktop/app.js` to contain zero direct occurrences of backend implementation details including Supabase config, Supabase endpoints, Authorization/apikey construction, hosted endpoint names, and direct `fetch()` calls. It verifies delegation through the provider methods used by the application and verifies generated runtime script ordering.

Existing Reference Library, Reference Detail/Compare, hosted Reference Compiler, hosted YouTube Discovery, Desktop shell, and EXIT-1B-1 contracts remain regression authorities, with transport assertions relocated to the legacy adapters.

## Non-Goals

EXIT-1B-2 does not switch Reference Library to SQLite, migrate hosted data, remove Supabase Auth/configuration, implement MasterV Gateway, implement Product Key/Polar, change Deep Analysis transport ownership, change Background Batch transport ownership, change updater authority, merge PR #1, or deploy/activate a new backend.

## Progression

```text
EXIT-1A Local SQLite Foundation
        ↓
EXIT-1B-1 Backend Provider Boundary
        ↓
EXIT-1B-2 app.js Consumer Rewiring
        ↓
EXIT-1B-3 Deep Analysis / Background Batch Consumer Rewiring
        ↓
EXIT-1C Stateless MasterV Gateway
```
