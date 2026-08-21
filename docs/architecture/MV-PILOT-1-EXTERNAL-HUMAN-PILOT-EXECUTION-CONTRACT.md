# MV-PILOT-1 — External Human Pilot Execution Contract & Evidence Intake

Status: HUMAN PILOT EXECUTION CONTRACT CANDIDATE — NOT EXECUTED  
Starting repository authority: `3dfd67e3013ba90c86efed68eaa9b2547506299b`  
Starting tree: `86bf02ad7be29fb1a64a97499dbb4c8d1ad15e96`  
Production baseline: `v0.1.4`  
Parent authority: `MV-PILOT-1-PRODUCTION-EXTERNAL-PILOT-FIRST-RUN-ACCEPTANCE.md`

## 1. Purpose

The deterministic production first-run gate is already merged and green.

```text
PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS
EXTERNAL_HUMAN_PILOT = NOT_EXECUTED
PRODUCTION_ACTIVATION = EXPLICIT_HUMAN_EXECUTION_ONLY
MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT
```

This contract defines the next boundary: how a **real external human pilot** may execute the published `v0.1.4` product and how the resulting evidence can be admitted without storing credentials, personal data, or unverifiable claims.

This PR does not execute Product Key activation, does not create a Polar device activation, does not make a paid provider request, and does not close `MV-PILOT-1`.

## 2. Why this must remain human-only

The previous automated gate proved that a clean Windows machine can install and launch the immutable published `v0.1.4`, remain `LOCAL ONLY` before activation, use Local SQLite, preserve local data across restart, and observe the updater as `LATEST`.

The remaining acceptance question is different:

> Can a real external user complete the intended first-run product flow using the real Product Key activation path, resume the activated device after restart, perform one entitled remote operation, and continue to retain local-first behavior without unrecoverable usability blockers?

A CI runner cannot answer this question because it is not a human usability subject and must not receive a production Product Key.

```text
CI must not execute the human pilot
```

## 3. Execution authority boundary

A real human pilot may begin only after all of the following are true:

```text
published production version       = v0.1.4
production first-run acceptance     = PASS
human pilot execution contract      = merged
pilot identity                      = assigned opaque pilot_id
production activation authorization = explicit
```

The actual Product Key is delivered to the pilot outside repository evidence. It must never be committed, pasted into an issue, PR, artifact, log, screenshot, or evidence JSON.

The pilot execution itself may cause legitimate production mutations:

- Product Key activation;
- Polar-backed device activation / entitlement state associated with that activation;
- one normal entitled Gateway operation and corresponding usage accounting.

Those mutations are allowed **only as part of an explicitly authorized real pilot execution**. This contract and CI do not perform them.

## 4. Required human pilot sequence

The pilot must use the actual published production installer and follow this sequence without developer-side injection of application credentials.

### Step A — Fresh installation

1. Obtain the public `v0.1.4` installer from the production release channel.
2. Install MasterV on the pilot Windows profile.
3. Launch MasterV normally.
4. Confirm first launch is usable without Product Key activation for local work.

Required observation:

```text
first launch auth state = LOCAL_ONLY
Local SQLite             = usable
Reference Library        = usable before activation
```

### Step B — Product Key activation

1. Enter the pilot Product Key in the normal Desktop Product Key activation surface.
2. Submit activation once.
3. Confirm activation succeeds in the product UI.
4. Do not copy the Product Key into the evidence record.

Expected architecture path:

```text
Product Key activation
→ POST /v1/license/activate
→ device activation
→ device credential stored in OS secure storage
→ short-lived session credential returned to runtime memory
```

Acceptance requires:

```text
product_key_persisted        = false
session_credential_persisted = false
```

The device credential may persist only in OS secure storage as designed.

### Step C — Restart / device resume

1. Close MasterV completely.
2. Start MasterV again on the same Windows profile.
3. Confirm the prior device activation resumes without re-entering the Product Key.
4. Confirm local Reference Library data remains available.

Required observation:

```text
device resume after restart = PASS
Local SQLite authority      = preserved
```

### Step D — One entitled remote operation

The pilot must complete exactly one normal user-visible entitled operation for acceptance evidence. The evidence records only the operation class, not provider payloads or credentials.

Allowed evidence values:

```text
discovery
analysis
guidance
```

At least one must complete successfully.

This proves the activated session is usable for a paid/entitled remote product path without exposing the Product Key as an API bearer credential.

### Step E — Updater independence

The pilot must confirm the updater remains visible after activation and that the current stable channel is still `LATEST`.

Required:

```text
updater_visible                   = true
updater_state                     = LATEST
updater_subscription_independent  = true
```

### Step F — Local-first continuity

After activation and after the entitled remote operation, local work must remain governed by Local SQLite.

Required:

```text
user_data_authority       = LOCAL_SQLITE
remote_work_data_fallback = false
```

The pilot must be able to use the Reference Library after activation as well as before activation.

## 5. Evidence intake

The unexecuted template is:

```text
docs/architecture/MV-PILOT-1-EXTERNAL-HUMAN-PILOT-EVIDENCE-TEMPLATE.json
```

The validator is:

```text
scripts/desktop-pilot-1-human-evidence-validate.mjs
```

After a separately authorized human pilot has actually executed, copy the template outside the repository working file, fill only observed values, and validate it with:

```text
node scripts/desktop-pilot-1-human-evidence-validate.mjs <evidence.json>
```

A PASS produces:

```text
MASTERV_PILOT_1_EXTERNAL_HUMAN_EVIDENCE_PASS
```

The template itself must fail validation because it is explicitly `NOT_EXECUTED`.

## 6. Evidence privacy and credential boundary

The admitted evidence must not contain any of the following raw values:

- raw Product Key;
- device credential or device secret;
- session credential;
- Polar server credential or access token;
- Gemini API key;
- YouTube API key;
- Gateway signing secret;
- updater signing private key or password;
- email address, phone number, postal address, or full legal name.

Use an opaque `pilot_id` instead of personal identity.

Observations are restricted to category, severity, and short summary. They are for usability findings, not credentials or personal data.

## 7. Fail-closed acceptance criteria

Human pilot evidence is admitted only when all required facts are true:

```text
execution_status                              = COMPLETED
external_human_pilot_executed                 = true
production_activation_authorized              = true
production_version                            = 0.1.4
installation_source                           = published-v0.1.4
fresh_install_completed                       = true
first_launch_completed                        = true
first_launch_auth_state                       = LOCAL_ONLY
product_key_activation_completed              = true
device_resume_after_restart                    = true
local_reference_library_usable_before_activation = true
local_reference_library_usable_after_activation  = true
entitled_remote_operation_completed           = true
entitled_remote_operation_kind                = discovery|analysis|guidance
updater_visible                               = true
updater_state                                 = LATEST
updater_subscription_independent              = true
user_data_authority                           = LOCAL_SQLITE
remote_work_data_fallback                     = false
product_key_persisted                         = false
session_credential_persisted                  = false
device_credential_persisted_in_os_secure_storage = true
unrecoverable_blocker                         = null
```

Any missing, null, false-when-required, unexpected state, or unrecoverable blocker means the evidence cannot close the stage.

## 8. CI governance

CI validates only the **contract**, never the real pilot.

`scripts/desktop-pilot-1-human-contract.mjs` must prove:

- the template remains `NOT_EXECUTED` and unauthorized;
- the template is rejected by the real evidence validator;
- a deterministic synthetic schema fixture can exercise validator logic but is explicitly not human evidence;
- the validator has no network or subprocess capability;
- CI does not call the human evidence validator against a repository PASS record;
- no canonical human evidence record exists before actual execution.

Therefore this PR can establish only:

```text
HUMAN_PILOT_EXECUTION_CONTRACT = READY
EXTERNAL_HUMAN_PILOT = NOT_EXECUTED
PRODUCTION_ACTIVATION = EXPLICIT_HUMAN_EXECUTION_ONLY
MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT
```

## 9. Closure boundary

Repository merge of this execution contract is not pilot closure.

Full closure requires separately attributable evidence from an actual external human execution that passes the validator.

```text
HUMAN_PILOT_EVIDENCE_REQUIRED_FOR_CLOSURE
```

Only after real evidence is captured and reviewed may a subsequent closure change establish:

```text
PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS
EXTERNAL_HUMAN_PILOT = PASS
MV_PILOT_1 = CLOSED
```
