# MV-SUPABASE-EXIT-1D — Product-Key / Polar

Status: IMPLEMENTED / PROVIDER-CONFIG REQUIRED / DESKTOP NOT YET WIRED

## Purpose

Replace account-login authority with the target product-key activation model while preserving the EXIT-1C stateless, DB-less Gateway.

The target flow is:

```text
product key
  -> POST /v1/license/activate
  -> Polar license activation
  -> device activation reference
  -> signed device credential
  -> signed short-lived session credential

device credential
  -> POST /v1/session
  -> Polar license + activation + customer-state revalidation
  -> new short-lived session credential

session credential
  -> entitlement / usage guard
  -> provider request
  -> Polar usage event
```

The raw product key is a bootstrap credential only. It is not returned by the Gateway, embedded in device/session credentials, or required by paid API routes.

## Authority Model

### Polar

Polar is the external authority for:

- license key state
- device activation existence
- customer state
- subscription state
- granted license benefit
- usage meter balance
- usage event ingestion

### MasterV Gateway

The Gateway owns:

- signed device credential issuance
- signed short-lived session credential issuance
- credential signature verification
- final paid-operation authorization
- provider secret execution
- usage event submission

### MasterV central DB

None.

No MasterV-owned application database, session database, entitlement cache database, or work-data database is introduced.

## Credentials

`GatewayCredentialCodec` uses an HMAC-SHA256 server secret.

Device credential claims contain only authority references:

```text
kind
subject
credential id
device id / install id
Polar customer id
Polar license id
Polar activation id
issued-at
expiry
```

Session credentials contain the same authority references with a short TTL and independent credential id.

The product key is never encoded into either credential.

Required server secret:

```text
GATEWAY_CREDENTIAL_SIGNING_SECRET
```

It must not ship in the Desktop bundle.

Default TTLs:

```text
device credential = 30 days
session credential = 15 minutes
```

Both are runtime-configurable with positive integer seconds.

## Polar Runtime Configuration

Required together to activate Polar authority:

```text
POLAR_ACCESS_TOKEN
POLAR_ORGANIZATION_ID
GATEWAY_CREDENTIAL_SIGNING_SECRET
```

Optional:

```text
POLAR_AI_METER_ID
POLAR_USAGE_EVENT_NAME
POLAR_PLAN_METADATA_KEY
POLAR_API_BASE_URL
GATEWAY_DEVICE_CREDENTIAL_TTL_SECONDS
GATEWAY_SESSION_CREDENTIAL_TTL_SECONDS
```

Partial Polar authority configuration fails fast.

## Plan Mapping

The matching Polar license benefit grant must expose plan metadata.

Default metadata key:

```text
masterv_plan
```

Example values:

```text
BASIC
PRO
OWNER
```

The metadata key can be overridden with `POLAR_PLAN_METADATA_KEY`.

The Gateway does not hard-code Polar product IDs.

## Entitlement Rules

A usable entitlement requires:

1. signed MasterV session credential
2. Polar license still belongs to the same customer
3. Polar activation still belongs to the same license
4. activation install metadata matches the device id when present
5. license status is granted and not expired
6. matching Polar benefit grant still exists
7. plan metadata exists

Capabilities are denied when the license or grant is no longer active.

### Payment recovery

A `past_due` subscription is represented as recoverable while the Polar license benefit remains granted.

```text
subscription_status = past_due
grace_active        = true
license_status      = active
```

If Polar revokes the benefit/license after recovery is exhausted, capability access becomes inactive.

This prevents the old incorrect behavior of treating the first payment failure as immediate expiry.

## Usage / Credit Model

MasterV credit units are fixed at the Gateway contract:

```text
YouTube Discovery   0
Deep Analysis       5
Production Guidance 1
```

For non-OWNER plans:

1. Gateway reads the configured Polar customer meter balance.
2. Required units must be available before provider execution.
3. After successful execution, Gateway ingests a Polar usage event.

`x-masterv-request-id` is used to derive the Polar event external id:

```text
masterv:<request-id>:<capability>
```

This gives the usage event an idempotency key without introducing a MasterV database.

OWNER:

```text
plan = OWNER
usage_remaining = null
paid operation allowed
Polar usage charge event = skipped
```

## Server-Side Polar Calls

The provider uses server-authenticated Polar endpoints for:

```text
POST /v1/license-keys/activate
GET  /v1/license-keys/{license_id}
GET  /v1/license-keys/{license_id}/activations/{activation_id}
GET  /v1/customers/{customer_id}/state
POST /v1/events/ingest
```

The Desktop never receives `POLAR_ACCESS_TOKEN`.

## Security Invariants

```text
Product key in normal API bearer credential      NO
Product key returned after activation             NO
Product key encoded in device credential          NO
Product key encoded in session credential         NO
Polar access token in Desktop                     NO
Gateway signing secret in Desktop                 NO
Desktop plan/usage state as final authority       NO
Central MasterV DB                                NO
```

The Desktop remains untrusted for plan, usage, subscription, and license status.

## Activation State

```text
Polar provider source implemented      = true
Signed device credential               = true
Signed short-lived session             = true
Polar entitlement provider             = true
Polar usage provider                   = true
Polar runtime live configured          = environment-dependent
Desktop product-key UI wired           = false
Desktop secure-storage wiring          = false
Desktop traffic switched to Gateway    = false
Supabase authority                     = unchanged
Local SQLite product authority         = false
Gateway production deployment          = false
```

EXIT-1D intentionally does not switch Desktop production traffic yet. That cutover belongs to the migration bridge after the remaining independent updater boundary is established.

## Verification

`.github/workflows/mv-supabase-exit-1d.yml` verifies:

- EXIT-1C stateless Gateway regression
- bootstrap product-key handling
- Polar activation contract
- device credential signing
- short-lived session signing
- product key absence from issued credentials
- Polar license/activation/customer-state revalidation
- 0 / 5 / 1 credit policy
- meter-balance denial before AI execution
- usage event idempotency key
- past-due grace preservation
- OWNER unlimited behavior
- partial Polar runtime config fail-fast
- no central DB dependency
- TypeScript and canonical product regressions

No live Polar credential is required by the contract test; Polar HTTP is mocked.

## Next Phase

`MV-SUPABASE-EXIT-1E — Independent Updater`

After 1E is verified, the 0.1.2 migration bridge can wire Desktop activation, secure credential storage, Gateway transport, Local SQLite authority, and legacy Supabase migration/fallback in a controlled cutover.
