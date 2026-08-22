# MV-PILOT-1B — Gateway Production Activation Contract & Pre-Deployment Gate

## Starting authority

```text
main = 19881cdf2a0e7f3a23b2263a5f588c2f134e9896
tree = 6a7569925e4c597d9c5b30b4aa1e986b5941bd02
MV_PILOT_1A = MERGED / CLOSED
GATEWAY_SERVERLESS_SURFACE = READY
GATEWAY_PRODUCTION_SURFACE_ISOLATION = READY
DESKTOP_GATEWAY_BUILD_BINDING = PASS
PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE
PRODUCTION_GATEWAY_DEPLOYMENT = NOT_EXECUTED
EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION
```

MV-PILOT-1B is a governance and executable-contract stage. It freezes what must be true before and after a future production Gateway activation. It does **not** authorize or perform that activation.

```text
ACTIVATION_CONTRACT != PRODUCTION_MUTATION_AUTHORITY
READINESS != DEPLOYMENT
READINESS != SECRET_REGISTRATION
READINESS != POLAR_PRODUCTION_MUTATION
READINESS != SIGNING_AUTHORITY
READINESS != RELEASE_PUBLICATION
```

## Target Architecture authority

The MasterV Target Architecture remains authoritative:

```text
MasterV Gateway = thin + stateless + DB-less
MasterV central application DB = NONE
user work data authority = Local SQLite
provider secrets = server-side only
Product Key = activation bootstrap only
Product Key != normal API bearer
Desktop vendor-specific backend hostname dependency = forbidden
recommended public Gateway authority = https://api.masterv.<domain>
update access != subscription access
updater artifact authenticity = Tauri signature verification
```

The product Gateway contract remains:

```text
POST /v1/license/activate
POST /v1/session
GET  /v1/entitlement
POST /v1/discovery
POST /v1/analyze
POST /v1/guidance
```

Operational health remains:

```text
GET /v1/health
```

## Read-only hosting inventory observation

A read-only Vercel inventory was revalidated on 2026-08-22 before this stage started.

Observed team:

```text
team = Jihwan Chas projects
team_id = team_xuYA9OhCWlJETaYFOmeVodgS
```

Observed projects:

```text
k-beauty
ranking
build-map
```

No MasterV project was present.

Therefore the current authority is:

```text
VERCEL_MASTERV_PROJECT = NOT_FOUND_READ_ONLY_2026_08_22
HOSTING_PLANE = UNRESOLVED
CANONICAL_GATEWAY_HOSTNAME = UNRESOLVED
```

This observation is not permission to create a project. Hosting-plane selection remains a future explicit production decision.

## Production activation descriptor

Before any production mutation, the operator must resolve one immutable activation descriptor containing only identifiers, booleans, and non-secret configuration metadata.

Required fields conceptually include:

```text
hosting_plane
hosting_project_reference
canonical_gateway_origin
accepted_main_sha
deployment_source_sha
production_surface = gateway-only
production_web_override_allowed = false
stateless = true
db_less = true
central_application_db_present = false
user_work_data_storage = false
server_secret_presence
polar_product_authority_readiness
explicit_production_mutation_approval
```

The activation descriptor must never contain secret values.

```text
SECRET_PRESENCE_BOOLEAN = ALLOWED
SECRET_VALUE_IN_ACTIVATION_EVIDENCE = FORBIDDEN
```

## Canonical Gateway hostname contract

The distributed Desktop must bind only to a canonical MasterV-controlled HTTPS origin.

Required shape:

```text
https://api.masterv.<domain>
```

The origin must:

```text
use HTTPS
have no username/password
have no non-default explicit port
have path = /
have no query
have no fragment
use an api.masterv.* hostname
not use a reserved test-only suffix
not use a vendor deployment hostname as product authority
```

Forbidden production authorities include:

```text
*.vercel.app
*.workers.dev
*.r2.dev
*.supabase.co
*.example
*.test
*.invalid
localhost
```

`https://api.masterv.example` remains CI-only and can never become production Desktop authority.

If Vercel is eventually selected as the hosting plane, the Vercel project/deployment URL remains infrastructure detail. The Desktop still binds only to the MasterV-controlled custom hostname.

## Exact-source deployment gate

Production Gateway deployment must use an exact accepted `main` SHA.

Immediately before any future deployment mutation:

```text
1. re-read authoritative main
2. freeze accepted_main_sha
3. resolve deployment source SHA
4. require deployment_source_sha == accepted_main_sha
5. reject branch-name-only or moving-ref evidence
```

A production deployment built from a different SHA is not accepted evidence for MV-PILOT-1.

## Gateway server-side authority completeness

The existing runtime creates Polar authority only when this tuple is complete:

```text
POLAR_ACCESS_TOKEN
POLAR_ORGANIZATION_ID
GATEWAY_CREDENTIAL_SIGNING_SECRET
```

Partial Polar configuration is invalid and must fail closed.

For the real external pilot, the full paid-operation path also requires:

```text
POLAR_AI_METER_ID
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
```

Therefore the pilot-required production presence set is:

```text
POLAR_ACCESS_TOKEN = PRESENT_SERVER_SIDE
POLAR_ORGANIZATION_ID = PRESENT_SERVER_SIDE
GATEWAY_CREDENTIAL_SIGNING_SECRET = PRESENT_SERVER_SIDE
POLAR_AI_METER_ID = PRESENT_SERVER_SIDE
GEMINI_API_KEY = PRESENT_SERVER_SIDE
YOUTUBE_DATA_API_KEY = PRESENT_SERVER_SIDE
```

These are presence requirements only. Their values must never be committed, printed into CI evidence, embedded in Desktop, or copied into activation artifacts.

Optional governed settings remain:

```text
POLAR_API_BASE_URL
POLAR_USAGE_EVENT_NAME
POLAR_PLAN_METADATA_KEY
GATEWAY_DEVICE_CREDENTIAL_TTL_SECONDS
GATEWAY_SESSION_CREDENTIAL_TTL_SECONDS
GEMINI_MODEL
GEMINI_PRODUCT_TRUTH_MODEL
```

## Polar product-authority prerequisites

Environment-variable presence alone is insufficient for pilot readiness.

The current Polar adapter requires product-side authority capable of producing:

```text
active license
valid device activation
customer benefit grant
plan metadata under masterv_plan unless explicitly configured otherwise
active AI usage meter matching POLAR_AI_METER_ID for non-owner paid usage
usage-event ingestion authority
```

The runtime is intentionally fail closed:

```text
missing plan metadata -> GATEWAY_PLAN_NOT_CONFIGURED
non-owner + missing AI meter id -> GATEWAY_USAGE_METER_NOT_CONFIGURED
inactive license -> GATEWAY_LICENSE_INACTIVE
insufficient usage -> GATEWAY_USAGE_DENIED
```

MV-PILOT-1B does not create, modify, or validate a real Polar production Product Key. Real Product Key submission remains prohibited until the external-human pilot execution stage.

## Production HTTP surface gate

MV-PILOT-1A already froze production to Gateway-only.

The future production deployment must retain:

```text
PRODUCTION_DEPLOYMENT_SURFACE = GATEWAY_ONLY
PRODUCTION_WEB_OVERRIDE_ALLOWED = FALSE
PRODUCTION_GATEWAY_PUBLIC_SURFACE = /v1/* ONLY
LEGACY_WEB_SURFACE = DEVELOPMENT_ONLY
```

Representative production probes after deployment must prove:

```text
GET /v1/health                         -> 200
OPTIONS /v1/health                     -> 204
/                                      -> 404 at production proxy
/api/analyze                           -> 404
/api/discover/youtube                  -> 404
/api/interpret-product-truth           -> 404
```

Rejected non-`/v1` probes must execute no provider operation.

## Post-deployment health acceptance

A future production activation is not accepted merely because a deployment reports READY.

`GET /v1/health` must prove:

```text
service = masterv-gateway
contract_version = mv-gateway-v1
architecture.stateless = true
architecture.db_less = true
architecture.user_work_data_storage = false
providers.license = true
providers.billing = true
providers.credential = true
providers.entitlement = true
providers.usage = true
providers.ai = true
providers.discovery = true
```

The health response must expose only booleans/architecture metadata and never secret values.

The production acceptance evidence must additionally bind:

```text
canonical_gateway_origin
accepted_main_sha
deployment_source_sha
hosting project/deployment identifier
production surface result
health result
representative rejected-route results
```

## Mutation sequencing

A future production Gateway activation must be split from release/signing authority.

Gateway activation sequence:

```text
1. explicit hosting-plane decision
2. explicit production-mutation approval
3. create/select isolated MasterV Gateway project if required
4. configure Gateway-only production surface
5. attach canonical MasterV-controlled custom hostname
6. register server-side secrets without exposing values
7. configure/verify required Polar product authority
8. deploy exact accepted main SHA
9. perform read-only health and surface acceptance
10. freeze deployment evidence
```

Only after the Gateway passes acceptance may a separate Desktop release stage proceed:

```text
11. choose a new immutable Desktop version > 0.1.4
12. compile with MASTERV_GATEWAY_BASE_URL=https://api.masterv.<domain>
13. independently authorize production signing
14. create Tauri-signed updater artifacts
15. independently authorize release publication
16. publish through the subscription-independent updater channel
17. verify the published Desktop reports gateway_configured=true
18. only then execute the external-human pilot contract
```

Gateway deployment approval does not imply signing or release-publication approval.

## Explicit non-authority in MV-PILOT-1B

This stage does not authorize or execute:

```text
Vercel project creation
Vercel production deployment
custom-domain creation/attachment/change
DNS mutation
server secret creation/registration/change
Polar production mutation
Product Key creation or submission
real license activation
real paid provider operation
production signing credential use
GitHub Release creation/upload/edit
latest.json replacement
external-human pilot execution
```

No production secret may be injected into PR CI.

No new automatic workflow is required for this stage.

## Deterministic contract requirements

The executable MV-PILOT-1B contract must prove without network or credentials:

```text
[ ] MV-PILOT-1A readiness contract remains green
[ ] canonical production origin validator rejects HTTP
[ ] canonical production origin validator rejects vendor-specific hosts
[ ] canonical production origin validator rejects api.masterv.example
[ ] canonical production origin validator rejects path/query/fragment/userinfo/port variants
[ ] activation descriptor requires hosting plane resolution
[ ] activation descriptor requires exact accepted-main/source-SHA equality
[ ] activation descriptor requires gateway-only surface
[ ] activation descriptor requires stateless + DB-less + no central app DB + no user work storage
[ ] activation descriptor requires full pilot server-side presence set
[ ] activation descriptor requires Polar plan/meter readiness booleans
[ ] activation descriptor requires explicit future production-mutation approval
[ ] current unresolved production state fails the future-activation descriptor
[ ] synthetic fully resolved descriptor passes without containing secret values
[ ] post-deployment evidence schema requires all Gateway provider booleans true
[ ] post-deployment evidence schema requires representative legacy/non-v1 404 results
[ ] existing runtime still rejects partial Polar authority
[ ] existing runtime still requires AI meter for non-owner paid usage
[ ] PR CI receives no production Gateway/Polar/provider/signing secret
[ ] automatic PR workflows remain exactly CI + EXIT-3
[ ] production mutation executed by this stage = false
```

## Current blocker after this stage

Even after the contract is green, current production remains intentionally blocked:

```text
HOSTING_PLANE = UNRESOLVED
CANONICAL_GATEWAY_HOSTNAME = UNRESOLVED
PRODUCTION_GATEWAY_PROJECT = NOT_ESTABLISHED
PRODUCTION_SERVER_SECRET_REGISTRATION = NOT_EXECUTED
POLAR_PRODUCTION_CONFIGURATION = NOT_EXECUTED
PRODUCTION_GATEWAY_DEPLOYMENT = NOT_EXECUTED
PRODUCTION_GATEWAY_ACTIVATION_AUTHORIZED = FALSE
PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE
EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION
```

## Stage target

If exact-head CI is green:

```text
MV_PILOT_1B = ACTIVATION_CONTRACT_FROZEN
GATEWAY_PRODUCTION_ACTIVATION_DESCRIPTOR = READY
GATEWAY_PRODUCTION_POST_DEPLOYMENT_ACCEPTANCE_SCHEMA = READY
HOSTING_PLANE = UNRESOLVED
CANONICAL_GATEWAY_HOSTNAME = UNRESOLVED
PRODUCTION_GATEWAY_ACTIVATION_AUTHORIZED = FALSE
PRODUCTION_GATEWAY_DEPLOYMENT = NOT_EXECUTED
PRODUCTION_SIGNING_AUTHORIZED = FALSE
RELEASE_PUBLICATION_AUTHORIZED = FALSE
EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION
MV_PILOT_1 = BLOCKED_PENDING_EXPLICIT_PRODUCTION_GATEWAY_ACTIVATION
```

This is a contract freeze, not production activation.