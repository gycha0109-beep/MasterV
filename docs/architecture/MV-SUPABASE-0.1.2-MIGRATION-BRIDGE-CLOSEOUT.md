# MV-SUPABASE-0.1.2 — Migration Bridge Closeout & Evidence Freeze

Status: CLOSED  
Architecture authority: `MV-ARCH-001`  
Release track: `0.1.2 — Migration Bridge`  
Baseline audited HEAD: `26b44a0a37e49d1fad4d4cc087fd28425fca8365`

## Closeout scope

The Target Architecture defines 0.1.2 as the bounded migration bridge containing:

- Product Key activation
- Polar integration
- Stateless MasterV Gateway
- Local SQLite
- existing-data migration
- a new Supabase-independent updater channel
- temporary Supabase migration/fallback compatibility

This closeout freezes those boundaries. It does **not** perform the 0.1.3 clean cut and does not claim that Supabase has disappeared from the repository or runtime bridge.

## Authority at 0.1.2 closeout

```text
Visible Desktop session      Product Key activation + device resume
Entitlement / usage          Polar authority, enforced by MasterV Gateway
Paid remote execution        Stateless MasterV Gateway
User work-data authority     Local SQLite
Reference Compare            Local canonical compiler
Analysis persistence         Local SQLite
Production Guidance storage  Local SQLite
Background operations        Desktop session-local orchestration + Gateway execution
Background result storage    Local SQLite
Device credential storage    Windows DPAPI
Session credential storage   Memory only
Updater authority            Independent Tauri static signed channel
Legacy Supabase scope        Existing-data migration/fallback compatibility only
```

Normal user work-data operations have no Supabase fallback. Legacy email/password credentials are accepted only by the explicit existing-data migration action.

## Existing-data migration guarantees

The 0.1.2 bridge is frozen to the following ordering and failure semantics:

1. Open a legacy Supabase session only for explicit migration.
2. Resolve the legacy personal workspace.
3. Export the full legacy Reference Library using bounded pagination.
4. Validate records before local mutation.
5. Create a pre-import SQLite backup.
6. Import under one immediate transaction.
7. Preserve local data with local-wins conflict handling.
8. Write the migration ledger marker in the same transaction.
9. Verify post-import SQLite schema/authority/integrity before reporting success.
10. Close and discard the legacy session.
11. Repeated migration remains idempotent.

Local SQLite remains primary before, during, and after this operation.

## Baseline exact-head evidence

Baseline audited source HEAD:

`26b44a0a37e49d1fad4d4cc087fd28425fca8365`

Automatic PR validation at that exact HEAD:

- `CI` #1018 / run id `32319018184`: **SUCCESS**
  - `validate`: SUCCESS
  - `desktop-shell`: SUCCESS
  - `desktop-windows-quality`: SUCCESS
- `MV Supabase Exit 2C Visible Migration Cutover` #34 / run id `32319018099`: **SUCCESS**
  - `source-contract`: SUCCESS
  - `native-cutover (ubuntu-22.04)`: SUCCESS
  - `native-cutover (windows-2025)`: SUCCESS

Windows runtime evidence artifact from CI #1018:

- artifact: `masterv-windows-desktop-smoke`
- artifact id: `9389250461`
- digest: `sha256:1b61cec2af4da1a3be1592ef6265c08fe2ed8f654be5cf99bf561cc060d783c1`
- native local-first runtime: PASS
- unsigned NSIS build/install: PASS
- installed launch/restart: PASS
- Local SQLite persistence across process restart: PASS
- local Reference Detail/Compare: PASS
- uninstall and executable/registry cleanup: PASS
- autorun/service/scheduled-task residue: none

The evidence-freeze commit itself is authoritative only after the automatic `CI` and `MV Supabase Exit 2C Visible Migration Cutover` workflows independently succeed at its exact SHA.

## Residual Supabase inventory accepted in 0.1.2

The following classes of artifacts are intentionally retained only for migration/fallback compatibility or historical regression evidence and are assigned to EXIT-3 deletion:

- legacy Desktop Supabase session and work-data adapters
- legacy hosted API adapter/code
- Supabase URL and publishable-key migration-era runtime config
- Supabase network/CSP allowances required by the migration bridge
- historical Supabase Auth / Reference Library libraries and contract tests
- historical Supabase Edge Functions and database migrations
- historical Supabase-specific regression workflows/contracts

These artifacts are **non-primary** in the visible 0.1.2 product path. Their presence is expected and is not a 0.1.2 closeout failure.

## Updater boundary

0.1.2 contains the independent updater channel required by the Target Architecture:

- static metadata endpoint: GitHub Release `latest.json`
- artifact authenticity: Tauri updater signature
- updater does not require Supabase, Product Key, Polar, or Gateway session authority
- 0.1.2 release configuration has updater artifacts enabled

A live signed 0.1.2 release is **not published or activated by this source/runtime closeout**. Release publication, signing-key use, and production distribution remain separate authorized release operations.

## Explicit non-claims

```text
SUPABASE_RUNTIME_DEPENDENCY = ZERO   NOT CLAIMED
0.1.3 Clean Cut                       NOT STARTED
live signed 0.1.2 release published   NO
production deployment                 NO
production data mutation              NO
Supabase migration execution          NO
secret mutation                       NO
signing activation                    NO
```

The Target Architecture reserves Supabase URL/key/network/DB/Storage removal and the final runtime-zero assertion for `0.1.3 — Clean Cut`.

## Evidence freeze

`scripts/desktop-migration-bridge-closeout-contract.mjs` freezes the 0.1.2 authority model and is executed inside the existing EXIT-2C PR workflow. It rejects regressions that would:

- restore Supabase as normal session/work-data authority
- remove Product Key/device-resume primary session wiring
- bypass Gateway/Polar authority for paid remote execution
- remove Local SQLite primary work-data authority
- transport Reference Library work data to the Gateway
- weaken backup/transaction/local-wins/idempotent/integrity migration semantics
- re-couple the updater to Supabase/application authorization
- prematurely claim Supabase runtime dependency zero
- reintroduce the feature-branch push trigger that caused duplicate PR CI

No additional automatic workflow is introduced; ordinary PR synchronization remains bounded to `CI` plus `MV Supabase Exit 2C Visible Migration Cutover`.

## Closeout classification

```text
0.1.2 Migration Bridge = STRICT SUCCESS / CLOSED
EXIT-3 / 0.1.3        = READY TO START / NOT STARTED
SUPABASE_RUNTIME_DEPENDENCY = ZERO = NOT CLAIMED
```

EXIT-3 is the next architecture stage. It owns removal of the residual Supabase code, runtime config/keys, network allowances, hosted functions/storage/DB dependencies, and Supabase-specific CI contracts.
