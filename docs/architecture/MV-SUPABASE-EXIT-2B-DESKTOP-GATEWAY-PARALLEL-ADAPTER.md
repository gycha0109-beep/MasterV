# MV-SUPABASE-EXIT-2B — Desktop Gateway Parallel Adapter

Status: IMPLEMENTED — EXACT-HEAD CI REQUIRED FOR CLOSEOUT

Architecture authority: `MV-ARCH-001`

## Purpose

EXIT-2B introduces the Desktop-side MasterV Gateway and Product-Key/device-session adapter seam without changing the existing visible login/migration order yet.

This is intentionally a **parallel adapter** phase. The current legacy Desktop UI remains primary until EXIT-2C can perform Product-Key activation, local Reference Library authority wiring, and legacy data migration in a controlled order.

## Native Gateway transport

`src-tauri/src/gateway_transport.rs` owns the Desktop → MasterV Gateway HTTPS transport.

The Gateway base URL is supplied by `MASTERV_GATEWAY_BASE_URL` at runtime or release build time. The WebView does not receive the URL and does not perform direct browser fetches.

Native commands are bounded to the target Gateway contract:

- `desktop_gateway_status`
- `desktop_gateway_activate`
- `desktop_gateway_resume_session`
- `desktop_gateway_entitlement`
- `desktop_gateway_discover`
- `desktop_gateway_analyze`
- `desktop_gateway_guidance`

There is no arbitrary proxy command.

Outside local debug tests the base URL must use HTTPS. Redirect following is disabled and each request has a bounded timeout.

## Credential authority

### Product Key

Product Key is accepted only by `desktop_gateway_activate` and is transmitted only in the JSON body of `POST /v1/license/activate`.

It is never:

- persisted to SQLite
- persisted to DPAPI
- used as a bearer credential
- exposed as generic backend config

### Device credential

On successful activation the returned long-lived device credential is persisted using the EXIT-2A Windows DPAPI store together with:

- `install_id`
- `device_credential_expires_at`

The `install_id` is generated as UUID v4 when no prior secure device record exists.

### Session credential

The short-lived Gateway session credential is returned to the Desktop provider runtime and remains process-memory only. It is never written to DPAPI or SQLite.

A subsequent resume uses the DPAPI-protected device credential only for `POST /v1/session`, which returns a fresh short-lived session.

## Provider adapters

Parallel assets are introduced under the generic Desktop provider tree:

- `desktop/backend/gateway/gateway-session-provider.js`
- `desktop/backend/gateway/gateway-remote-provider.js`
- `desktop/backend/local/local-work-data-provider.js`
- `desktop/backend/bridge/transition-provider.js`

These adapters use Tauri `invoke` only. They perform no browser `fetch` and own no Supabase, Polar, Gemini, or YouTube vendor secret/hostname.

### Gateway session adapter

Supported credential kinds:

- `product_key`
- `resume`

### Gateway remote adapter

Maps the existing Desktop provider surface to:

- entitlement
- discovery
- analyze
- guidance

The adapter explicitly does **not** invent a Gateway route for Reference Compare or Background Batch.

- Reference Compare becomes local in EXIT-2C.
- Background Batch remains transition-only legacy behavior unless a later target architecture explicitly adds a stateless Gateway contract for it.

### Local work-data adapter

Maps the existing work-data provider surface to the EXIT-2A Tauri/SQLite commands and also exposes bridge-only optional methods for:

- Reference Library upsert
- analysis persistence
- comparison persistence
- Production Guidance persistence
- legacy Reference Library migration

### Transition adapter

The transition adapter supports both Gateway and legacy providers, with explicit 0.1.2-only fallback semantics. It is prepared in EXIT-2B but not made the visible Desktop primary until EXIT-2C.

## Why UI cutover is deferred

Switching the current email/password UI to Product Key before legacy work data has a deterministic backup/import path in the same runtime would create an avoidable migration-ordering hazard: a user could activate successfully and see an empty local Reference Library before their legacy data has been migrated.

EXIT-2C therefore owns one controlled visible transition:

1. Product-Key/device-session entry becomes primary.
2. Legacy Supabase login moves to migration-only fallback UI.
3. Legacy Reference Library is read through the old adapter.
4. SQLite snapshot is created.
5. Legacy rows are imported with local-wins semantics.
6. Local SQLite becomes the visible Reference Library authority.
7. Local Compare/Evidence replaces the hosted persisted-row compiler path.

## Explicitly unchanged in EXIT-2B

- `desktop/backend/backend.js` remains on the prior legacy composition.
- Existing email/password Desktop UI remains visible primary.
- `gateway_active` in active Desktop backend metadata remains `false`.
- `polar_active` in active Desktop backend metadata remains `false`.
- no live Product-Key is used in CI.
- no live Polar/Gemini/YouTube credential is used in CI.
- no real Gateway network request is made by PR CI.
- Supabase fallback remains available for the 0.1.2 migration.
- updater remains independent.

## Rust dependency boundary

Direct native transport requires:

- `reqwest 0.13.4`
- `uuid 1.24.1`

Both versions already exist in the repository's resolved dependency graph; EXIT-2B promotes them to direct dependencies for bounded Desktop Gateway transport and UUID v4 installation identity. The package Rust MSRV is raised to 1.85.0 to match the direct HTTP client requirement; CI continues to compile with pinned Rust 1.97.1.

## Closeout gates

EXIT-2B may close only when the exact head passes:

- EXIT-2A regression
- EXIT-1C stateless Gateway regression
- EXIT-1D Product-Key/Polar regression
- EXIT-1E updater regression
- Desktop Gateway parallel adapter contract
- Linux native Gateway transport tests
- Windows native Gateway transport tests
- Windows DPAPI regression
- SQLite authority regression
- locked native compile
- unchanged `Cargo.lock`

EXIT-2 itself remains open after EXIT-2B.
