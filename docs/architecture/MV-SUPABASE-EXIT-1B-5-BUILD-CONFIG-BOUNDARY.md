# MV-SUPABASE-EXIT-1B-5 — Build / Config Boundary

## Status

IMPLEMENTED / EXACT-HEAD VERIFICATION REQUIRED

## Purpose

EXIT-1B-5 removes Supabase-specific runtime configuration ownership from generic Desktop build/composition and remaining Desktop UI consumers without changing product authority.

This phase is a boundary refactor, not a provider cutover.

## Before

Generic Desktop build emitted one public config object containing:

- `supabase_url`
- `supabase_publishable_key`
- `api_base_url`
- `api_contract_version`

`desktop/backend/backend.js` consumed that generic object directly.

The private updater bootstrap also depended on the removed `MASTERV_SESSION_BRIDGE` and read `config.supabase_publishable_key` directly.

## After

### Generic Desktop config

`desktop-dist/config.js` contains only vendor-neutral runtime metadata:

- `surface`
- `runtime_contract_version`
- `backend_provider_contract_version`

It does not contain Supabase URL/key/API routing fields.

### Legacy adapter config

`scripts/desktop-legacy-config-bridge.mjs` is the transitional build-time authority for mapping the existing environment into the legacy adapter configuration.

The static builder emits:

`desktop-dist/backend/legacy/runtime-config.js`

which defines `window.MASTERV_LEGACY_RUNTIME_CONFIG`.

Only legacy adapter code consumes the vendor-specific fields.

### Backend composition

`desktop/backend/backend.js` consumes `MASTERV_LEGACY_RUNTIME_CONFIG`, not `MASTERV_DESKTOP_CONFIG`.

The provider boundary and current legacy adapters remain unchanged in authority.

### Private updater bootstrap

The updater UI no longer uses `MASTERV_SESSION_BRIDGE` and no longer reads a Supabase-named field from generic Desktop config.

It obtains the authenticated session through:

- `MASTERV_BACKEND.session.current()`
- `MASTERV_BACKEND.session.subscribe(...)`

The updater-only build step emits a neutral `MASTERV_UPDATER_BOOTSTRAP_CONFIG` containing the transitional public client key under a provider-neutral field name.

The native updater endpoint/header implementation remains legacy and is explicitly deferred to `EXIT-1E — Independent Updater`.

## Authority

This phase does not activate the target product authority.

```text
migration_stage                    = MV-SUPABASE-EXIT-1B-5
build_config_boundary              = legacy-runtime-config
desktop_config_vendor_neutral      = true
legacy_runtime_config_isolated     = true
session_bridge_active              = false
session_credential_observer_active = false
fetch_monkey_patch_active          = false
supabase_authority_unchanged       = true
local_sqlite_authority_active      = false
gateway_active                     = false
polar_active                       = false
```

## Explicit non-goals

EXIT-1B-5 does not:

- replace Supabase Auth
- switch Reference Library authority to SQLite
- activate MasterV Gateway
- activate Polar
- replace the current native private updater endpoint
- remove Supabase network traffic
- claim `SUPABASE_RUNTIME_DEPENDENCY = ZERO`

Those belong to later EXIT phases.

## Verification

Dedicated contract:

`scripts/desktop-build-config-boundary-contract.mjs`

Dedicated workflow:

`.github/workflows/mv-supabase-exit-1b-5.yml`

The contract verifies:

1. generic Desktop build/composition does not own Supabase env/config field names;
2. generated generic `config.js` is vendor-neutral;
3. vendor config is generated only as the legacy runtime-config asset;
4. runtime script ordering loads the isolated config before legacy adapters/backend composition;
5. updater UI uses backend session runtime rather than the removed session bridge;
6. updater bootstrap preparation does not reintroduce vendor-named config fields;
7. current Supabase authority remains unchanged.

## Next

After exact-head CI passes, EXIT-1B can be closed with a final boundary audit before moving to:

`MV-SUPABASE-EXIT-1C — Stateless Gateway`.
