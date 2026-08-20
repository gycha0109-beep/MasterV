# MV-POST-EXIT-1 — Target Architecture Completion & 0.1.3 RC Readiness

Status: CLOSED — authoritative after the documentation-inclusive exact HEAD succeeds in `CI` and `MV EXIT-3 0.1.3 Clean Cut`, including the Windows 0.1.2 → 0.1.3 upgrade dry-run  
Architecture authority: `MV-ARCH-001`  
Target release: `0.1.3 — Clean Cut`  
Starting authority: `506c4c0bf36af4a2fba5eb0144878ca7819e56ef`

## Purpose

This stage closes the pre-release architecture/readiness gap after Supabase Exit. It does not activate production signing or publish a release.

The shipping Desktop version authority is `src-tauri/tauri.conf.json`, which is fixed to `0.1.3`. The npm package and Rust crate may retain internal package metadata `0.1.0`; they are not the NSIS/updater release-version authority.

Updater validation is split deliberately:

```text
Previous installed baseline     0.1.2 Migration Bridge
Unsigned updater-enabled RC     0.1.3
Future signed release target    0.1.3
Production publication          MV-REL-1 only
```

## MV-ARCH-001 §20 completion matrix

| Completion criterion | MV-POST-EXIT-1 authority |
| --- | --- |
| Product-key activation works | VERIFIED — Product Key activation + signed device resume authority |
| Subscription entitlement works | VERIFIED — Polar authority through MasterV Gateway |
| Device activation works | VERIFIED — device credential lifecycle and revalidation contract |
| Usage enforcement works | VERIFIED — Gateway-side credit/entitlement enforcement |
| Reference Library is SQLite-backed | VERIFIED — Local SQLite primary authority |
| Analysis results persist locally | VERIFIED — Local SQLite `analysis_results` |
| Production Guidance persists locally | VERIFIED — Local SQLite `production_guidance` |
| Gateway is stateless | VERIFIED |
| Gateway has no MasterV-owned central DB | VERIFIED — zero central product DB dependency |
| Gemini secret exists only server-side | VERIFIED — Gateway runtime authority |
| YouTube secret exists only server-side | VERIFIED — Gateway runtime authority |
| Updater works without Supabase | VERIFIED — independent Tauri updater authority |
| Update access is independent of subscription | VERIFIED — no session/Product Key/Polar/Gateway auth coupling |
| Supabase runtime network requests = 0 | VERIFIED |
| Supabase runtime secrets = 0 | VERIFIED |
| Supabase DB dependency = 0 | VERIFIED |
| Supabase Storage dependency = 0 | VERIFIED |
| User can export/import local data | VERIFIED — SQLite Online Backup/restore path and round-trip regression |
| DB migration backup exists | VERIFIED — pre-schema-migration and pre-import recovery snapshots |

## 0.1.3 version authority

The following version relationship is required and executable contracts reject regressions:

- `src-tauri/tauri.conf.json` → `0.1.3`
- `src-tauri/tauri.windows-updater-bootstrap.conf.json` → `0.1.2` previous-installed baseline
- `src-tauri/tauri.windows-updater-rc.conf.json` → `0.1.3`, `createUpdaterArtifacts: false`
- `src-tauri/tauri.windows-independent-updater-release.conf.json` → `0.1.3`, `createUpdaterArtifacts: true`
- no active updater/readiness workflow may retain the obsolete `0.1.1` installer authority

The unsigned RC configuration deliberately includes the independent updater feature and public-key/endpoint configuration while refusing to create production updater signatures. This allows installed/runtime/upgrade validation without requiring the production private key.

## Windows upgrade dry-run

The exact-head Windows quality gate must build both updater-enabled installers and prove:

```text
0.1.2 baseline install
→ Local SQLite fixture write
→ close baseline
→ 0.1.3 RC install in place
→ registry package version = 0.1.3
→ same Local SQLite database path
→ fixture survives upgrade
→ fixture cleanup
→ uninstall
→ executable/registry cleanup
```

The evidence marker is `MASTERV_POST_EXIT_1_UPGRADE_DRY_RUN_PASS`.

This is an installer/updater upgrade-path dry-run. It is **not** a claim that a production Tauri-signed artifact has been downloaded and cryptographically accepted from the live update channel.

## Signing and publication boundary

MV-POST-EXIT-1 proves the boundary before irreversible release activation:

- updater public-key authority is configured
- static HTTPS `latest.json` manifest shape is contract-tested with synthetic signature content
- unsigned 0.1.3 RC can be built and installed
- readiness workflows are exact-SHA/manual only
- pre-release workflows fail closed if a production Tauri signing key appears in their environment
- no readiness workflow consumes `secrets.TAURI_SIGNING_PRIVATE_KEY`
- no `.sig` is created by unsigned RC validation
- no GitHub Release is published
- no updater endpoint is mutated
- no signing private key or password is created, read, uploaded, logged, or persisted by this stage

The following remains intentionally external to this stage and belongs to `MV-REL-1`:

1. provision/recover the production Tauri updater private key through the approved secret-management boundary
2. create real signed updater artifacts and `.sig`
3. generate the production `latest.json`
4. prove Tauri updater signature verification against the real published candidate
5. publish/activate the 0.1.3 release channel

Therefore `INV-12` production-artifact signature acceptance remains `EXTERNAL_ACTIVATION_PENDING_MV_REL_1` even when MV-POST-EXIT-1 is closed.

## CI boundary

Ordinary PR synchronization remains exactly two automatic workflows:

1. `CI`
2. `MV EXIT-3 0.1.3 Clean Cut`

MV-POST-EXIT-1 adds checks inside the existing `CI` workflow and does not create a third automatic workflow.

The docs-inclusive final SHA is accepted only when:

- `npm run test:post-exit-1` succeeds
- `CI` succeeds
- `MV EXIT-3 0.1.3 Clean Cut` succeeds
- Windows native/local-first lifecycle succeeds
- unsigned 0.1.2 baseline and 0.1.3 updater-enabled RC builds succeed
- 0.1.2 → 0.1.3 Local SQLite upgrade survival succeeds
- no production signing credential or release publication is used

## Delivery boundary

This stage performs no:

- PR merge or Draft removal
- production deployment
- Gateway production mutation
- Polar production mutation
- production Tauri signing-key mutation
- production signing activation
- GitHub Release publication
- updater-channel publication
- secret mutation

Successful closeout means `0.1.3 RC READINESS = PASS`, not `0.1.3 PRODUCTION RELEASE = PUBLISHED`.
