# MV-SUPABASE-EXIT-3 — 0.1.3 Clean Cut

Status: CLOSED — authoritative after exact-head gates succeed  
Architecture authority: `MV-ARCH-001`  
Target release: `0.1.3 — Clean Cut`  
Starting authority: `f797060a938fd0f5bfccd4866164f282674d510f`

## Scope

0.1.3 removes the temporary vendor compatibility retained by the 0.1.2 Migration Bridge. Product runtime authority is now:

```text
Visible session              Product Key activation + device resume
Entitlement / usage          Polar authority through MasterV Gateway
Paid remote execution        Stateless MasterV Gateway
User work-data authority     Local SQLite
Reference Compare            Local canonical compiler
Analysis persistence         Local SQLite
Production Guidance storage  Local SQLite
Device credential storage    Windows DPAPI
Session credential storage   Memory only
Updater authority            Independent Tauri signed channel
```

## Removed

- legacy email/password migration UI
- legacy Desktop session/work-data/hosted adapters
- migration-specific Desktop runtime config bridge
- native migration bridge exposure
- vendor WebView CSP/network allowance
- web vendor Auth and persistent Reference Library client path
- Edge Functions and database migration tree
- old vendor-specific migration contracts
- old vendor-specific EXIT workflows
- vendor runtime env/key injection in CI, runtime smoke, release, signing, share-package, and pilot workflows

## 0.1.3 zero-dependency contract

`scripts/desktop-supabase-clean-cut-contract.mjs` scans application, Desktop, Gateway, native, script, and workflow source for the removed runtime env/key/origin/import contracts. It also requires:

- removed legacy source paths to be absent
- Product Key/device-resume session surface to remain
- Local SQLite to remain primary user work-data authority
- MasterV Gateway to remain remote authority
- Reference Compare to remain local canonical
- work-data transport to Gateway to remain disabled
- independent updater release config to target 0.1.3
- ordinary PR synchronization to create exactly `CI` and `MV EXIT-3 0.1.3 Clean Cut`
- feature-branch push duplication to remain absent

## Runtime/network completion criteria

The final exact SHA is accepted only when the clean-cut gate and native/installed runtime evidence prove:

```text
*.supabase.co runtime network requests = 0
Supabase runtime env vars              = 0
Supabase runtime keys                  = 0
Supabase DB access                     = 0
Supabase Storage access                = 0
SUPABASE_RUNTIME_DEPENDENCY            = ZERO
```

The Windows clean-cut runtime smoke additionally verifies a fresh Local SQLite-only launch, no legacy auth/migration surface, no browser credential persistence, native Local SQLite CRUD, process-restart persistence, cleanup, and zero fresh external WebView requests before Gateway activation.

## Delivery boundary

This source/runtime closeout does **not** perform:

- production deployment
- hosted data migration
- release publication
- signing activation
- secret mutation
- distribution to pilot users
- PR merge or Draft removal

The independent updater remains source-configured for 0.1.3 but no signed 0.1.3 release is published by this stage.

## Final authority condition

The repository may assert `SUPABASE_RUNTIME_DEPENDENCY = ZERO` only after the final documentation-inclusive SHA independently succeeds in both automatic PR workflows:

1. `CI`
2. `MV EXIT-3 0.1.3 Clean Cut`

Until those exact-head gates are green, this document is a closeout candidate rather than final evidence.
