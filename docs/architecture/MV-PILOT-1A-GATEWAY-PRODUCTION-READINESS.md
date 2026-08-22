# MV-PILOT-1A — Gateway Production Readiness

## Starting authority

```text
main = 37d4f9523005dbdfc1e6c9d5d7858aea61180ed1
tree = eff23d17640d2e6a5a7010f5a622e1c40d9b685c
production desktop = v0.1.4
PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE
EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION
MV_PILOT_1 = BLOCKED_ON_PRODUCTION_GATEWAY_CONFIGURATION
```

The published `v0.1.4` observation is frozen by MV-PILOT-1:

```text
runtime_gateway_env_injected = false
gateway_configured = false
decision = BLOCKED_GATEWAY_NOT_CONFIGURED
product_key_submitted = false
activation_called = false
polar_mutation = false
gateway_deployment_mutation = false
external_human_pilot_executed = false
```

## Purpose

MV-PILOT-1A prepares the missing production boundaries without crossing production mutation authority:

1. make the existing stateless Gateway deployable through `/v1/*`;
2. make every production deployment fail closed to a Gateway-only HTTP surface so legacy web provider routes cannot bypass Gateway entitlement;
3. prove that a Desktop build compiled with a canonical HTTPS `MASTERV_GATEWAY_BASE_URL` observes `desktop_gateway_status.configured = true` without runtime URL injection.

This stage does **not** deploy the Gateway and does **not** publish a replacement Desktop release.

## Target architecture authority

The Target Architecture requires:

```text
MasterV Gateway = thin + stateless + DB-less
Desktop vendor-specific backend hostname dependency = forbidden
recommended public authority = https://api.masterv.<domain>
provider secrets = Gateway/server-side only
Product Key = activation bootstrap only, never normal bearer
user work data = Local SQLite
AI/provider request execution = MasterV Gateway
```

Gateway product routes remain:

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

## Serverless deployment surface

The repository exposes the existing `gateway/core.ts` through:

```text
app/v1/[...segments]/route.ts
```

The adapter:

```text
runtime = nodejs
dynamic = force-dynamic
GET/POST/OPTIONS -> gateway.handle(request)
```

It creates no MasterV database and adds no persistence layer.

A no-credential execution must remain useful for deployment diagnosis while failing closed for protected operations:

```text
GET /v1/health                  -> 200
POST /v1/license/activate       -> 501 GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE
provider network mutations      -> 0
```

The health response may reveal only deployment-safe capability booleans and architecture metadata. It must never reveal secret values.

## Production HTTP surface isolation

The repository still contains historical web-only routes:

```text
POST /api/analyze
POST /api/discover/youtube
POST /api/interpret-product-truth
```

Those routes invoke provider-oriented application logic directly and are **not** the governed Desktop Gateway contract. A production deployment must therefore never expose them as an alternate provider execution path.

Production is unconditionally Gateway-only:

```text
NODE_ENV = production
MASTERV_DEPLOYMENT_SURFACE unset      -> gateway
MASTERV_DEPLOYMENT_SURFACE=gateway   -> gateway
MASTERV_DEPLOYMENT_SURFACE=web       -> INVALID / fail closed

/v1/*                                 -> allowed to Gateway routing
all other public paths                -> proxy.ts 404
legacy /api/* direct handler calls    -> 404 before request parsing/provider execution
```

There is no production legacy-web escape hatch:

```text
PRODUCTION_WEB_OVERRIDE_ALLOWED = FALSE
LEGACY_WEB_SURFACE = DEVELOPMENT_ONLY
```

Development may retain the historical web surface for non-production compatibility and local testing. That development compatibility has no production authority.

This provides two fail-closed production layers:

```text
Layer 1: proxy.ts blocks every non-/v1 public path in production
Layer 2: legacy app/api handlers reject whenever effective surface != web
```

Therefore:

```text
LEGACY_WEB_API != GATEWAY_API
LEGACY_WEB_PROVIDER_ROUTE != ENTITLEMENT-AUTHORIZED PROVIDER EXECUTION
PRODUCTION_GATEWAY_PUBLIC_SURFACE = /v1/* ONLY
PRODUCTION_DEPLOYMENT_SURFACE = GATEWAY_ONLY
```

## Server-side production credential set

A future separately authorized Gateway production deployment will require server-side configuration. Secret values are never committed and never shipped to Desktop.

Required Polar authority tuple:

```text
POLAR_ACCESS_TOKEN
POLAR_ORGANIZATION_ID
GATEWAY_CREDENTIAL_SIGNING_SECRET
```

Provider execution credentials:

```text
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
```

Optional governed settings include:

```text
POLAR_API_BASE_URL
POLAR_AI_METER_ID
POLAR_USAGE_EVENT_NAME
POLAR_PLAN_METADATA_KEY
GATEWAY_DEVICE_CREDENTIAL_TTL_SECONDS
GATEWAY_SESSION_CREDENTIAL_TTL_SECONDS
GEMINI_MODEL
GEMINI_PRODUCT_TRUTH_MODEL
```

A partially configured Polar authority is invalid and must fail closed at runtime construction.

## Desktop production binding

The native Desktop already resolves Gateway authority in this order:

```text
runtime process MASTERV_GATEWAY_BASE_URL
  -> compile-time option_env!(MASTERV_GATEWAY_BASE_URL)
  -> not configured
```

For a distributed Desktop, production authority must come from the compile-time value. End users must not be expected to set a runtime environment variable.

The production value must be a canonical MasterV-controlled HTTPS hostname, for example:

```text
https://api.masterv.<domain>
```

The value must not be a provider-specific hostname such as:

```text
*.vercel.app
*.workers.dev
*.supabase.co
```

A CI-only build probe may use the reserved non-production hostname:

```text
https://api.masterv.example
```

The probe proves only compile-time wiring. It does not prove production reachability.

## Cargo rebuild correctness

Because `gateway_transport.rs` uses `option_env!("MASTERV_GATEWAY_BASE_URL")`, Cargo must treat changes to this environment value as a rebuild input.

`src-tauri/build.rs` therefore declares:

```text
cargo:rerun-if-env-changed=MASTERV_GATEWAY_BASE_URL
```

This prevents a cached release build from accidentally retaining a prior Gateway URL.

## MV-PILOT-1A verification

The deterministic gate must prove:

```text
[ ] /v1/* serverless adapter delegates to the existing Gateway core
[ ] no central DB or persistence dependency is introduced
[ ] no provider credential is present in deterministic serverless contract execution
[ ] /v1/health returns stateless=true, db_less=true, user_work_data_storage=false
[ ] protected activation fails closed when Polar authority is absent
[ ] production deployment surface resolves only to gateway
[ ] production MASTERV_DEPLOYMENT_SURFACE=web is rejected
[ ] production Gateway proxy rejects every non-/v1 path
[ ] legacy /api/analyze rejects before provider execution
[ ] legacy /api/discover/youtube rejects before provider execution
[ ] legacy /api/interpret-product-truth rejects before provider execution
[ ] legacy web surface is development-only
[ ] Cargo rebuild tracks MASTERV_GATEWAY_BASE_URL
[ ] unsigned Windows build probe is compiled with https://api.masterv.example
[ ] probe runtime does not receive MASTERV_GATEWAY_BASE_URL
[ ] desktop_gateway_status.configured = true from compile-time binding
[ ] product_key_submitted = false
[ ] activation_called = false
[ ] provider_operation_executed = false
[ ] Polar production mutation = 0
[ ] production Gateway deployment mutation = 0
[ ] production signing credential use = 0
[ ] release publication mutation = 0
```

## Production activation sequence — NOT EXECUTED IN THIS STAGE

Only after MV-PILOT-1A is merged may a separately authorized production activation stage proceed in this order:

```text
1. choose/confirm production hosting plane
2. require production deployment surface = Gateway-only with no web override
3. attach canonical custom hostname https://api.masterv.<domain>
4. configure server-side Polar/Gemini/YouTube/Gateway secrets
5. deploy exact accepted main Gateway
6. read GET /v1/health
7. verify representative non-/v1 and legacy /api paths return 404 without provider execution
8. require stateless=true and db_less=true
9. require production provider readiness for pilot-required capabilities
10. build a new immutable signed Desktop version > 0.1.4 with
    MASTERV_GATEWAY_BASE_URL=https://api.masterv.<domain>
11. publish through the independent Tauri-signed update channel
12. verify published Desktop desktop_gateway_status.configured=true
13. only then call the external human pilot user
```

The already-published `v0.1.4` must remain immutable. Repair requires a new version; it must not overwrite or silently replace `v0.1.4` assets.

## Explicit non-authority

MV-PILOT-1A does not authorize:

```text
Gateway production deployment
Vercel production mutation
custom-domain mutation
server secret creation/registration/change
Polar production mutation
Product Key activation
paid provider execution
production signing activation
GitHub Release publication
stable latest.json replacement
external human pilot execution
```

## Stage target

If exact-head verification is green:

```text
GATEWAY_SERVERLESS_SURFACE = READY
GATEWAY_PRODUCTION_SURFACE_ISOLATION = READY
DESKTOP_GATEWAY_BUILD_BINDING = READY
PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE
EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION
MV_PILOT_1 = BLOCKED_PENDING_PRODUCTION_GATEWAY_ACTIVATION_AND_NEW_SIGNED_DESKTOP
```

This is a readiness state, not MV-PILOT-1 closure.
