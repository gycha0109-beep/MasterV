# MV-SUPABASE-EXIT-1B-CLOSEOUT — Provider / Config Boundary Final Audit

Status: CLOSED

## Closeout Evidence

Initial closeout audit evidence:

- audited implementation head: `180d3b4a6d40b99a4480b31f4177f987d41905a9`
- workflow: `MV Supabase Exit 1B Closeout Audit`
- run: `32200312823` / run #2
- conclusion: `SUCCESS`
- generic Desktop runtime files audited: `8`
- allowed legacy runtime files: exactly `3`
- generic vendor config couplings: `0`
- generic direct fetch paths: `0`
- session bridge paths: `0`
- generic builder vendor env-name ownership: `0`

This closure is limited to the EXIT-1B provider/config boundary. It is not a declaration of the final 0.1.3 Supabase clean cut.

## Purpose

Close EXIT-1B only if the Desktop provider/config boundary is structurally complete.

This is not the final Supabase removal milestone. The target architecture still requires later phases for Local SQLite product authority, stateless Gateway, product-key/Polar licensing, independent updater, migration bridge, and 0.1.3 clean cut.

## Architecture Basis

The target architecture requires:

- Desktop product contract must not depend on vendor-specific backend hostnames.
- Final user work-data authority is Local SQLite.
- Final AI/provider request execution is through the MasterV Gateway.
- Final Supabase authority is none after migration completion.
- 0.1.2 may retain Supabase only as a temporary migration/fallback bridge.
- 0.1.3 removes Supabase Auth, URL, publishable key, Edge Function/DB/Storage/updater/runtime/CI dependencies.

EXIT-1B therefore closes only the provider and configuration abstraction boundary. It does not claim the 0.1.3 clean cut.

## Closeout Invariants

### Generic Desktop runtime

Outside `desktop/backend/legacy/`:

- no `NEXT_PUBLIC_SUPABASE_*` ownership
- no `supabase_url`
- no `supabase_publishable_key`
- no `*.supabase.co` hostname knowledge
- no `/auth/v1`, `/rest/v1`, `/functions/v1` provider-path knowledge
- no direct `fetch(...)`
- no `window.fetch` monkey patch
- no `MASTERV_SESSION_BRIDGE`
- no `getAccessToken()` compatibility path

### Allowed legacy runtime surface

The complete runtime allowlist is exactly:

- `desktop/backend/legacy/supabase-session-provider.js`
- `desktop/backend/legacy/supabase-work-data-provider.js`
- `desktop/backend/legacy/hosted-api-client.js`

No additional Desktop runtime file may own Supabase transport/config details during EXIT-1B.

### Build/config boundary

- generic `scripts/build-desktop-static.mjs` does not own Supabase env names or vendor config field names
- transitional mapping is isolated in `scripts/desktop-legacy-config-bridge.mjs`
- generated generic `desktop-dist/config.js` is vendor-neutral
- generated provider config is isolated to `desktop-dist/backend/legacy/runtime-config.js`
- backend composition consumes `MASTERV_LEGACY_RUNTIME_CONFIG`, not generic Desktop config

### Session authority

- provider boundary is the sole active Desktop session runtime
- App, Deep Analysis, Background Batch, and updater UI consume `MASTERV_BACKEND.session`
- deleted session bridge is not rebuilt or referenced

## Explicitly Deferred Couplings

The following are outside EXIT-1B closure and remain intentional until their owning phases:

1. Legacy Supabase session/work-data/hosted adapters — removed by later migration/clean-cut work.
2. `src-tauri/src/updater.rs` Supabase update endpoint and `apikey` header — owned by EXIT-1E Independent Updater.
3. Supabase-backed product authority / Reference Library authority — product authority switch is not part of EXIT-1B.
4. Supabase-specific CI/runtime migration fixtures — removed only when their dependent migration path is retired.

These exceptions must not be interpreted as final architecture compliance.

## Authority at EXIT-1B Closeout

```text
product_authority_active       = false
supabase_authority_unchanged   = true
local_sqlite_authority_active  = false
gateway_active                 = false
polar_active                   = false
session_bridge_active          = false
fetch_monkey_patch_active      = false
desktop_config_vendor_neutral  = true
legacy_runtime_config_isolated = true
```

## Verification

The closeout workflow runs all EXIT-1B contracts plus a recursive Desktop source audit:

- EXIT-1B-1 provider foundation
- EXIT-1B-2 App consumer rewiring
- EXIT-1B-3 remote consumer rewiring
- EXIT-1B-4 session cleanup
- EXIT-1B-5 build/config boundary
- recursive generic Desktop coupling audit
- Desktop shell regression
- Hosted Deep Analysis regression
- Hosted Production Guidance regression
- Hosted Background Batch regression

## Closure Rule

EXIT-1B may be declared CLOSED only when the exact branch head passes `MV Supabase Exit 1B Closeout Audit` with all steps successful.

After closure, the next architecture phase is:

`MV-SUPABASE-EXIT-1C — Stateless Gateway`
