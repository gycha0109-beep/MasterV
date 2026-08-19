# MV-SUPABASE-EXIT-2A — Local Authority & Secure Device Foundation

Status: IMPLEMENTED — EXACT-HEAD CI REQUIRED FOR CLOSEOUT

Architecture authority: `MV-ARCH-001`

## Purpose

EXIT-2A is the first bounded subphase of the `0.1.2 Migration Bridge`.

It promotes local SQLite from a prepared persistence foundation to the product authority for user work data while preserving a temporary, explicitly non-primary Supabase fallback for the later data-import bridge. It also establishes the Windows secure-storage boundary required before Product-Key/Gateway session wiring can become the Desktop primary runtime.

EXIT-2A does **not** activate Product-Key UI, Gateway Desktop routing, Polar Desktop authority, or legacy Supabase data import from the UI. Those are owned by later EXIT-2 subphases.

## Authority transition

Before EXIT-2A:

- SQLite schema exists but `product_authority_active = false`.
- Supabase remains the active Desktop work-data authority.
- no native secure device-credential store is exposed.

After EXIT-2A foundation:

- Local SQLite declares `product_authority_active = true` for user work data.
- Supabase is explicitly `primary_authority = false` but remains available as migration/fallback authority during 0.1.2 only.
- Local workspace authority is `local:masterv`, independent of Polar customer/license/device identity.
- Device credential persistence uses Windows DPAPI under the current OS user.
- Product Key is never stored.
- Short-lived Gateway session credentials are never stored.
- Independent updater remains separate from application/session/subscription authority.

## Local schema v2

Schema version advances from `1` to `2`.

Existing tables remain authoritative foundations:

- `reference_library_entries`
- `analysis_results`
- `comparison_entries`
- `production_guidance`
- `settings`

New bridge metadata:

- `migration_runs`
- local Reference Library source index

Any existing v1 database is backed up using SQLite Online Backup before the v1 → v2 transaction starts.

## Native local work-data API

EXIT-2A exposes bounded Tauri commands for:

- local workspace identity
- Reference Library list
- Reference Library lazy detail
- Reference Library upsert/delete
- analysis result persistence
- comparison result persistence
- Production Guidance persistence
- legacy Reference Library bulk migration
- local database export
- local database import

Reference Library list remains metadata-only. Full `analysis_json` is parsed and returned only by explicit detail lookup.

## Legacy migration semantics

The migration contract is deliberately conservative:

1. Validate all incoming records before mutation.
2. If migration already completed, return the existing completion record without writing.
3. Create a `pre-supabase-reference-import` SQLite snapshot.
4. Start one `IMMEDIATE` transaction.
5. Import into `local:masterv`.
6. Resolve collisions with **local-wins** semantics (`DO NOTHING`).
7. Write the migration completion marker in the same transaction.
8. Commit atomically.

This prevents legacy hosted state from overwriting local work created after the bridge becomes authoritative.

## Secure device identity

Windows secure storage is implemented with OS DPAPI:

- `CryptProtectData`
- `CryptUnprotectData`
- `CRYPTPROTECT_UI_FORBIDDEN`

The encrypted payload contains only:

- `install_id`
- long-lived `device_credential`
- `device_credential_expires_at`

It does not contain:

- Product Key
- short-lived Gateway session credential
- Gemini key
- YouTube key
- Polar access token
- Supabase credential

The encrypted blob is stored under Tauri `app_local_data_dir` as `device-identity.dpapi`.

Non-Windows builds compile the boundary but report secure device persistence as unsupported. MasterV production Desktop authority remains Windows.

## Explicitly deferred

EXIT-2A does not perform:

- Product-Key activation UI
- automatic device-session resume
- Gateway Desktop adapter activation
- `/v1/discovery`, `/v1/analyze`, `/v1/guidance` Desktop cutover
- legacy Supabase login/import UX
- local canonical Compare/Evidence UI wiring
- automatic Deep Analysis → SQLite persistence UI wiring
- automatic Production Guidance → SQLite persistence UI wiring
- final Supabase removal

Those are subsequent EXIT-2/EXIT-3 responsibilities.

## Closeout gates

EXIT-2A may close only when the exact branch head passes:

- updated EXIT-1A SQLite regression contract
- EXIT-1E independent updater regression
- EXIT-2A source authority contract
- Linux native SQLite tests
- Windows native SQLite tests
- Windows DPAPI round-trip + plaintext leakage check
- native compile with locked Cargo graph
- unchanged `Cargo.lock`

Final 0.1.2 Bridge remains open until later subphases wire Product-Key/Gateway primary runtime and migrate legacy data through the explicit bridge path.
