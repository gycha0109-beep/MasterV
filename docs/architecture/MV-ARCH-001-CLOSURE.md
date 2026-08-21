# MV-ARCH-001 — Target Architecture Closure & v0.1.4 Baseline Freeze

Status: CLOSURE CANDIDATE — MERGE PENDING  
Architecture authority: `MASTERV_TARGET_ARCHITECTURE(1).md` / `MV-ARCH-001`  
Frozen production baseline: `v0.1.4`  
Frozen pre-closure main authority: `3e500ef13a268793a17dbb121ed5cd3ae4b77eed`  
Frozen pre-closure tree: `c3754d5d3ba5e0c5b9cea802d60509a50cecd649`

## 1. Purpose

This document is the repository-level aggregate closure record for the MasterV Target Architecture.

It does not redesign the architecture, change product behavior, sign or publish a release, mutate an existing release asset, rotate a signing key, introduce a central product database, restore Supabase, or start `MV-PILOT-1`.

The merge effect of this closure candidate is:

```text
MV_ARCH_001 = CLOSED
```

Until the Draft PR carrying this document has passed all exact-head governed checks and is separately authorized for merge, the Worker-stage report remains:

```text
MV_ARCH_001 = READY_FOR_MERGE
```

at most.

## 2. Authority reconciliation

The closure review revalidated the actual repository before implementation.

```text
current main SHA
= 3e500ef13a268793a17dbb121ed5cd3ae4b77eed

current main tree
= c3754d5d3ba5e0c5b9cea802d60509a50cecd649

main commit verification
= GitHub verified / valid

open PRs before this closure branch
= 0

production baseline
= v0.1.4
```

The repository contains the expected POST-EXIT and REL-1 evidence chain, including:

- `docs/architecture/MV-POST-EXIT-1-TARGET-ARCHITECTURE-RC-READINESS.md`
- `docs/architecture/MV-REL-1-PRODUCTION-RELEASE-ACTIVATION.md`
- `docs/architecture/MV-REL-1A-PRODUCTION-UPDATER-SIGNING-KEY-BOOTSTRAP.md`
- `docs/architecture/MV-REL-1B-UPDATER-BOOTSTRAP-HOTFIX.md`
- `docs/MV-REL-1C-PUBLISHED-UPDATER-VERIFICATION.md`
- `scripts/desktop-post-exit-1-contract.mjs`
- `scripts/desktop-rel-1-contract.mjs`
- `scripts/desktop-rel-1b-contract.mjs`
- `scripts/desktop-rel-1c-contract.mjs`

Some historical stage documents intentionally retain status text such as `VALIDATION PENDING`, `PUBLIC KEY INTEGRATION PENDING`, or an open live-acceptance gate. Those documents are stage-time records. They are not rewritten to simulate present-day state. Subsequent merged changes and exact-main production evidence supersede those pending stage-time states for this aggregate closure.

## 3. Frozen Target Architecture

The following values are the final v1 architecture baseline:

```text
MASTERV_ARCHITECTURE = LOCAL_FIRST_PRODUCT_KEY_DESKTOP
MASTERV_CENTRAL_DB = NONE
MASTERV_AUTH_MODEL = LICENSE_ACTIVATION
MASTERV_PAYMENT_PROVIDER = POLAR
MASTERV_USER_DATA_AUTHORITY = LOCAL_SQLITE
MASTERV_GATEWAY = STATELESS
MASTERV_UPDATE_CHANNEL = INDEPENDENT_TAURI_SIGNED
SUPABASE_RUNTIME_DEPENDENCY = ZERO
MV_ARCH_001 = CLOSED
```

This is a baseline freeze, not a claim that every historical source file's embedded release number was rewritten to `0.1.4`. The original `0.1.3` release plane remains historical authority. Production `v0.1.4` exists as the forward-only REL-1B hotfix release plane and published updater evidence.

## 4. Architecture invariant closure

| Invariant | Closure | Repository / production evidence |
| --- | --- | --- |
| INV-1 Desktop contains no Gemini/YouTube provider secret | PASS | Gateway stateless contract owns provider-secret lookup server-side; PR/closure validation receives no application credential |
| INV-2 User work-data authority is Local SQLite | PASS | Local persistence + POST-EXIT + EXIT-3 clean-cut contracts |
| INV-3 Product Key is not a general API bearer credential | PASS | Polar activation contract issues device/session credentials; native Gateway transport freezes `product_key_bearer_allowed: false` |
| INV-4 Product Key and admin credential remain separate | PASS | License activation issues user/device/session authority only; OWNER is not elevated to an admin credential |
| INV-5 Update access is independent of subscription access | PASS | Independent updater contract and signed static update channel |
| INV-6 Subscription expiry does not revoke local user-data access | PASS | Local SQLite work-data plane is independent from Gateway entitlement enforcement; paid remote compute is the gated plane |
| INV-7 Gateway does not centrally store user work data | PASS | Gateway stateless contract: `user_work_data_storage: false` |
| INV-8 MasterV v1 requires no MasterV-owned central application DB | PASS | Gateway stateless contract rejects persistence dependencies; `central_db_dependencies: 0` |
| INV-9 Desktop is not bound to vendor-specific backend hostnames | PASS | Vendor-neutral `MASTERV_GATEWAY_BASE_URL`; runtime scan rejects Supabase/Workers/R2 backend hostname coupling |
| INV-10 Supabase runtime network requests are zero | PASS | EXIT-3 clean-cut contract and source scan |
| INV-11 Cloud Sync is not introduced before validated demand | PASS | Local per-device work-data authority remains the only user work-data persistence plane; Gateway has no user work-data storage |
| INV-12 Published updater artifact passes Tauri signature verification | PASS | REL-1C exact-main verification run `32463797796` and immutable evidence artifact `9439943054` |

## 5. MV-ARCH-001 completion criteria closure

The Section 20 completion matrix is closed by the existing POST-EXIT deterministic contract plus the subsequent release evidence chain.

| Completion criterion | Final state |
| --- | --- |
| Product-key activation works | PASS |
| Subscription entitlement works | PASS |
| Device activation works | PASS |
| Usage enforcement works | PASS |
| Reference Library is SQLite-backed | PASS |
| Analysis results persist locally | PASS |
| Production Guidance persists locally | PASS |
| Gateway is stateless | PASS |
| Gateway has no MasterV-owned central DB | PASS |
| Gemini secret exists only server-side | PASS |
| YouTube secret exists only server-side | PASS |
| Updater works without Supabase | PASS |
| Update access is independent of subscription | PASS |
| Supabase runtime network requests = 0 | PASS |
| Supabase runtime secrets = 0 | PASS |
| Supabase DB dependency = 0 | PASS |
| Supabase Storage dependency = 0 | PASS |
| User can export/import local data | PASS |
| DB migration backup exists | PASS |

`MV-ARCH-001 §8.3` reliability is also closed:

```text
schema_version             PASS
transactional migrations  PASS
pre-migration backup       PASS
manual export/import       PASS
automatic backup           PASS
corruption/integrity guard PASS
```

The automatic-backup authority remains the native Local SQLite Online Backup path with integrity validation and bounded retention established by MV-POST-EXIT-1.

## 6. Evidence chain freeze

### 6.1 MV-POST-EXIT-1

`desktop-post-exit-1-contract.mjs` aggregates:

- Polar product-key activation / entitlement / usage authority
- stateless DB-less Gateway
- Local SQLite work-data authority
- manual export/import
- pre-migration and pre-import recovery backup
- automatic backup
- independent updater
- Supabase clean cut
- Section 20 completion matrix
- Section 8.3 reliability matrix

MV-POST-EXIT-1 pre-release production-signature fields remain historical stage-time evidence and are intentionally not edited. They were later closed by REL-1A/B/C.

### 6.2 MV-REL-1A

Production updater key authority was bootstrapped with public key ID:

```text
D72C34948864513E
```

Only the public key is repository authority. The production private key/password remain outside source control.

### 6.3 MV-REL-1B

The `v0.1.4` updater bootstrap hotfix is a forward-only release plane:

```text
baseline = published v0.1.3
hotfix = published v0.1.4
stable manifest = releases/latest/download/latest.json
production updater key ID = D72C34948864513E
```

The already-published `v0.1.3` and `v0.1.4` assets are immutable for this closure stage.

### 6.4 MV-REL-1C exact-main attestation

Final live updater acceptance evidence is frozen as:

```text
workflow
= MV REL-1C Published Updater Verification

run_id
= 32463797796

head_sha
= 3e500ef13a268793a17dbb121ed5cd3ae4b77eed

conclusion
= success

artifact_id
= 9439943054

artifact_name
= masterv-0.1.4-rel-1c-published-updater-verification

artifact_digest
= sha256:7f5c709c6509e460739146536017563bfe7524db86265200b51df7be44409446
```

The verified runtime path is frozen as:

```text
published v0.1.3
→ public latest.json
→ v0.1.4 discovery
→ native Tauri updater
→ signed v0.1.4 install
→ installed version 0.1.4
→ restart
→ updater panel healthy
→ LATEST
```

The evidence boundary is:

```text
tauri_signature_verified_by_successful_install = true
application_credentials_used = false
signing_credentials_used = false
supabase_required = false
release_mutation = false
```

This exact-main evidence closes the remaining live production acceptance gap for `INV-12`, `MV_REL_1B`, and `MV_REL_1`.

## 7. Deterministic closure contract

Repository closure is guarded by:

```text
scripts/desktop-arch-001-closure-contract.mjs
```

The contract:

1. executes the existing POST-EXIT, REL-1, REL-1B, and REL-1C deterministic contracts;
2. rechecks the frozen Target Architecture state;
3. confirms the production hotfix release plane remains `0.1.4`;
4. confirms no central MasterV DB or Supabase runtime dependency reappears through the existing contracts;
5. confirms only the existing `CI` and `MV EXIT-3 0.1.3 Clean Cut` workflows are automatic PR workflows;
6. rejects vendor-specific Desktop backend hostname coupling;
7. freezes the exact REL-1C run/artifact/digest metadata in this document;
8. confirms closure validation itself does not require application or production signing credentials.

The contract is integrated into the existing `CI` workflow. No new automatic workflow is added.

## 8. Governance and mutation boundary

This closure performs no:

- `v0.1.5` release creation
- `v0.1.4` signing or re-signing
- `v0.1.4` publication or re-publication
- `v0.1.3` / `v0.1.4` release asset mutation
- updater signing-key rotation
- production signing workflow rerun
- production Gateway mutation
- Polar production mutation
- Vercel production mutation
- Supabase reintroduction
- central product DB introduction
- product feature work
- `MV-PILOT-1` start
- new automatic PR workflow

Existing automatic PR governance remains:

```text
CI
MV EXIT-3 0.1.3 Clean Cut
```

## 9. Closure declaration

When this closure candidate's exact-head PR gates are all green and the Draft PR is separately authorized and merged:

```text
MASTERV_ARCHITECTURE = LOCAL_FIRST_PRODUCT_KEY_DESKTOP
MASTERV_CENTRAL_DB = NONE
MASTERV_AUTH_MODEL = LICENSE_ACTIVATION
MASTERV_PAYMENT_PROVIDER = POLAR
MASTERV_USER_DATA_AUTHORITY = LOCAL_SQLITE
MASTERV_GATEWAY = STATELESS
MASTERV_UPDATE_CHANNEL = INDEPENDENT_TAURI_SIGNED
SUPABASE_RUNTIME_DEPENDENCY = ZERO

MV_POST_EXIT_1 = CLOSED
MV_REL_1A = CLOSED
MV_REL_1B = CLOSED
MV_REL_1C = CLOSED
MV_REL_1 = CLOSED
INV_12 = CLOSED
MV_ARCH_001 = CLOSED
```

The next stage after merge may be `MV-PILOT-1 — Production External Pilot & First-Run Acceptance`, but it is explicitly outside this change.
