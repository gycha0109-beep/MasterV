# MV-SUPABASE-EXIT-1B-1 — Backend Provider Boundary

**Stage:** MV-SUPABASE-EXIT-1B-1  
**Parent Stage:** MV-SUPABASE-EXIT-1B — Backend Provider Abstraction  
**Architecture Authority:** `MV-ARCH-001`  
**Implementation Status:** IMPLEMENTED / EXACT-HEAD VERIFICATION REQUIRED  
**Consumer Wiring:** NOT STARTED  
**Activation Status:** NOT ACTIVATED  

## 1. Purpose

This substage establishes a vendor-neutral Desktop backend provider contract and legacy adapters that mirror the current Supabase/Hosted implementation without changing runtime product authority.

The purpose is to make the later migration mechanically bounded:

```text
Desktop UI
    ↓
Backend Provider Contract
    ├─ SessionProvider
    ├─ WorkDataProvider
    └─ RemoteOperationClient
            ↓
      Legacy adapters now
      Gateway / Local SQLite later
```

EXIT-1B-1 deliberately does **not** switch existing Desktop consumers to the new boundary. Consumer rewiring is a later EXIT-1B substage.

## 2. Authority Boundary

During EXIT-1B-1:

```text
Provider boundary source             = implemented
Existing Desktop consumers wired     = false
Product persistence authority        = existing Supabase path
Local SQLite product authority       = false
MasterV Gateway active               = false
Polar active                         = false
Supabase authority                   = unchanged
Hosted data mutation by this stage   = none
Provider construction network I/O    = zero
```

The new provider composition reports these facts explicitly through immutable authority metadata.

## 3. Provider Contract

Contract version:

```text
mv-backend-provider-v1
```

### SessionProvider

Required methods:

```text
configured
openSession
closeSession
describeSession
```

The contract uses a generic credential/session shape. Supabase email/password details exist only inside the legacy session adapter.

### WorkDataProvider

Required methods:

```text
bootstrapPersonalWorkspace
listReferenceLibrary
fetchReferenceDetail
deleteReferenceLibraryEntry
```

The provider boundary itself does not know PostgREST paths, RLS headers, workspace table names, or Supabase hostnames.

### RemoteOperationClient

Required methods:

```text
probeCapabilities
compileReferenceWorkflow
discoverYouTube
analyzeYouTube
generateProductionGuidance
probeBackgroundBatch
listBackgroundBatchJobs
submitBackgroundBatchJob
checkBackgroundBatchJob
```

The boundary is semantic. Hosted route names, authorization headers, Supabase publishable keys, and current contract assertions remain inside the legacy adapter.

## 4. Legacy Adapters

EXIT-1B-1 adds three adapters that mirror the current implementation.

### Legacy Supabase Session Provider

Owns:

```text
/auth/v1/token?grant_type=password
Supabase publishable key header
email/password bootstrap
Supabase access token normalization
```

`closeSession` intentionally performs no remote logout request in this substage because the current Desktop logout is an in-memory session disposal. This preserves current behavior until consumer rewiring explicitly changes it.

### Legacy Supabase Work Data Provider

Owns:

```text
masterv_workspace_members bootstrap
reference_library_entries list
reference detail retrieval
reference delete
PostgREST query construction
Supabase JWT + apikey headers
```

### Legacy Hosted API Client

Owns current semantic operations over:

```text
masterv-api-boundary
masterv-background-batch-boundary
```

It preserves the current hosted contract/authority checks for Reference Compare/Evidence, YouTube Discovery, Deep Analysis, Production Guidance, and guarded Background Batch operations.

## 5. Security and Side-Effect Contract

Constructing the provider composition must not:

- perform network requests,
- open or mutate Local SQLite,
- mutate hosted data,
- activate a Gateway,
- activate Polar,
- change Supabase authority,
- create a session.

The provider object and its authority metadata are frozen to prevent accidental replacement after composition.

## 6. Consumer Wiring Boundary

The following files intentionally remain on their current direct implementation in EXIT-1B-1:

```text
desktop/app.js
desktop/deep-analysis.js
desktop/background-batch.js
desktop/session-bridge.js
```

That is not a defect in this substage. EXIT-1B-2 and EXIT-1B-3 will move those consumers behind the provider boundary and remove duplicated transport/auth logic.

Because the new provider source is not yet loaded by `desktop/index.html`, this substage cannot alter runtime behavior accidentally.

## 7. Local SQLite Boundary

EXIT-1A remains unchanged:

```text
product_authority_active = false
supabase_authority_unchanged = true
```

No Reference Library, analysis result, comparison, Production Guidance, or settings workflow is switched to SQLite here.

## 8. Verification Contract

Static contract marker:

```text
MASTERV_SUPABASE_EXIT_1B_1_PROVIDER_BOUNDARY_CONTRACT_PASS
```

The dedicated contract verifies:

1. all provider assets exist,
2. the provider boundary contains no Supabase URL/key/Auth/PostgREST implementation detail,
3. legacy session adapter owns the current Supabase Auth route,
4. legacy work-data adapter owns current PostgREST Reference Library routes,
5. legacy hosted adapter owns current hosted API routes,
6. all required provider methods are present,
7. provider and authority objects are immutable,
8. `consumer_wired = false`,
9. `product_authority_active = false`,
10. `supabase_authority_unchanged = true`,
11. `gateway_active = false`,
12. `polar_active = false`,
13. provider construction performs zero network requests.

## 9. Non-Goals

EXIT-1B-1 does not implement:

- Desktop consumer rewiring,
- direct Supabase references removal from current UI files,
- session-bridge removal,
- Local SQLite product wiring,
- hosted-to-local migration,
- MasterV Gateway deployment,
- product-key activation,
- Polar integration,
- updater migration,
- Supabase runtime removal.

## 10. Progression

```text
EXIT-1A Local SQLite Foundation
        ↓
EXIT-1B-1 Provider Contract + Legacy Adapters
        ↓
EXIT-1B-2 app.js Consumer Rewiring
        ↓
EXIT-1B-3 Deep Analysis / Background Batch Rewiring
        ↓
EXIT-1B-4 Session Bridge / Config Neutralization
        ↓
EXIT-1C Stateless MasterV Gateway
```

EXIT-1B is complete only after the active Desktop consumer surface no longer constructs Supabase/Hosted transport details directly.
