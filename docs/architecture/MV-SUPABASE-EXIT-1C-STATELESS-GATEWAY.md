# MV-SUPABASE-EXIT-1C — Stateless Gateway

Status: IMPLEMENTED / NOT ACTIVATED

## Purpose

Introduce the target MasterV Gateway as a thin, stateless, DB-less server boundary without expanding the Gateway into a central application backend.

Target architecture basis:

```text
POST /v1/license/activate
POST /v1/session
GET  /v1/entitlement
POST /v1/discovery
POST /v1/analyze
POST /v1/guidance
```

The target request flow is:

```text
request
  -> credential validation
  -> license / entitlement validation
  -> usage validation
  -> provider request
  -> usage accounting
  -> response
```

EXIT-1C establishes that shape. EXIT-1D owns Polar product-key activation, device activation, session issuance, entitlement, and usage provider activation.

## Implemented Source Boundary

```text
gateway/
├─ contracts.ts
├─ errors.ts
├─ input.ts
├─ core.ts
├─ runtime.ts
├─ node-server.ts
└─ providers/
   ├─ gemini-ai-provider.ts
   └─ youtube-discovery-provider.ts
```

### Provider contracts

The Gateway declares explicit provider boundaries for:

- `GatewayLicenseProvider`
- `GatewayBillingProvider`
- `GatewayCredentialProvider`
- `GatewayEntitlementProvider`
- `GatewayUsageProvider`
- `GatewayAiProvider`
- `GatewayDiscoveryProvider`

This keeps external vendor implementations replaceable and prevents the HTTP surface from becoming the vendor contract.

## Active Compute Adapters

### Gemini

`GeminiAiProvider` owns server-side access to:

- `GEMINI_API_KEY`
- deep analysis model configuration
- Product Truth interpretation model configuration

It reuses the existing canonical MasterV cores rather than duplicating product logic:

- `analyzeYouTubeVideoWithKey`
- `deriveVideoMetrics`
- `interpretProductTruthAgainstReferenceWithKey`
- `compileSingleVideoProductionGuide`

### YouTube

`YouTubeDiscoveryGatewayProvider` owns server-side access to:

- `YOUTUBE_DATA_API_KEY`

It reuses `discoverYouTubeCandidatesWithKey` and preserves existing YouTube quota/upstream error classification.

## Fail-Closed License Boundary

EXIT-1C does not invent a temporary authentication model.

Until EXIT-1D provides real license/session/entitlement/usage providers:

```text
POST /v1/license/activate -> 501 GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE
POST /v1/session          -> 501 GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE
GET  /v1/entitlement     -> fail closed without credential+entitlement providers
paid AI routes           -> fail closed without credential+entitlement+usage providers
```

A product key is not accepted as a generic bearer credential.

## Stateless / DB-less Invariants

The Gateway owns no MasterV central application DB.

Forbidden inside `gateway/`:

```text
Supabase
PostgreSQL
Redis
Cloudflare D1
SQLite
Prisma
Reference Library persistence
Background Batch durable ledger
server session DB
user work DB
```

The Gateway receives request payloads, validates authority through providers, executes external provider calls, optionally records usage through an external provider, and returns the response. It does not persist the user's project/work history.

## Intentionally Not Ported

### Reference Workflow by server-side IDs

The legacy hosted `reference_workflow` loads Reference Library rows from Supabase. That operation is not ported to the Gateway because the target Reference Library authority is Local SQLite.

Future workflows must pass only the minimum explicit transient data needed for remote AI compute; the Gateway must not regain central Reference Library authority.

### Durable Background Batch Ledger

The current Supabase background-batch function owns a durable DB ledger. It is not ported to the stateless Gateway.

A later design may use local orchestration or an external provider-native job primitive, but EXIT-1C does not create a MasterV-owned central job database.

## Activation State

```text
Gateway source implemented          = true
Gateway stateless contract          = true
Gateway central DB                  = none
Gemini server adapter               = implemented
YouTube server adapter              = implemented
License provider                    = interface only
Billing provider                    = interface only
Credential provider                 = interface only
Entitlement provider                = interface only
Usage provider                      = interface only
Polar active                        = false
Desktop wired to Gateway            = false
Supabase authority unchanged        = true
Local SQLite product authority      = false
Gateway production activation       = false
```

This is deliberate. Wiring Desktop traffic before EXIT-1D would require either retaining Supabase JWT as the Gateway authority or creating an incomplete temporary license model. Both are rejected.

## Verification

`.github/workflows/mv-supabase-exit-1c.yml` verifies:

- EXIT-1B closeout remains valid
- Gateway route surface exists
- Gateway provider boundaries exist
- Gateway has no Supabase/central DB dependency
- Gateway health response declares stateless + DB-less + no user-work storage
- license activation is fail-closed before EXIT-1D
- protected compute rejects missing session credentials before provider execution
- discovery is zero-credit
- analyze/guidance pass entitlement + usage validation
- server provider secret ownership uses non-public env names
- TypeScript build remains valid
- canonical YouTube / production guidance / Gemini error contracts regress cleanly

## Next Phase

`MV-SUPABASE-EXIT-1D — Product-Key / Polar`

EXIT-1D will supply the currently inactive provider contracts with Polar-backed activation, entitlement, device, session, and usage authority. Only after that authority exists should Desktop Gateway transport be activated.
