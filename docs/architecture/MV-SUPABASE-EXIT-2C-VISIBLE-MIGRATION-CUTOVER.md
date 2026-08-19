# MV-SUPABASE-EXIT-2C — Visible Migration Cutover

Status: IMPLEMENTED / VALIDATION REQUIRED  
Target release: 0.1.2 Migration Bridge  
Architecture authority: MV-ARCH-001

## Scope

EXIT-2C promotes the already implemented 0.1.2 target adapters to the visible Desktop primary runtime without claiming the 0.1.3 Supabase clean cut.

Primary runtime authority after this change:

- Product activation / session: Product Key bootstrap + Windows device credential + short-lived MasterV Gateway session.
- Payment / subscription / entitlement / usage: Polar authority enforced through the Gateway.
- Reference Library / analysis results / comparison / Production Guidance: Local SQLite.
- Discovery / Deep Analysis / Production Guidance request execution: Stateless MasterV Gateway.
- Background operations: Desktop session-local orchestration + existing Gateway analyze execution + Local SQLite analysis-result persistence.
- Reference Compare: local canonical compiler built from the existing `lib/reference-compare.ts` and `lib/evidence-rules.ts` modules.
- Legacy Supabase: existing-data migration only in the visible 0.1.2 runtime.

`SUPABASE_RUNTIME_DEPENDENCY = ZERO` is deliberately **not** claimed in EXIT-2C.

## Visible activation lifecycle

```text
Desktop starts
  -> Local SQLite workspace opens independently
  -> Local Reference Library is accessible
  -> attempt Windows device credential resume
       -> success: short-lived Gateway session
       -> failure: remain local-only

First activation
  -> Product Key entered once
  -> POST /v1/license/activate through native HTTPS transport
  -> Product Key cleared from UI memory
  -> device credential stored by Windows DPAPI secure store
  -> session credential remains memory-only
```

Local work data does not require an active subscription session. Paid AI operations still require a Gateway session and are finally authorized server-side.

## Existing-data migration ordering

The legacy migration UI is isolated from normal product activation. Legacy email/password is used only to recover the existing 0.1.1 Reference Library and is never persisted.

```text
legacy credential available
  -> legacy Supabase session
  -> legacy personal workspace resolution
  -> full Reference Library export/read
  -> native migration command
       -> pre-import SQLite backup
       -> one IMMEDIATE transaction
       -> local-wins inserts (conflicts DO NOTHING)
       -> migration ledger success marker
       -> commit
  -> post-import SQLite integrity/schema/authority verification
  -> Local SQLite remains primary
  -> legacy session discarded
```

The native verified migration bridge wraps the EXIT-2A migration primitive. It does not replace its backup, transaction, local-wins, or idempotency behavior; it adds the required post-import verification before Desktop reports success.

## Reference Compare boundary

No new Gateway route is introduced for Reference Library or comparison.

Build-time `esbuild` bundles the existing canonical TypeScript modules into `desktop-dist/reference-compiler.js`. At runtime:

```text
selected source ids
  -> SQLite detail reads
  -> compareVideoAnalyses()
  -> compileEvidenceRules()
  -> comparison result persisted to SQLite
  -> UI render
```

User Reference Library data does not cross the Gateway boundary for comparison.

## Background operations boundary

The previous hosted Background Batch implementation depended on a Supabase-backed durable ledger. Promoting that implementation unchanged would violate the target requirement that the Gateway remain stateless and DB-less.

EXIT-2C therefore cuts the visible Product-Key runtime to a bounded local orchestrator:

```text
Desktop Product-Key session
  -> create request_id in Desktop
  -> session-local job map (QUEUED / RUNNING / SUCCEEDED / FAILED)
  -> existing Gateway /v1/analyze execution
  -> Gateway entitlement / usage enforcement
  -> successful analysis result persisted to Local SQLite
```

No new `/v1/background*` Gateway route and no MasterV-owned central job DB are introduced. The session-local queue itself is **not** claimed to survive an app restart in 0.1.2. Durable user analysis results continue to use Local SQLite authority. Legacy Supabase Background Batch code remains only as historical transition code pending EXIT-3 removal and is not the visible primary path.

## Remote result persistence

Gateway remains stateless and reports `persistence_authority = none`. The Desktop transition adapter persists successful results after they return:

- Deep Analysis -> `analysis_results`
- Background analysis -> `analysis_results`
- Production Guidance -> `production_guidance`
- Reference Compare -> `comparison_entries`

This preserves the Gateway's DB-less contract while making Local SQLite the product authority.

## Legacy boundary in 0.1.2

Still present for migration compatibility:

- legacy Supabase runtime config
- legacy Supabase session adapter
- legacy Supabase work-data adapter
- legacy hosted API adapter/code
- Supabase network/CSP allowances needed by the migration bridge

Not primary:

- visible account/session entry
- Reference Library reads/writes
- Reference Compare
- Discovery
- Deep Analysis
- Production Guidance
- Background operations

Removal of these remaining artifacts is EXIT-3 / 0.1.3 Clean Cut.

## Validation contract

`MASTERV_SUPABASE_EXIT_2C_VISIBLE_MIGRATION_CUTOVER_PASS` and `MASTERV_SUPABASE_EXIT_2C_BACKGROUND_GATEWAY_CUTOVER_PASS` require:

- visible Product Key activation and device resume
- no visible normal email/password login form
- Product Key cleared after activation attempt
- local workspace/Reference Library available without Gateway session
- Gateway primary for paid remote operations
- local canonical Reference Compare with zero Gateway user-work-data routes
- Background operations use session-local orchestration + existing Gateway analyze execution
- no new central Background job DB or Gateway Background route
- Background analysis result persists to Local SQLite
- no false queue restart-durability claim
- legacy migration read before native backup/import
- backup-first + transactional + local-wins + idempotent migration primitive
- post-import integrity verification
- analysis/comparison/guidance local persistence
- session credential memory-only
- Windows secure device credential
- no premature Supabase-zero claim

## EXIT-3 handoff

After 0.1.2 migration confidence is established, EXIT-3 removes Supabase Auth, runtime config/keys, network allowances, adapters, hosted legacy routes, storage/DB dependencies, and Supabase-specific CI. Only that clean-cut stage may assert runtime Supabase dependency zero.
