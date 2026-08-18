# MV-SUPABASE-EXIT-1A — Local SQLite Foundation

**Stage:** MV-SUPABASE-EXIT-1A  
**Architecture Authority:** `MV-ARCH-001`  
**Implementation Status:** IMPLEMENTED / EXACT-HEAD VERIFICATION REQUIRED  
**Activation Status:** NOT ACTIVATED  

## 1. Purpose

This stage establishes the native Local SQLite foundation required by the MasterV target architecture without changing current product persistence authority.

EXIT-1A is deliberately narrower than the later 0.1.2 Migration Bridge.

It adds:

- app-local SQLite database initialization,
- schema version authority,
- transactional schema migration,
- pre-migration snapshots,
- export/import primitives,
- integrity validation,
- native persistence tests,
- a bounded Tauri status command.

It does **not** switch the Reference Library or any other product workflow away from Supabase.

## 2. Authority Boundary

During EXIT-1A:

```text
Product persistence authority       = existing Supabase path
Local SQLite product authority      = false
Supabase runtime dependency removal = not started
Hosted data mutation                = none
Provider activation                 = none
Updater activation                  = none
```

At design-time hosted verification, `public.reference_library_entries` contained **0 rows**. Therefore this stage requires no hosted Reference Library data migration.

The local database is a dormant foundation for later migration stages.

## 3. Storage Location

The database is initialized below the Tauri application-local data directory:

```text
<Tauri app_local_data_dir>/masterv.db
<Tauri app_local_data_dir>/backups/*.db
```

The application uses Tauri's app-specific **local** data path rather than a repository-relative, current-working-directory, or roaming application-data path. On Windows this resolves through the local-data directory family rather than the roaming-data directory family, matching MasterV's local-first, machine-local authority model.

## 4. SQLite Runtime

Native dependency:

```toml
rusqlite = { version = "=0.32.1", features = ["bundled", "backup"] }
```

Properties:

- SQLite is bundled with the native application.
- No Windows system SQLite installation is required.
- The SQLite Online Backup API is available for snapshots/export/import recovery.
- WebView code receives no raw SQL execution surface.

Runtime pragmas:

```text
foreign_keys = ON
journal_mode = WAL
synchronous = NORMAL
busy_timeout = 5 seconds
```

## 5. Schema Authority

Current local schema authority:

```text
CURRENT_SCHEMA_VERSION = 1
```

Required tables:

### `masterv_schema_meta`

Owns the integer local database schema version.

### `reference_library_entries`

Reserved local representation compatible with the current Reference Library domain shape and future migration bridge.

Primary identity:

```text
(workspace_id, source_platform, source_id)
```

### `analysis_results`

Reserved local authority for persisted analysis results.

### `comparison_entries`

Reserved local authority for comparison payloads.

### `production_guidance`

Reserved local authority for persisted production guidance.

### `settings`

Provides the first bounded native CRUD surface and validates reopen persistence.

## 6. Migration Contract

Migrations run under:

```text
TransactionBehavior::Immediate
```

Rules:

1. Read current local schema version.
2. Reject a database newer than the supported application schema.
3. If an existing non-empty database requires migration, create an Online Backup snapshot first.
4. Execute schema changes inside one immediate transaction.
5. Commit the new schema version only with the migration transaction.
6. Run integrity and required-table validation before startup completes.

A failed initialization must not silently declare an invalid local database usable.

## 7. Backup Contract

Pre-migration backup:

```text
backups/masterv-pre-migration-v<from>-to-v<to>-<nonce>.db
```

Pre-import recovery backup:

```text
backups/masterv-pre-import-<nonce>.db
```

Snapshots use SQLite's backup API rather than copying a live `.db` file directly.

## 8. Export / Import Foundation

EXIT-1A provides native primitives but no product UI wiring yet.

### Export

- validate current live database,
- create destination parent path,
- generate a SQLite backup at the destination,
- validate the exported database.

### Import

- reject missing/invalid/future-schema source databases before touching live state,
- create a recovery snapshot of the current live database,
- restore the validated source database,
- validate imported schema/integrity,
- restore the recovery snapshot if import/post-validation fails.

Product-facing Export/Import UX is a later stage.

## 9. Security Boundary

The local SQLite database must not contain infrastructure/provider secrets, including:

```text
Gemini API key
YouTube API key
Polar admin credential
Gateway signing secret
Tauri updater signing private key
Infrastructure credentials
```

Desktop remains an untrusted client for future entitlement decisions.

## 10. Tauri Surface

EXIT-1A exposes only bounded status information:

```text
desktop_local_persistence_status
```

Status explicitly reports:

```text
product_authority_active = false
supabase_authority_unchanged = true
```

No product UI uses this command as persistence authority in EXIT-1A.

## 11. Verification Contract

Static contract marker:

```text
MASTERV_SUPABASE_EXIT_1A_LOCAL_SQLITE_CONTRACT_PASS
```

Native tests cover:

1. schema v1 initialization and required tables,
2. settings CRUD persistence across reopen,
3. pre-migration backup preserving legacy pre-migration state,
4. export/import round-trip,
5. pre-import recovery backup,
6. future-schema import rejection without mutating live data.

Dedicated GitHub Actions verification runs on:

```text
ubuntu-22.04
windows-2025
```

Existing MasterV Desktop CI remains responsible for broader regression coverage.

## 12. Non-Goals

EXIT-1A does not implement:

- Polar integration,
- product-key activation,
- device credential storage,
- Gateway provider abstraction,
- Reference Library SQLite wiring,
- hosted-to-local data migration,
- Supabase Auth removal,
- Supabase endpoint removal,
- independent updater channel activation,
- Cloud Sync.

## 13. Progression

```text
EXIT-1A Local SQLite Foundation
        ↓
EXIT-1B Backend Provider Abstraction
        ↓
EXIT-1C Stateless MasterV Gateway
        ↓
EXIT-1D Product Key / Polar Integration
        ↓
EXIT-1E Independent Updater Channel
        ↓
0.1.2 Migration Bridge
        ↓
0.1.3 Supabase Clean Cut
```

EXIT-1A is complete only after exact-head native and repository regression verification passes while Supabase production authority remains unchanged.
