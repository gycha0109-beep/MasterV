use rusqlite::backup::Progress;
use rusqlite::{params, Connection, DatabaseName, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

pub const CURRENT_SCHEMA_VERSION: i64 = 2;
pub const LOCAL_WORKSPACE_ID: &str = "local:masterv";
const DATABASE_FILE: &str = "masterv.db";
const BACKUP_DIRECTORY: &str = "backups";

#[derive(Clone, Debug)]
pub struct LocalPersistence {
    db_path: PathBuf,
    backup_dir: PathBuf,
}

#[derive(Debug, Serialize)]
pub struct LocalPersistenceStatus {
    pub schema_version: i64,
    pub database_path: String,
    pub backup_directory: String,
    pub workspace_id: &'static str,
    pub product_authority_active: bool,
    pub local_sqlite_authority_active: bool,
    pub remote_fallback_available: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ReferenceLibraryUpsertInput {
    pub source_platform: String,
    pub source_id: String,
    pub native_id: String,
    pub canonical_url: String,
    pub label: String,
    pub analysis: Value,
    pub analysis_cache_key: String,
    pub analysis_provenance: String,
    pub schema_version: String,
    pub first_saved_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReferenceLibrarySummary {
    pub source_id: String,
    pub canonical_url: String,
    pub label: String,
    pub analysis_provenance: String,
    pub revision: i64,
    pub first_saved_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReferenceLibraryDetail {
    pub source_id: String,
    pub canonical_url: String,
    pub label: String,
    pub analysis_provenance: String,
    pub revision: i64,
    pub first_saved_at: String,
    pub updated_at: String,
    pub analysis: Value,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AnalysisResultInput {
    pub id: String,
    pub source_platform: String,
    pub source_id: String,
    pub analysis: Value,
    pub analysis_cache_key: Option<String>,
    pub schema_version: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ComparisonEntryInput {
    pub id: String,
    pub payload: Value,
    pub schema_version: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ProductionGuidanceInput {
    pub id: String,
    pub source_platform: String,
    pub source_id: String,
    pub guidance: Value,
    pub schema_version: String,
}

impl LocalPersistence {
    pub fn initialize<P: AsRef<Path>>(app_data_dir: P) -> Result<Self, String> {
        let app_data_dir = app_data_dir.as_ref();
        fs::create_dir_all(app_data_dir).map_err(error_string)?;

        let db_path = app_data_dir.join(DATABASE_FILE);
        let backup_dir = app_data_dir.join(BACKUP_DIRECTORY);
        fs::create_dir_all(&backup_dir).map_err(error_string)?;

        let existed_nonempty = fs::metadata(&db_path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false);
        let mut connection = open_connection(&db_path)?;
        let schema_version = read_schema_version(&connection)?;

        if schema_version > CURRENT_SCHEMA_VERSION {
            return Err(format!(
                "local database schema {schema_version} is newer than supported schema {CURRENT_SCHEMA_VERSION}"
            ));
        }

        if schema_version < CURRENT_SCHEMA_VERSION {
            if existed_nonempty {
                create_snapshot(
                    &connection,
                    &backup_dir,
                    &format!(
                        "pre-migration-v{schema_version}-to-v{CURRENT_SCHEMA_VERSION}"
                    ),
                )?;
            }
            migrate(&mut connection, schema_version)?;
        }

        configure_runtime(&connection)?;
        validate_current_database(&connection)?;

        Ok(Self {
            db_path,
            backup_dir,
        })
    }

    pub fn status(&self) -> Result<LocalPersistenceStatus, String> {
        let connection = open_connection(&self.db_path)?;
        validate_current_database(&connection)?;
        Ok(LocalPersistenceStatus {
            schema_version: read_schema_version(&connection)?,
            database_path: self.db_path.to_string_lossy().into_owned(),
            backup_directory: self.backup_dir.to_string_lossy().into_owned(),
            workspace_id: LOCAL_WORKSPACE_ID,
            product_authority_active: true,
            local_sqlite_authority_active: true,
            remote_fallback_available: false,
        })
    }

    pub fn put_setting(&self, key: &str, value: &Value) -> Result<(), String> {
        if key.trim().is_empty() {
            return Err("setting key must not be empty".to_string());
        }
        let encoded = serde_json::to_string(value).map_err(error_string)?;
        let connection = open_connection(&self.db_path)?;
        connection
            .execute(
                "INSERT INTO settings (key, value_json, updated_at)\n                 VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n                 ON CONFLICT(key) DO UPDATE SET\n                   value_json = excluded.value_json,\n                   updated_at = excluded.updated_at",
                params![key, encoded],
            )
            .map_err(error_string)?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<Value>, String> {
        let connection = open_connection(&self.db_path)?;
        let encoded = connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(error_string)?;

        encoded
            .map(|value| serde_json::from_str(&value).map_err(error_string))
            .transpose()
    }

    pub fn list_reference_library(&self) -> Result<Vec<ReferenceLibrarySummary>, String> {
        let connection = open_connection(&self.db_path)?;
        let mut statement = connection
            .prepare(
                "SELECT source_id, canonical_url, label, analysis_provenance, revision, first_saved_at, updated_at\n                 FROM reference_library_entries\n                 WHERE workspace_id = ?1\n                 ORDER BY updated_at DESC, source_id ASC",
            )
            .map_err(error_string)?;
        let rows = statement
            .query_map([LOCAL_WORKSPACE_ID], |row| {
                Ok(ReferenceLibrarySummary {
                    source_id: row.get(0)?,
                    canonical_url: row.get(1)?,
                    label: row.get(2)?,
                    analysis_provenance: row.get(3)?,
                    revision: row.get(4)?,
                    first_saved_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(error_string)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(error_string)
    }

    pub fn fetch_reference_detail(
        &self,
        source_id: &str,
    ) -> Result<ReferenceLibraryDetail, String> {
        require_nonempty("source_id", source_id)?;
        let connection = open_connection(&self.db_path)?;
        let mut statement = connection
            .prepare(
                "SELECT source_id, canonical_url, label, analysis_provenance, revision, first_saved_at, updated_at, analysis_json\n                 FROM reference_library_entries\n                 WHERE workspace_id = ?1 AND source_id = ?2\n                 ORDER BY source_platform ASC\n                 LIMIT 2",
            )
            .map_err(error_string)?;
        let mut rows = statement
            .query(params![LOCAL_WORKSPACE_ID, source_id])
            .map_err(error_string)?;
        let first = rows
            .next()
            .map_err(error_string)?
            .ok_or_else(|| format!("reference not found: {source_id}"))?;
        let encoded: String = first.get(7).map_err(error_string)?;
        let detail = ReferenceLibraryDetail {
            source_id: first.get(0).map_err(error_string)?,
            canonical_url: first.get(1).map_err(error_string)?,
            label: first.get(2).map_err(error_string)?,
            analysis_provenance: first.get(3).map_err(error_string)?,
            revision: first.get(4).map_err(error_string)?,
            first_saved_at: first.get(5).map_err(error_string)?,
            updated_at: first.get(6).map_err(error_string)?,
            analysis: serde_json::from_str(&encoded).map_err(error_string)?,
        };
        if rows.next().map_err(error_string)?.is_some() {
            return Err(format!(
                "reference source_id is ambiguous across platforms: {source_id}"
            ));
        }
        Ok(detail)
    }

    pub fn upsert_reference_library(
        &self,
        input: &ReferenceLibraryUpsertInput,
    ) -> Result<(), String> {
        validate_reference_input(input)?;
        let connection = open_connection(&self.db_path)?;
        upsert_reference_row(&connection, input, false)?;
        Ok(())
    }

    pub fn delete_reference_library(&self, source_id: &str) -> Result<usize, String> {
        require_nonempty("source_id", source_id)?;
        let connection = open_connection(&self.db_path)?;
        connection
            .execute(
                "DELETE FROM reference_library_entries WHERE workspace_id = ?1 AND source_id = ?2",
                params![LOCAL_WORKSPACE_ID, source_id],
            )
            .map_err(error_string)
    }

    pub fn save_analysis_result(&self, input: &AnalysisResultInput) -> Result<(), String> {
        for (label, value) in [
            ("id", input.id.as_str()),
            ("source_platform", input.source_platform.as_str()),
            ("source_id", input.source_id.as_str()),
            ("schema_version", input.schema_version.as_str()),
        ] {
            require_nonempty(label, value)?;
        }
        let encoded = serde_json::to_string(&input.analysis).map_err(error_string)?;
        let connection = open_connection(&self.db_path)?;
        connection
            .execute(
                "INSERT INTO analysis_results (id, source_platform, source_id, analysis_json, analysis_cache_key, schema_version, created_at, updated_at)\n                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n                 ON CONFLICT(id) DO UPDATE SET\n                   analysis_json = excluded.analysis_json,\n                   analysis_cache_key = excluded.analysis_cache_key,\n                   schema_version = excluded.schema_version,\n                   updated_at = excluded.updated_at",
                params![
                    input.id,
                    input.source_platform,
                    input.source_id,
                    encoded,
                    input.analysis_cache_key,
                    input.schema_version
                ],
            )
            .map_err(error_string)?;
        Ok(())
    }

    pub fn save_comparison_entry(&self, input: &ComparisonEntryInput) -> Result<(), String> {
        require_nonempty("id", &input.id)?;
        require_nonempty("schema_version", &input.schema_version)?;
        let encoded = serde_json::to_string(&input.payload).map_err(error_string)?;
        let connection = open_connection(&self.db_path)?;
        connection
            .execute(
                "INSERT INTO comparison_entries (id, payload_json, schema_version, created_at, updated_at)\n                 VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n                 ON CONFLICT(id) DO UPDATE SET\n                   payload_json = excluded.payload_json,\n                   schema_version = excluded.schema_version,\n                   updated_at = excluded.updated_at",
                params![input.id, encoded, input.schema_version],
            )
            .map_err(error_string)?;
        Ok(())
    }

    pub fn save_production_guidance(
        &self,
        input: &ProductionGuidanceInput,
    ) -> Result<(), String> {
        for (label, value) in [
            ("id", input.id.as_str()),
            ("source_platform", input.source_platform.as_str()),
            ("source_id", input.source_id.as_str()),
            ("schema_version", input.schema_version.as_str()),
        ] {
            require_nonempty(label, value)?;
        }
        let encoded = serde_json::to_string(&input.guidance).map_err(error_string)?;
        let connection = open_connection(&self.db_path)?;
        connection
            .execute(
                "INSERT INTO production_guidance (id, source_platform, source_id, guidance_json, schema_version, created_at, updated_at)\n                 VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n                 ON CONFLICT(id) DO UPDATE SET\n                   guidance_json = excluded.guidance_json,\n                   schema_version = excluded.schema_version,\n                   updated_at = excluded.updated_at",
                params![
                    input.id,
                    input.source_platform,
                    input.source_id,
                    encoded,
                    input.schema_version
                ],
            )
            .map_err(error_string)?;
        Ok(())
    }

    pub fn export_to<P: AsRef<Path>>(&self, destination: P) -> Result<(), String> {
        let destination = destination.as_ref();
        if destination == self.db_path {
            return Err("export destination must differ from the live database".to_string());
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(error_string)?;
        }
        if destination.exists() {
            fs::remove_file(destination).map_err(error_string)?;
        }

        let connection = open_connection(&self.db_path)?;
        validate_current_database(&connection)?;
        connection
            .backup(DatabaseName::Main, destination, None)
            .map_err(error_string)?;
        validate_external_database(destination)?;
        Ok(())
    }

    pub fn import_from<P: AsRef<Path>>(&self, source: P) -> Result<PathBuf, String> {
        let source = source.as_ref();
        if source == self.db_path {
            return Err("import source must differ from the live database".to_string());
        }
        validate_external_database(source)?;

        let current = open_connection(&self.db_path)?;
        let recovery_backup = create_snapshot(&current, &self.backup_dir, "pre-import")?;
        drop(current);

        let mut destination = open_connection(&self.db_path)?;
        if let Err(error) = destination.restore(
            DatabaseName::Main,
            source,
            None::<fn(Progress)>,
        ) {
            let _ = destination.restore(
                DatabaseName::Main,
                &recovery_backup,
                None::<fn(Progress)>,
            );
            return Err(format!("failed to import local database: {error}"));
        }

        if let Err(error) = configure_runtime(&destination)
            .and_then(|_| validate_current_database(&destination))
        {
            let restore_result = destination.restore(
                DatabaseName::Main,
                &recovery_backup,
                None::<fn(Progress)>,
            );
            return match restore_result {
                Ok(()) => Err(format!(
                    "import validation failed and the previous database was restored: {error}"
                )),
                Err(restore_error) => Err(format!(
                    "import validation failed ({error}); recovery restore also failed ({restore_error})"
                )),
            };
        }

        Ok(recovery_backup)
    }

    #[cfg(test)]
    fn db_path(&self) -> &Path {
        &self.db_path
    }

    #[cfg(test)]
    fn backup_dir(&self) -> &Path {
        &self.backup_dir
    }
}

fn require_nonempty(label: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{label} must not be empty"));
    }
    Ok(())
}

fn validate_reference_input(input: &ReferenceLibraryUpsertInput) -> Result<(), String> {
    for (label, value) in [
        ("source_platform", input.source_platform.as_str()),
        ("source_id", input.source_id.as_str()),
        ("native_id", input.native_id.as_str()),
        ("canonical_url", input.canonical_url.as_str()),
        ("label", input.label.as_str()),
        ("analysis_cache_key", input.analysis_cache_key.as_str()),
        ("analysis_provenance", input.analysis_provenance.as_str()),
        ("schema_version", input.schema_version.as_str()),
    ] {
        require_nonempty(label, value)?;
    }
    if input.analysis.is_null() {
        return Err("analysis must not be null".to_string());
    }
    Ok(())
}

fn upsert_reference_row(
    connection: &Connection,
    input: &ReferenceLibraryUpsertInput,
    local_wins: bool,
) -> Result<usize, String> {
    let first_saved_at = input
        .first_saved_at
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let updated_at = input
        .updated_at
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let encoded = serde_json::to_string(&input.analysis).map_err(error_string)?;

    if local_wins {
        return connection
            .execute(
                "INSERT INTO reference_library_entries (workspace_id, source_platform, source_id, native_id, canonical_url, label, analysis_json, analysis_cache_key, analysis_provenance, schema_version, revision, first_saved_at, updated_at)\n                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, COALESCE(?11, strftime('%Y-%m-%dT%H:%M:%fZ','now')), COALESCE(?12, strftime('%Y-%m-%dT%H:%M:%fZ','now')))\n                 ON CONFLICT(workspace_id, source_platform, source_id) DO NOTHING",
                params![
                    LOCAL_WORKSPACE_ID,
                    input.source_platform,
                    input.source_id,
                    input.native_id,
                    input.canonical_url,
                    input.label,
                    encoded,
                    input.analysis_cache_key,
                    input.analysis_provenance,
                    input.schema_version,
                    first_saved_at,
                    updated_at
                ],
            )
            .map_err(error_string);
    }

    connection
        .execute(
            "INSERT INTO reference_library_entries (workspace_id, source_platform, source_id, native_id, canonical_url, label, analysis_json, analysis_cache_key, analysis_provenance, schema_version, revision, first_saved_at, updated_at)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, COALESCE(?11, strftime('%Y-%m-%dT%H:%M:%fZ','now')), COALESCE(?12, strftime('%Y-%m-%dT%H:%M:%fZ','now')))\n             ON CONFLICT(workspace_id, source_platform, source_id) DO UPDATE SET\n               native_id = excluded.native_id,\n               canonical_url = excluded.canonical_url,\n               label = excluded.label,\n               analysis_json = excluded.analysis_json,\n               analysis_cache_key = excluded.analysis_cache_key,\n               analysis_provenance = excluded.analysis_provenance,\n               schema_version = excluded.schema_version,\n               revision = reference_library_entries.revision + 1,\n               updated_at = excluded.updated_at",
            params![
                LOCAL_WORKSPACE_ID,
                input.source_platform,
                input.source_id,
                input.native_id,
                input.canonical_url,
                input.label,
                encoded,
                input.analysis_cache_key,
                input.analysis_provenance,
                input.schema_version,
                first_saved_at,
                updated_at
            ],
        )
        .map_err(error_string)
}

#[tauri::command]
pub fn desktop_local_persistence_status(
    state: State<'_, LocalPersistence>,
) -> Result<LocalPersistenceStatus, String> {
    state.status()
}

#[tauri::command]
pub fn desktop_local_workspace_id() -> &'static str {
    LOCAL_WORKSPACE_ID
}

#[tauri::command]
pub fn desktop_local_reference_library_list(
    state: State<'_, LocalPersistence>,
) -> Result<Vec<ReferenceLibrarySummary>, String> {
    state.list_reference_library()
}

#[tauri::command]
pub fn desktop_local_reference_detail(
    state: State<'_, LocalPersistence>,
    source_id: String,
) -> Result<ReferenceLibraryDetail, String> {
    state.fetch_reference_detail(&source_id)
}

#[tauri::command]
pub fn desktop_local_reference_delete(
    state: State<'_, LocalPersistence>,
    source_id: String,
) -> Result<usize, String> {
    state.delete_reference_library(&source_id)
}

#[tauri::command]
pub fn desktop_local_reference_upsert(
    state: State<'_, LocalPersistence>,
    input: ReferenceLibraryUpsertInput,
) -> Result<(), String> {
    state.upsert_reference_library(&input)
}

#[tauri::command]
pub fn desktop_local_analysis_save(
    state: State<'_, LocalPersistence>,
    input: AnalysisResultInput,
) -> Result<(), String> {
    state.save_analysis_result(&input)
}

#[tauri::command]
pub fn desktop_local_comparison_save(
    state: State<'_, LocalPersistence>,
    input: ComparisonEntryInput,
) -> Result<(), String> {
    state.save_comparison_entry(&input)
}

#[tauri::command]
pub fn desktop_local_guidance_save(
    state: State<'_, LocalPersistence>,
    input: ProductionGuidanceInput,
) -> Result<(), String> {
    state.save_production_guidance(&input)
}

#[tauri::command]
pub fn desktop_local_export_database(
    state: State<'_, LocalPersistence>,
    destination: String,
) -> Result<(), String> {
    state.export_to(destination)
}

#[tauri::command]
pub fn desktop_local_import_database(
    state: State<'_, LocalPersistence>,
    source: String,
) -> Result<String, String> {
    state
        .import_from(source)
        .map(|path| path.to_string_lossy().into_owned())
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(error_string)?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(error_string)?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(error_string)?;
    Ok(connection)
}

fn configure_runtime(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;\n             PRAGMA journal_mode = WAL;\n             PRAGMA synchronous = NORMAL;",
        )
        .map_err(error_string)?;
    Ok(())
}

fn read_schema_version(connection: &Connection) -> Result<i64, String> {
    let has_meta = connection
        .query_row(
            "SELECT EXISTS(\n               SELECT 1 FROM sqlite_master\n               WHERE type = 'table' AND name = 'masterv_schema_meta'\n             )",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(error_string)?
        != 0;

    if !has_meta {
        return Ok(0);
    }

    connection
        .query_row(
            "SELECT schema_version FROM masterv_schema_meta WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map(|value| value.unwrap_or(0))
        .map_err(error_string)
}

fn migrate(connection: &mut Connection, from_version: i64) -> Result<(), String> {
    if from_version < 0 || from_version > CURRENT_SCHEMA_VERSION {
        return Err(format!("unsupported migration source version {from_version}"));
    }

    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(error_string)?;

    if from_version < 1 {
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS masterv_schema_meta (\n                   id INTEGER PRIMARY KEY CHECK (id = 1),\n                   schema_version INTEGER NOT NULL CHECK (schema_version >= 0),\n                   updated_at TEXT NOT NULL\n                 );\n\n                 CREATE TABLE IF NOT EXISTS reference_library_entries (\n                   workspace_id TEXT NOT NULL,\n                   source_platform TEXT NOT NULL,\n                   source_id TEXT NOT NULL,\n                   native_id TEXT NOT NULL,\n                   canonical_url TEXT NOT NULL,\n                   label TEXT NOT NULL,\n                   analysis_json TEXT NOT NULL,\n                   analysis_cache_key TEXT NOT NULL,\n                   analysis_provenance TEXT NOT NULL,\n                   schema_version TEXT NOT NULL,\n                   revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n                   first_saved_at TEXT NOT NULL,\n                   updated_at TEXT NOT NULL,\n                   PRIMARY KEY (workspace_id, source_platform, source_id)\n                 );\n\n                 CREATE TABLE IF NOT EXISTS analysis_results (\n                   id TEXT PRIMARY KEY,\n                   source_platform TEXT NOT NULL,\n                   source_id TEXT NOT NULL,\n                   analysis_json TEXT NOT NULL,\n                   analysis_cache_key TEXT,\n                   schema_version TEXT NOT NULL,\n                   created_at TEXT NOT NULL,\n                   updated_at TEXT NOT NULL\n                 );\n\n                 CREATE INDEX IF NOT EXISTS analysis_results_source_idx\n                   ON analysis_results (source_platform, source_id);\n\n                 CREATE TABLE IF NOT EXISTS comparison_entries (\n                   id TEXT PRIMARY KEY,\n                   payload_json TEXT NOT NULL,\n                   schema_version TEXT NOT NULL,\n                   created_at TEXT NOT NULL,\n                   updated_at TEXT NOT NULL\n                 );\n\n                 CREATE TABLE IF NOT EXISTS production_guidance (\n                   id TEXT PRIMARY KEY,\n                   source_platform TEXT NOT NULL,\n                   source_id TEXT NOT NULL,\n                   guidance_json TEXT NOT NULL,\n                   schema_version TEXT NOT NULL,\n                   created_at TEXT NOT NULL,\n                   updated_at TEXT NOT NULL\n                 );\n\n                 CREATE INDEX IF NOT EXISTS production_guidance_source_idx\n                   ON production_guidance (source_platform, source_id);\n\n                 CREATE TABLE IF NOT EXISTS settings (\n                   key TEXT PRIMARY KEY,\n                   value_json TEXT NOT NULL,\n                   updated_at TEXT NOT NULL\n                 );",
            )
            .map_err(error_string)?;
    }

    if from_version < 2 {
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS migration_runs (\n                   id TEXT PRIMARY KEY,\n                   source TEXT NOT NULL,\n                   status TEXT NOT NULL,\n                   imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),\n                   backup_path TEXT NOT NULL,\n                   completed_at TEXT NOT NULL\n                 );\n\n                 CREATE INDEX IF NOT EXISTS reference_library_local_source_idx\n                   ON reference_library_entries (workspace_id, source_id);",
            )
            .map_err(error_string)?;
    }

    transaction
        .execute(
            "INSERT INTO masterv_schema_meta (id, schema_version, updated_at)\n             VALUES (1, ?1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n             ON CONFLICT(id) DO UPDATE SET\n               schema_version = excluded.schema_version,\n               updated_at = excluded.updated_at",
            [CURRENT_SCHEMA_VERSION],
        )
        .map_err(error_string)?;
    transaction.commit().map_err(error_string)?;
    Ok(())
}

fn validate_current_database(connection: &Connection) -> Result<(), String> {
    validate_integrity(connection)?;
    let schema_version = read_schema_version(connection)?;
    if schema_version != CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "expected local schema {CURRENT_SCHEMA_VERSION}, found {schema_version}"
        ));
    }

    for table in [
        "masterv_schema_meta",
        "reference_library_entries",
        "analysis_results",
        "comparison_entries",
        "production_guidance",
        "settings",
        "migration_runs",
    ] {
        if !table_exists(connection, table)? {
            return Err(format!("required local table is missing: {table}"));
        }
    }
    Ok(())
}

fn validate_external_database(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!("database file does not exist: {}", path.display()));
    }
    let connection = open_connection(path)?;
    validate_current_database(&connection)
}

fn validate_integrity(connection: &Connection) -> Result<(), String> {
    let result = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(error_string)?;
    if result != "ok" {
        return Err(format!("SQLite integrity_check failed: {result}"));
    }
    Ok(())
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(\n               SELECT 1 FROM sqlite_master\n               WHERE type = 'table' AND name = ?1\n             )",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .map_err(error_string)
}

fn create_snapshot(
    connection: &Connection,
    backup_dir: &Path,
    reason: &str,
) -> Result<PathBuf, String> {
    fs::create_dir_all(backup_dir).map_err(error_string)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error_string)?
        .as_nanos();
    let path = backup_dir.join(format!("masterv-{reason}-{timestamp}.db"));
    connection
        .backup(DatabaseName::Main, &path, None)
        .map_err(error_string)?;
    Ok(path)
}

fn error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "masterv-local-persistence-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn cleanup(path: &Path) {
        let _ = fs::remove_dir_all(path);
    }

    fn reference(source_id: &str, label: &str) -> ReferenceLibraryUpsertInput {
        ReferenceLibraryUpsertInput {
            source_platform: "youtube".to_string(),
            source_id: source_id.to_string(),
            native_id: source_id.to_string(),
            canonical_url: format!("https://www.youtube.com/watch?v={source_id}"),
            label: label.to_string(),
            analysis: json!({"summary": label, "structure_label": "demo"}),
            analysis_cache_key: format!("cache:{source_id}"),
            analysis_provenance: "gateway-deep-analysis".to_string(),
            schema_version: "video-analysis-v1".to_string(),
            first_saved_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn local_persistence_initializes_schema_v2_as_product_authority() {
        let root = test_directory("schema");
        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        let status = persistence.status().expect("status");
        assert_eq!(status.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(status.product_authority_active);
        assert!(status.local_sqlite_authority_active);
        assert!(!status.remote_fallback_available);
        assert_eq!(status.workspace_id, LOCAL_WORKSPACE_ID);

        let connection = open_connection(persistence.db_path()).expect("open");
        for table in [
            "masterv_schema_meta",
            "reference_library_entries",
            "analysis_results",
            "comparison_entries",
            "production_guidance",
            "settings",
            "migration_runs",
        ] {
            assert!(table_exists(&connection, table).expect("table check"));
        }
        cleanup(&root);
    }

    #[test]
    fn settings_survive_reopen() {
        let root = test_directory("reopen");
        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        persistence
            .put_setting("ui.theme", &json!({"mode": "dark"}))
            .expect("write setting");
        drop(persistence);

        let reopened = LocalPersistence::initialize(&root).expect("reopen");
        assert_eq!(
            reopened.get_setting("ui.theme").expect("read setting"),
            Some(json!({"mode": "dark"}))
        );
        cleanup(&root);
    }

    #[test]
    fn existing_v1_database_is_backed_up_before_v2_migration() {
        let root = test_directory("migration-backup");
        fs::create_dir_all(&root).expect("root");
        let legacy_path = root.join(DATABASE_FILE);
        let mut legacy = Connection::open(&legacy_path).expect("legacy open");
        migrate(&mut legacy, 0).expect("seed schema");
        legacy
            .execute(
                "UPDATE masterv_schema_meta SET schema_version = 1 WHERE id = 1",
                [],
            )
            .expect("downgrade marker");
        legacy
            .execute_batch("DROP TABLE migration_runs; DROP INDEX reference_library_local_source_idx;")
            .expect("remove v2 objects");
        drop(legacy);

        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        let backups: Vec<PathBuf> = fs::read_dir(persistence.backup_dir())
            .expect("backup dir")
            .map(|entry| entry.expect("entry").path())
            .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("db"))
            .collect();
        assert_eq!(backups.len(), 1);
        let backup = Connection::open(&backups[0]).expect("backup open");
        assert_eq!(read_schema_version(&backup).expect("backup schema"), 1);
        cleanup(&root);
    }

    #[test]
    fn reference_library_is_local_primary_with_lazy_detail() {
        let root = test_directory("reference");
        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        persistence
            .upsert_reference_library(&reference("abc", "first"))
            .expect("insert");
        let summaries = persistence.list_reference_library().expect("list");
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].source_id, "abc");
        let detail = persistence.fetch_reference_detail("abc").expect("detail");
        assert_eq!(detail.analysis["summary"], json!("first"));

        persistence
            .upsert_reference_library(&reference("abc", "updated"))
            .expect("update");
        let detail = persistence.fetch_reference_detail("abc").expect("updated detail");
        assert_eq!(detail.revision, 2);
        assert_eq!(detail.analysis["summary"], json!("updated"));
        assert_eq!(persistence.delete_reference_library("abc").expect("delete"), 1);
        assert!(persistence.list_reference_library().expect("empty").is_empty());
        cleanup(&root);
    }

    #[test]
    fn analysis_comparison_and_guidance_survive_reopen() {
        let root = test_directory("work-data");
        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        persistence
            .save_analysis_result(&AnalysisResultInput {
                id: "analysis-1".to_string(),
                source_platform: "youtube".to_string(),
                source_id: "abc".to_string(),
                analysis: json!({"summary": "persisted"}),
                analysis_cache_key: Some("cache".to_string()),
                schema_version: "v1".to_string(),
            })
            .expect("analysis");
        persistence
            .save_comparison_entry(&ComparisonEntryInput {
                id: "comparison-1".to_string(),
                payload: json!({"sample_size": 2}),
                schema_version: "v1".to_string(),
            })
            .expect("comparison");
        persistence
            .save_production_guidance(&ProductionGuidanceInput {
                id: "guidance-1".to_string(),
                source_platform: "youtube".to_string(),
                source_id: "abc".to_string(),
                guidance: json!({"guide": "persisted"}),
                schema_version: "v1".to_string(),
            })
            .expect("guidance");
        drop(persistence);

        let reopened = LocalPersistence::initialize(&root).expect("reopen");
        let connection = open_connection(reopened.db_path()).expect("open");
        for (table, expected) in [
            ("analysis_results", 1i64),
            ("comparison_entries", 1i64),
            ("production_guidance", 1i64),
        ] {
            let count: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
                .expect("count");
            assert_eq!(count, expected);
        }
        cleanup(&root);
    }

    #[test]
    fn export_import_roundtrip_preserves_data_and_creates_recovery_backup() {
        let source_root = test_directory("export-source");
        let target_root = test_directory("import-target");
        let export_root = test_directory("export-file");
        let export_path = export_root.join("masterv-export.db");

        let source = LocalPersistence::initialize(&source_root).expect("source init");
        source
            .put_setting("roundtrip", &json!({"value": "source"}))
            .expect("source setting");
        source.export_to(&export_path).expect("export");

        let target = LocalPersistence::initialize(&target_root).expect("target init");
        target
            .put_setting("roundtrip", &json!({"value": "target-before-import"}))
            .expect("target setting");
        let recovery = target.import_from(&export_path).expect("import");

        assert!(recovery.is_file());
        assert_eq!(
            target.get_setting("roundtrip").expect("imported setting"),
            Some(json!({"value": "source"}))
        );

        let recovery_db = Connection::open(&recovery).expect("recovery open");
        let previous: String = recovery_db
            .query_row(
                "SELECT value_json FROM settings WHERE key = 'roundtrip'",
                [],
                |row| row.get(0),
            )
            .expect("recovery setting");
        assert_eq!(
            serde_json::from_str::<Value>(&previous).expect("json"),
            json!({"value": "target-before-import"})
        );

        cleanup(&source_root);
        cleanup(&target_root);
        cleanup(&export_root);
    }

    #[test]
    fn import_rejects_newer_schema_without_touching_live_data() {
        let root = test_directory("newer-target");
        let source_root = test_directory("newer-source");
        fs::create_dir_all(&source_root).expect("source root");

        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        persistence
            .put_setting("guard", &json!("live"))
            .expect("guard setting");

        let newer_path = source_root.join("newer.db");
        let newer = Connection::open(&newer_path).expect("newer open");
        newer
            .execute_batch(
                "CREATE TABLE masterv_schema_meta (\n                   id INTEGER PRIMARY KEY,\n                   schema_version INTEGER NOT NULL,\n                   updated_at TEXT NOT NULL\n                 );\n                 INSERT INTO masterv_schema_meta VALUES (1, 3, 'future');",
            )
            .expect("newer schema");
        drop(newer);

        assert!(persistence.import_from(&newer_path).is_err());
        assert_eq!(
            persistence.get_setting("guard").expect("guard read"),
            Some(json!("live"))
        );

        cleanup(&root);
        cleanup(&source_root);
    }
}
