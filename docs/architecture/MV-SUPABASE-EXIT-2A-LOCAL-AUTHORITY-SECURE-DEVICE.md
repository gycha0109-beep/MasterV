# MV-SUPABASE-EXIT-2A — Local Authority & Secure Device Foundation

Status: CLOSED

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

## Closeout evidence

Audited implementation head:

`f42565fe6e5671decb574df2c65a4199efbd4f14`

Dedicated workflow:

- workflow: `MV Supabase Exit 2A Local Authority Secure Device`
- run: `32208489831`
- conclusion: `SUCCESS`
- source contract: `SUCCESS`
- Ubuntu native authority: `SUCCESS`
- Windows native authority: `SUCCESS`
- SQLite schema/migration/export/import tests: `SUCCESS`
- Windows DPAPI plaintext-leakage/round-trip/clear tests: `SUCCESS`
- native compile with locked Cargo graph: `SUCCESS`
- Cargo.lock mutation during EXIT-2A validation: `NONE`

Broad regression evidence:

- workflow: `CI`
- run: `32208489844`
- conclusion: `SUCCESS`
- canonical validate suite: `SUCCESS`
- Linux Desktop build: `SUCCESS`
- Windows native build/WebView2/NSIS/install/restart/uninstall: `SUCCESS`
- hosted provider-health observations: `SUCCESS`

Historical provider/config/session boundary workflows for EXIT-1B, plus EXIT-1C, EXIT-1D, and EXIT-1E, also returned `SUCCESS` on the audited head after successor-aware authority assertions were applied.

## Closeout classification

`EXIT-2A = STRICT SUCCESS / CLOSED`

This closure is limited to the local work-data authority and secure device foundation. It does **not** close the overall `0.1.2 Migration Bridge` and does not mean the active Desktop UI has switched to Product Key/Gateway yet.

Final 0.1.2 Bridge remains open until later subphases wire Product-Key/Gateway primary runtime and migrate legacy data through the explicit bridge path.
