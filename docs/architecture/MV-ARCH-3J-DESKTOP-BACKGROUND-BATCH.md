# MV-ARCH-3J — Desktop Background Batch Hosted Orchestration Boundary

Status: **RUNTIME_VERIFIED / PROVIDER_PRECONDITION_BLOCKED / NOT ACTIVATED**

## 1. Goal

MV-ARCH-3J introduces a native Desktop boundary for long-running Gemini Background Batch orchestration without placing provider credentials, provider model authority, durable job-write authority, or automatic retry authority in the Desktop runtime.

The guarded architecture is:

```text
Desktop
  -> authenticated dedicated hosted boundary
  -> JWT-derived personal workspace
  -> durable Background Batch ledger
  -> provider/live-verification/activation gate
  -> Gemini Batch create/check only when the gate is explicitly opened
```

This stage verifies the hosted orchestration and blocked-state runtime. It does **not** claim that a real Gemini Batch create has succeeded.

The current provider create path remains intentionally blocked until all of the following are recorded:

```text
provider_precondition_confirmed = true
live_batch_verified_at          != null
desktop_submit_enabled          = true
```

No signing, release, updater, PR merge, Desktop activation, or next architecture stage is authorized by 3J.

## 2. Why 3J is guarded rather than an automatic Batch migration

Earlier Background Batch work encountered a provider `FAILED_PRECONDITION`. A Batch create is also a non-idempotent external side effect: when the caller cannot determine whether provider creation happened, blindly retrying can duplicate paid work.

Therefore 3J does not treat a failed or uncertain create like an ordinary retryable HTTP request. It first establishes:

- a durable reservation ledger,
- a provider-precondition gate,
- explicit Desktop activation state,
- request-id reservation semantics,
- an uncertainty state that prohibits automatic resubmission.

The provider operation is not retried automatically by the product path.

## 3. Durable ledger

3J adds:

```text
public.masterv_background_batch_config
public.background_batch_jobs
```

Migrations:

```text
supabase/migrations/202608160001_background_batch_ledger.sql
supabase/migrations/202608160002_background_batch_ledger_write_hardening.sql
```

The global configuration stores:

```text
provider_precondition_confirmed boolean
live_batch_verified_at          timestamptz | null
desktop_submit_enabled          boolean
```

The database check constraint prevents Desktop submission from being enabled unless both provider precondition confirmation and a live Batch verification timestamp already exist.

The job ledger stores the canonical YouTube source identity, model selected by the hosted runtime, provider job identity/state, result/error state, and timestamps.

Relevant ledger states are:

```text
RESERVED
SUBMITTING
PENDING
SUCCEEDED
FAILED
CANCELLED
EXPIRED
SUBMISSION_UNCERTAIN
```

`SUBMISSION_UNCERTAIN` is a safety state. It means provider creation may have been attempted while durable confirmation is incomplete. Automatic provider resubmission is prohibited from that state.

## 4. Ledger write authority

The initial ledger migration exposed authenticated insert/update policies. 3J subsequently hardened the boundary so Desktop users cannot write job state directly through PostgREST.

Final authority is:

```text
Desktop / authenticated caller -> read-oriented UI authority
Edge Function                  -> hosted-admin-only ledger writes
workspace                      -> derived from JWT subject
```

The hosted function creates an authenticated user context, derives:

```text
workspace_id = user:${jwt.sub}
```

and uses the hosted admin client only after that workspace identity has been fixed server-side.

The Desktop request never supplies a trusted `workspace_id`.

## 5. Dedicated hosted boundary

3J uses a separate Edge Function instead of expanding the already-verified `masterv-api-boundary`:

```text
masterv-background-batch-boundary
```

This keeps 3A-3I provider/compute surfaces isolated from non-idempotent Batch orchestration.

Hosted contract:

```text
background-batch-hosted-v1
```

Operations:

```text
GET  capability probe
POST background_batch_list
POST background_batch_submit
POST background_batch_check
```

Authority markers:

```text
workspace      = jwt-derived-personal
provider       = hosted-secret
model          = hosted-config
ledger_write   = hosted-admin-only
auto_retry     = false
reference_library_write = false
```

## 6. Submission gate and non-idempotent create safety

Provider submission is permitted only when all four checks are true:

```text
GEMINI_API_KEY is configured in hosted runtime
provider_precondition_confirmed = true
live_batch_verified_at is present
desktop_submit_enabled = true
```

When the gate is closed, `background_batch_submit` returns a blocked response with:

```text
batch_create_attempts = 0
interactive_generate_requests = 0
```

When submission is eventually authorized, the hosted path first reserves a caller-generated UUID request id in the ledger. A replay of the same reservation returns the existing row and performs zero additional provider creates.

There is exactly one provider Batch create site:

```text
ai.batches.create(...)
```

If create throws after reservation, the row is frozen as:

```text
SUBMISSION_UNCERTAIN
```

and the response explicitly reports:

```text
auto_retry = false
```

There is no fallback to interactive `generateContent`.

## 7. Check semantics

`background_batch_check` loads the requested row from the JWT-derived workspace.

If the job is already terminal, it returns the ledger value without a provider request.

If no provider job identity exists, it returns a warning and refuses automatic resubmission.

Otherwise there is one provider lookup site:

```text
ai.batches.get(...)
```

Successful inline Batch output must preserve the canonical `source_id` binding before it is accepted into the ledger.

3J does not automatically write the result into Reference Library.

## 8. Desktop surface

The native Desktop adds a guarded Background Batch panel.

Desktop authority markers are:

```text
provider_authority       = hosted-secret
model_authority          = hosted-config
persistence_authority    = durable-ledger
ledger_write_authority   = hosted-admin-only
workspace_authority      = jwt-derived-personal
create_idempotency       = request-id-reservation
auto_retry               = false
reference_library_writes = 0
direct_gemini_requests   = 0
```

The Desktop generates an explicit UUID reservation id with `crypto.randomUUID()` for a submit request.

The Desktop contains no Gemini provider credential and never calls Gemini directly. It also does not use a local Next `/api` route for this surface.

## 9. Explicit refresh and network isolation

3J intentionally performs **no Background Batch capability probe or ledger list automatically after login**.

Initial state is:

```text
CHECK REQUIRED
```

The user must press the Background Batch refresh control. That explicit action performs exactly:

```text
1 capability GET
1 ledger list POST
```

This design prevents the 3J surface from creating background network traffic that contaminates 3D-3I transport-count regression measurements.

Logout clears the 3J process/UI state.

## 10. Current live gate

The live database was re-read after native verification and remains:

```text
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
background_batch_jobs           = 0
```

Therefore:

```text
submit_capability   = false
Batch submit calls  = 0
Batch create calls  = 0
```

This is the intended 3J state. The gate is not to be flipped merely to make a test green.

## 11. Live hosted functions

Observed hosted functions after 3J verification:

```text
masterv-api-boundary
  version     = 9
  status      = ACTIVE
  verify_jwt  = true
  import_map  = true
  ezbr_sha256 = d7ce45bdd5491965bc8d190ba852216c3609dbb64273e1ab733413beafaca860

masterv-background-batch-boundary
  version     = 1
  status      = ACTIVE
  verify_jwt  = true
  import_map  = true
  ezbr_sha256 = 5ed723cb58fd93e0e7b9b78eca7ea3e44a24bf84797925de38a4070abbc1112f
```

The dedicated Background Batch deployment is verification infrastructure, not Desktop activation.

## 12. Static contract

3J adds:

```text
scripts/hosted-background-batch-contract.mjs
MASTERV_HOSTED_BACKGROUND_BATCH_CONTRACT_PASS
```

The contract verifies, among other invariants:

- durable ledger/config migration presence,
- hosted-only Gemini credential and model authority,
- JWT-derived personal workspace,
- hosted-admin-only ledger writes,
- strict request field allowlists,
- request-id reservation behavior,
- provider precondition/live verification/Desktop activation gate,
- exactly one Batch create authority,
- no automatic provider create retry,
- `SUBMISSION_UNCERTAIN` safety path,
- exactly one provider check authority,
- no interactive Gemini fallback,
- no automatic Reference Library writes,
- no Desktop provider credentials,
- no Desktop direct Gemini or local Next API calls,
- no automatic 3J probe/list after login,
- explicit refresh behavior,
- Windows guard-runtime evidence marker,
- CI wiring.

The contract passes in both `validate` and `desktop-shell`.

## 13. Verification corrections discovered during 3J

3J verification exposed several test-ownership and transport-isolation issues. They were corrected without weakening the product safety gate.

### 13.1 Roadmap ownership

```text
46dc1c07ccbf9bedab6ab3f90231a512d3c6aa3e
test(arch3j): hand roadmap ownership from 3i to 3j
```

3I no longer asserts that Background Batch must remain the current unmigrated roadmap item after 3J exists.

### 13.2 Explicit user-initiated refresh

```text
6fa1dd2cabab14b19821eeae734cc13338f53c78
fix(arch3j): make batch boundary refresh explicitly user initiated
```

3J stopped auto-probing/listing after login, preventing background transport interference with earlier stage smoke measurements.

### 13.3 Native guard smoke wiring

```text
bfd5a33c1e6ee417fa164b255a4c3b053063d876
test(arch3j): add guarded background batch Windows smoke

2c6cc30841ad9562221d1753a4758209f1c31829
test(arch3j): wire guarded Background Batch Windows smoke

8338621b8084d280da6a07fc6027f82c0197da00
ci(arch3j): run guarded Background Batch native smoke

96a3f799932cbab2d428e7835eb0e5b2b8fef4c7
test(arch3j): lock explicit batch refresh and native smoke wiring
```

### 13.4 WebView2 state-probe syntax correction

The first native attempt reached 3J but failed before asserting product behavior because the injected WebDriver JavaScript was malformed by an escaped regular expression.

Correction:

```text
86f48101cd9320081068dadf4ed3361b06c17788
fix(arch3j): repair WebView2 batch guard state probe
```

The resource check now uses an unambiguous string `includes('/api/')` test. No product behavior was relaxed.

### 13.5 Provider-quota isolation

Repeated 3J verification attempts were being terminated by the already-existing 3H live Gemini smoke before the 3J step could run. The live Gemini provider was returning HTTP 429 with explicit retry hints.

Correction:

```text
d2c4b737b0cc0e8fbd78c70c5224bdd5ac25c8b0
ci(arch3j): isolate guarded batch smoke from provider quota
```

The Windows order now verifies 3J before provider-consuming 3H/3I smokes.

The 3H/3I **CI smoke harness only** has a bounded provider-rate-limit retry policy. It does not change Desktop/Edge product retry behavior:

- maximum 3 attempts,
- only recognized quota/rate-limit failures are retried,
- provider retry hints are honored within a bounded wait,
- non-quota failures fail immediately,
- persistent quota exhaustion still fails the CI job.

## 14. Native Windows 3J runtime evidence

Authoritative 3J code head before this document:

```text
d2c4b737b0cc0e8fbd78c70c5224bdd5ac25c8b0
```

CI run:

```text
run        = 31907204918
run number = #755
```

The native Windows job produced:

```text
status                          = MASTERV_WINDOWS_BACKGROUND_BATCH_GUARD_RUNTIME_PASS
webview2_runtime_version        = 151.0.4129.72
cdp_browser                     = Edg/151.0.4129.72
attach_mode                     = true
surface                         = desktop
auth_status                     = AUTHENTICATED
hosted_api_status               = CONNECTED
guarded_boundary                = PASS
durable_ledger                  = true
provider_secret_configured      = true
provider_precondition_confirmed = false
live_batch_verified             = false
desktop_submit_enabled          = false
submit_capability               = false
provider_authority              = hosted-secret
model_authority                 = hosted-config
persistence_authority           = durable-ledger
ledger_write_authority          = hosted-admin-only
workspace_authority             = jwt-derived-personal
create_idempotency              = request-id-reservation
auto_retry                      = false
desktop_provider_credentials    = false
batch_boundary_request_delta    = 2
batch_submit_requests           = 0
batch_create_attempts           = 0
client_gemini_api_delta         = 0
local_next_api_delta            = 0
reference_library_writes        = 0
lifecycle_blocker               = provider paid-tier/live Batch precondition not verified
logout_clear                    = true
screenshot                      = background-batch-guard-blocked.png
```

The explicit refresh issued the expected two dedicated-boundary requests while the blocked submit path issued no provider create.

## 15. Same-run regression evidence

Before 3J in the same native Windows job, the following stages passed:

```text
MASTERV_WINDOWS_REFERENCE_LIBRARY_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_DETAIL_COMPARE_RUNTIME_PASS
MASTERV_WINDOWS_REFERENCE_COMPILER_RUNTIME_PASS
MASTERV_WINDOWS_YOUTUBE_DISCOVERY_RUNTIME_PASS
MASTERV_WINDOWS_BACKGROUND_BATCH_GUARD_RUNTIME_PASS
```

Retained strict invariants include:

```text
3F client_hosted_function_delta = 1
3F evidence_rule_count          = 11

3G candidate_count              = 12
3G youtube_api_requests         = 2
3G client_youtube_api_delta     = 0
3G client_hosted_function_delta = 1
3G gemini_requests              = 0

3J batch_boundary_request_delta = 2
3J batch_submit_requests        = 0
3J batch_create_attempts        = 0
3J client_gemini_api_delta      = 0
```

## 16. #755 overall CI conclusion caveat

Run #755 has overall conclusion `FAILURE`, but the failure occurred **after the 3J native runtime PASS**.

The downstream 3H live Gemini regression received provider quota responses on all bounded attempts:

```text
attempt 1: quota response, retry hint 58s, waited 61s
attempt 2: quota response, retry hint 44s, waited 47s
attempt 3: quota response, retry hint 44s, CI failed
```

As a result, 3I and installer steps were skipped in that run.

This is not evidence that 3J failed, and it does not downgrade the already-established lifecycle of 3H/3I from their earlier successful runtime-verification runs. It is a current external provider-quota regression blocker for the full Windows chain.

The bounded retry correctly remained bounded and did not convert persistent provider exhaustion into a false green result.

## 17. Runtime artifact

Run #755 uploaded the runtime evidence artifact even though the downstream 3H step failed:

```text
ID      = 9252767725
name    = masterv-windows-desktop-smoke
size    = 439,129 bytes
SHA256  = 0d400412fd278c7a4c566916c9848eb912a14220915485ed68fa3e68eaf88d75
head    = d2c4b737b0cc0e8fbd78c70c5224bdd5ac25c8b0
expired = false
```

The artifact includes the 3J runtime JSON evidence and `background-batch-guard-blocked.png` screenshot. It is not used to claim a successful installer build for #755 because installer execution was downstream of the quota-blocked 3H step.

## 18. Lifecycle conclusion

3J proves the following native/runtime facts:

- the dedicated hosted boundary is reachable from the native Desktop,
- the user is authenticated,
- workspace authority is JWT-derived,
- the durable ledger exists,
- ledger writes are hosted-admin-only,
- the provider secret is absent from Desktop,
- no Desktop direct Gemini request occurs,
- no local Next API is required,
- login produces no automatic Background Batch network traffic,
- explicit refresh produces the expected capability/list requests,
- the provider/live/activation gate is faithfully represented,
- submit remains disabled while the gate is closed,
- no Batch submit is sent,
- no provider Batch create is attempted,
- no automatic Reference Library write occurs,
- logout clears the surface.

Therefore the architecture-stage status is:

```text
MV-ARCH-3J
RUNTIME_VERIFIED / PROVIDER_PRECONDITION_BLOCKED / NOT ACTIVATED
```

This status applies to the **guarded orchestration boundary**, not to the still-unverified provider Batch create path.

Provider Batch create remains:

```text
NOT RUNTIME VERIFIED
NOT ACTIVATED
```

Future activation requires an explicitly controlled provider-precondition confirmation and successful live Batch verification. The config must not be changed implicitly.

## 19. Stop boundary

3J stops here.

Do not, as part of this stage:

- set `provider_precondition_confirmed=true`,
- populate `live_batch_verified_at`,
- set `desktop_submit_enabled=true`,
- invoke a provider Batch create merely to make CI green,
- add automatic resubmission,
- add interactive fallback,
- merge PR #1,
- mark PR #1 Ready,
- sign or release the Desktop app,
- start MV-ARCH-3K.
