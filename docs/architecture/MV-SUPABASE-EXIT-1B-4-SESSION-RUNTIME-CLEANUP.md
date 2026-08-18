# MV-SUPABASE-EXIT-1B-4 — Session Runtime Cleanup

## Status

Stage: `MV-SUPABASE-EXIT-1B-4`

Purpose: remove the obsolete Desktop session credential observer after `MV-SUPABASE-EXIT-1B-3` moved Deep Analysis and Background Batch onto the backend provider session runtime.

## Scope

Removed:

- `desktop/session-bridge.js`
- fetch monkey-patching used only to observe `/auth/v1/token` and `/auth/v1/logout`
- `window.MASTERV_SESSION_BRIDGE`
- `getAccessToken()` credential observation path

Retained intentionally:

- legacy Supabase email/password session adapter
- current Supabase Auth authority
- current hosted API authority
- current Reference Library Supabase authority
- backend provider `session.current()` / `session.subscribe()` runtime

## Runtime Authority

Desktop session state now has one runtime authority boundary:

```text
Desktop consumers
    ↓
MASTERV_BACKEND.session
    ↓
legacy Supabase session adapter
```

Deep Analysis and Background Batch consume the neutral backend session runtime and do not observe unrelated network traffic or construct authentication headers.

## Non-goals

This stage does not:

- replace Supabase Auth
- introduce product-key activation
- activate Polar
- activate MasterV Gateway
- migrate Reference Library authority to SQLite
- remove transitional Supabase build config
- change updater architecture

Those remain separate migration stages.

## Authority Markers

```text
migration_stage                   = MV-SUPABASE-EXIT-1B-4
session_bridge_active             = false
session_credential_observer_active = false
fetch_monkey_patch_active         = false
supabase_authority_unchanged      = true
local_sqlite_authority_active     = false
gateway_active                    = false
polar_active                      = false
```

## Verification

`desktop-session-runtime-cleanup-contract.mjs` proves:

- `desktop/session-bridge.js` does not exist
- Desktop source/build/runtime index do not reference the removed bridge
- no Desktop consumer observes `/auth/v1/token` or `/auth/v1/logout`
- no Desktop consumer monkey-patches `window.fetch`
- provider session runtime remains available
- legacy Supabase session adapter remains the transitional implementation
- SQLite product authority remains inactive
- Supabase authority remains unchanged

Dedicated workflow:

`MV Supabase Exit 1B-4 Session Runtime Cleanup`

## Next

`MV-SUPABASE-EXIT-1B-5 — Build / Config Boundary`

Goal: confine Supabase public runtime configuration to the legacy adapter/build bridge so Desktop consumers and target runtime contracts no longer depend on vendor-specific configuration names.
