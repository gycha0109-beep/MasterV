# MV-PILOT-1 — Production First-Run Evidence Freeze

Status: VERIFIED AUTOMATED EVIDENCE — EXTERNAL HUMAN PILOT NOT STARTED

This record freezes the first successful production first-run acceptance evidence for `MV-PILOT-1`.

It is an audit record for the immutable published `v0.1.4` production release. It does not claim a real external-human pilot and does not authorize any production mutation.

## 1. Repository authority

```text
starting main = fa8c43269cfb7687ea242d65dafd1621d11e0e7e
verification head = 2f7556ce843688d587926f4e7976bb71b5f48088
branch = pilot/mv-pilot-1-production-first-run
PR = #9
```

At evidence capture time PR #9 was Draft / Open / Unmerged and `main` remained `fa8c43269cfb7687ea242d65dafd1621d11e0e7e`.

## 2. Exact-head workflow evidence

Both automatic PR workflows completed successfully on the same verification head:

```text
CI
run_id = 32481939616
run_number = 1058
head_sha = 2f7556ce843688d587926f4e7976bb71b5f48088
conclusion = SUCCESS

MV EXIT-3 0.1.3 Clean Cut
run_id = 32481939529
run_number = 27
head_sha = 2f7556ce843688d587926f4e7976bb71b5f48088
conclusion = SUCCESS
```

The CI Windows quality job also re-ran the existing production updater acceptance before the new first-run acceptance:

```text
Verify real published 0.1.3 to signed 0.1.4 updater acceptance = SUCCESS
Verify published v0.1.4 production first-run acceptance = SUCCESS
Upload MV-PILOT-1 first-run evidence = SUCCESS
```

## 3. Durable artifact identity

```text
artifact_name = masterv-0.1.4-pilot-1-first-run-acceptance
artifact_id = 9446827012
artifact_digest = sha256:494d6d6d98ebacd80d2929d80748bd236abcab087a73c3adc9e146a148275a3e
artifact_size_bytes = 281623
created_at = 2026-08-21T12:42:37Z
expires_at = 2026-11-19T12:27:01Z
expired_at_capture = false
workflow_run_id = 32481939616
workflow_head_sha = 2f7556ce843688d587926f4e7976bb71b5f48088
```

The artifact was downloaded and its `first-run-evidence.json` was inspected before this freeze record was written.

## 4. First-run evidence payload

The evidence payload reported:

```text
status = MASTERV_PILOT_1_PRODUCTION_FIRST_RUN_ACCEPTANCE_PASS
source_authority = PUBLISHED_GITHUB_RELEASE
production_version = 0.1.4
release_tag = v0.1.4
manifest_signature_present = true
installed_registry_version = 0.1.4
fresh_install = true
first_run_auth_state = LOCAL_ONLY
product_key_activation_surface = true
product_key_submitted = false
device_credential_present_before_activation = false
secure_store_backend = windows-dpapi
product_key_persisted = false
session_credential_persisted = false
local_sqlite_authority = true
local_data_available_before_activation = true
local_sqlite_restart_persistence = true
remote_work_data_fallback = false
login_surface_present = false
legacy_migration_surface_present = false
browser_persistent_auth_storage = false
updater_panel_present = true
updater_subscription_independent = true
updater_state = LATEST
fresh_webview_external_resource_requests = 0
application_credentials_used = false
signing_credentials_used = false
polar_mutation = false
release_mutation = false
external_human_pilot_executed = false
```

## 5. Acceptance interpretation

This evidence establishes only:

```text
MV_ARCH_001 = CLOSED
PRODUCTION_FIRST_RUN_ACCEPTANCE = PASS
EXTERNAL_HUMAN_PILOT = NOT_STARTED
MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT
```

It does not establish:

```text
EXTERNAL_HUMAN_PILOT = PASS
MV_PILOT_1 = CLOSED
```

Those states require separately attributable evidence from a real external person using the production application.

## 6. Mutation boundary

This evidence run performed no:

- Product Key submission;
- Polar production mutation;
- Gemini or YouTube application-secret use;
- Tauri signing private-key use;
- production signing or re-signing;
- GitHub Release creation or mutation;
- `latest.json` mutation;
- release asset upload or replacement;
- Supabase reintroduction;
- central product database introduction.

The published `v0.1.4` installer and updater metadata were consumed as read-only production evidence.

## 7. Post-freeze validation rule

This evidence record is intentionally anchored to the successful implementation head `2f7556ce843688d587926f4e7976bb71b5f48088`.

Adding this documentation-only freeze record moves the PR head. The resulting new head must again pass the repository's normal exact-head PR workflows before PR #9 can be considered merge-ready. That later CI run is regression validation of this evidence freeze; it does not retroactively replace the immutable artifact identity above and does not convert automated evidence into a human pilot.
