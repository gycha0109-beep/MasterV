# MV-PILOT-1C — Zero-Cost Deno Gateway Launch Readiness

## Starting authority

```text
accepted_main = d53435724e7c75b165914b6858a746118ea5441b
MV_PILOT_1B = MERGED / CLOSED
PRODUCTION_GATEWAY_DEPLOYMENT = NOT_EXECUTED
PRODUCTION_SIGNING_AUTHORIZED = FALSE
RELEASE_PUBLICATION_AUTHORIZED = FALSE
```

This stage prepares a zero-cost external-pilot Gateway path. It does not deploy, register production secrets, mutate Polar, sign Desktop artifacts, publish a release, or execute the human pilot.

## Hosting decision

For the zero-cost pilot path:

```text
ZERO_COST_PILOT_HOSTING_PLANE = DENO_DEPLOY_FREE
VERCEL = VALID_FALLBACK_NOT_SELECTED
CUSTOM_DOMAIN_PURCHASE_REQUIRED = FALSE
CUSTOM_DOMAIN_REQUIRED_FOR_ZERO_COST_PILOT = FALSE
DEFAULT_PILOT_HOSTNAME_CLASS = *.deno.net
```

Deno is selected because the Gateway core already uses the Web Request/Response contract and can be exposed through a thin Deno runtime adapter without changing provider or product authority semantics.

This decision is a pilot hosting choice, not permanent infrastructure authority.

## Target Architecture deviation boundary

MV-ARCH-001 remains the final target authority and is not weakened by this stage.

The final invariant remains:

```text
INV-9 = Desktop must not remain directly dependent on a vendor-specific backend hostname
FINAL_RECOMMENDED_GATEWAY_AUTHORITY = https://api.masterv.<domain>
```

A zero-cost pilot cannot satisfy that final hostname invariant without purchasing or otherwise controlling a domain. Therefore this stage records a narrow temporary deviation instead of falsely declaring the target complete.

```text
ZERO_COST_PILOT_VENDOR_HOSTNAME_EXCEPTION = TEMPORARILY_ALLOWED
ALLOWED_VENDOR_HOSTNAME_CLASS = *.deno.net
EXCEPTION_SCOPE = ZERO_COST_EXTERNAL_PILOT_ONLY
TARGET_ARCHITECTURE_INV_9 = TEMPORARILY_DEVIATED
TARGET_ARCHITECTURE_INV_9_FINAL_CLOSURE = DEFERRED
CUSTOM_DOMAIN_MIGRATION = REQUIRED_BEFORE_FINAL_INV_9_CLOSURE
```

The exception does not authorize `*.workers.dev`, `*.r2.dev`, `*.supabase.co`, arbitrary vendor hosts, HTTP origins, localhost, or test/reserved domains.

## Deno deployment shape

The repository must carry the Deno Deploy runtime configuration as code.

```text
runtime = dynamic
entrypoint = ./gateway/deno-server.ts
framework_preset = NONE
nextjs_production_surface = NOT_DEPLOYED_BY_DENO_PILOT
```

The Deno entrypoint must remain a thin adapter:

```text
Deno request
  -> createGateway(...)
  -> existing mv-gateway-v1 core
  -> Polar / Gemini / YouTube provider adapters
```

No Deno KV, Deno database, server session database, or user-work-data storage may be added.

```text
GATEWAY_STATELESS = TRUE
GATEWAY_DB_LESS = TRUE
MASTERV_CENTRAL_APPLICATION_DB = NONE
USER_WORK_DATA_AUTHORITY = LOCAL_SQLITE
```

## Pilot hostname validator

A temporary Deno pilot origin is acceptable only when all are true:

```text
scheme = https
hostname ends with .deno.net
username/password = absent
explicit port = absent
path = /
query = absent
fragment = absent
```

The Deno hostname is infrastructure detail and must be represented by one replaceable Desktop Gateway base URL binding. Product/provider logic must never branch on Deno-specific behavior.

## Secret boundary

The same server-only secret set remains required for a real end-to-end pilot:

```text
POLAR_ACCESS_TOKEN
POLAR_ORGANIZATION_ID
GATEWAY_CREDENTIAL_SIGNING_SECRET
POLAR_AI_METER_ID
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
```

For Deno Deploy these values must be registered only as server-side Secrets. Secret values must never be committed, printed in CI, embedded in Desktop, or copied into evidence artifacts.

MV-PILOT-1C readiness CI receives none of these credentials.

## Exact-source deployment rule

Any later real Deno deployment must bind to one exact accepted main SHA.

```text
accepted_main_sha = deployment_source_sha
moving_branch_reference_only = INVALID_EVIDENCE
```

GitHub integration auto-deployment must not be treated as acceptance merely because a build completed. The deployed revision SHA must be recorded and compared with the accepted main SHA.

## Future zero-cost deployment acceptance

After separate deployment authorization and Deno app/secret configuration, acceptance must prove:

```text
GET /v1/health -> 200
OPTIONS /v1/health -> 204
/ -> 404
/api/analyze -> 404
/api/discover/youtube -> 404
/api/interpret-product-truth -> 404
```

Health must still report:

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

## Explicit non-authority in this stage

```text
DENO_ORGANIZATION_CREATION = NOT_EXECUTED
DENO_APP_CREATION = NOT_EXECUTED
DENO_GITHUB_APP_PERMISSION_MUTATION = NOT_EXECUTED
DENO_DEPLOYMENT = NOT_EXECUTED
DENO_SECRET_REGISTRATION = NOT_EXECUTED
POLAR_PRODUCTION_MUTATION = NOT_EXECUTED
PRODUCT_KEY_CREATION_OR_SUBMISSION = NOT_EXECUTED
PAID_PROVIDER_OPERATION = NOT_EXECUTED
PRODUCTION_SIGNING = NOT_EXECUTED
RELEASE_PUBLICATION = NOT_EXECUTED
EXTERNAL_HUMAN_PILOT = NOT_EXECUTED
```

## Stage target

If exact-head CI is green:

```text
MV_PILOT_1C = ZERO_COST_DENO_LAUNCH_READINESS_FROZEN
ZERO_COST_PILOT_HOSTING_PLANE = DENO_DEPLOY_FREE
DENO_GATEWAY_RUNTIME_ADAPTER = READY
DENO_DEPLOY_CONFIG_AS_CODE = READY
CUSTOM_DOMAIN_PURCHASE_REQUIRED = FALSE
ZERO_COST_PILOT_VENDOR_HOSTNAME_EXCEPTION = TEMPORARILY_ALLOWED
TARGET_ARCHITECTURE_INV_9_FINAL_CLOSURE = DEFERRED
DENO_DEPLOYMENT_AUTHORIZED = FALSE
DENO_DEPLOYMENT = NOT_EXECUTED
DENO_SECRET_REGISTRATION = NOT_EXECUTED
PRODUCTION_SIGNING_AUTHORIZED = FALSE
RELEASE_PUBLICATION_AUTHORIZED = FALSE
EXTERNAL_HUMAN_PILOT = BLOCKED_PENDING_ZERO_COST_GATEWAY_DEPLOYMENT
```

The next stage may perform Deno organization/app linkage, secret registration, and exact-SHA deployment only under a separate explicit deployment authorization. Gateway deployment authority still does not imply Desktop signing or release-publication authority.
