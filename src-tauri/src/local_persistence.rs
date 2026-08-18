use rusqlite::backup::Progress;
use rusqlite::{params, Connection, DatabaseName, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

pub const CURRENT_SCHEMA_VERSION: i64 = 1;
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
    pub product_authority_active: bool,
    pub supabase_authority_unchanged: bool,
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
            product_authority_active: false,
            supabase_authority_unchanged: true,
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

#[tauri::command]
pub fn desktop_local_persistence_status(
    state: State<'_, LocalPersistence>,
) -> Result<LocalPersistenceStatus, String> {
    state.status()
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

    #[test]
    fn local_persistence_initializes_schema_v1() {
        let root = test_directory("schema");
        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        let status = persistence.status().expect("status");
        assert_eq!(status.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(!status.product_authority_active);
        assert!(status.supabase_authority_unchanged);

        let connection = open_connection(persistence.db_path()).expect("open");
        for table in [
            "masterv_schema_meta",
            "reference_library_entries",
            "analysis_results",
            "comparison_entries",
            "production_guidance",
            "settings",
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
    fn existing_v0_database_is_backed_up_before_migration() {
        let root = test_directory("migration-backup");
        fs::create_dir_all(&root).expect("root");
        let legacy_path = root.join(DATABASE_FILE);
        let legacy = Connection::open(&legacy_path).expect("legacy open");
        legacy
            .execute_batch(
                "CREATE TABLE legacy_marker (value TEXT NOT NULL);\n                 INSERT INTO legacy_marker (value) VALUES ('before-migration');",
            )
            .expect("legacy seed");
        drop(legacy);

        let persistence = LocalPersistence::initialize(&root).expect("initialize");
        let backups: Vec<PathBuf> = fs::read_dir(persistence.backup_dir())
            .expect("backup dir")
            .map(|entry| entry.expect("entry").path())
            .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("db"))
            .collect();
        assert_eq!(backups.len(), 1);

        let backup = Connection::open(&backups[0]).expect("backup open");
        let marker: String = backup
            .query_row("SELECT value FROM legacy_marker", [], |row| row.get(0))
            .expect("legacy marker");
        assert_eq!(marker, "before-migration");
        assert_eq!(read_schema_version(&backup).expect("backup schema"), 0);
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
                "CREATE TABLE masterv_schema_meta (\n                   id INTEGER PRIMARY KEY,\n                   schema_version INTEGER NOT NULL,\n                   updated_at TEXT NOT NULL\n                 );\n                 INSERT INTO masterv_schema_meta VALUES (1, 2, 'future');",
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
