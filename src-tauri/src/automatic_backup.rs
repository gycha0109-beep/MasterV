use rusqlite::{Connection, DatabaseName};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DATABASE_FILE: &str = "masterv.db";
const BACKUP_DIRECTORY: &str = "backups";
const AUTO_BACKUP_PREFIX: &str = "masterv-auto-";
const AUTO_BACKUP_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const AUTO_BACKUP_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const AUTO_BACKUP_RETENTION: usize = 7;

pub fn ensure_automatic_backup<P: AsRef<Path>>(app_data_dir: P) -> Result<Option<PathBuf>, String> {
    let app_data_dir = app_data_dir.as_ref();
    let db_path = app_data_dir.join(DATABASE_FILE);
    if !db_path.exists() || fs::metadata(&db_path).map_err(error_string)?.len() == 0 {
        return Ok(None);
    }

    let backup_dir = app_data_dir.join(BACKUP_DIRECTORY);
    fs::create_dir_all(&backup_dir).map_err(error_string)?;
    let connection = Connection::open(&db_path).map_err(error_string)?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(error_string)?;
    validate_database(&connection)?;

    if !has_user_work_data(&connection)? {
        return Ok(None);
    }
    if !automatic_backup_due(&backup_dir)? {
        return Ok(None);
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error_string)?
        .as_nanos();
    let destination = backup_dir.join(format!("{AUTO_BACKUP_PREFIX}{timestamp}.db"));
    connection
        .backup(DatabaseName::Main, &destination, None)
        .map_err(error_string)?;
    let backup = Connection::open(&destination).map_err(error_string)?;
    validate_database(&backup)?;
    drop(backup);
    prune_automatic_backups(&backup_dir)?;
    Ok(Some(destination))
}

pub fn start_automatic_backup_loop(app_data_dir: PathBuf) -> Result<(), String> {
    thread::Builder::new()
        .name("masterv-automatic-backup".to_string())
        .spawn(move || loop {
            thread::sleep(AUTO_BACKUP_CHECK_INTERVAL);
            if let Err(error) = ensure_automatic_backup(&app_data_dir) {
                eprintln!("MasterV automatic backup check failed: {error}");
            }
        })
        .map(|_| ())
        .map_err(error_string)
}

fn automatic_backup_due(backup_dir: &Path) -> Result<bool, String> {
    let newest = automatic_backups(backup_dir)?
        .into_iter()
        .filter_map(|path| fs::metadata(path).ok()?.modified().ok())
        .max();
    match newest {
        None => Ok(true),
        Some(modified) => Ok(SystemTime::now()
            .duration_since(modified)
            .unwrap_or(Duration::ZERO)
            >= AUTO_BACKUP_INTERVAL),
    }
}

fn automatic_backups(backup_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }
    fs::read_dir(backup_dir)
        .map_err(error_string)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with(AUTO_BACKUP_PREFIX) && name.ends_with(".db"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>()
        .pipe(Ok)
}

fn prune_automatic_backups(backup_dir: &Path) -> Result<(), String> {
    let mut backups = automatic_backups(backup_dir)?;
    backups.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH)
    });
    backups.reverse();
    for stale in backups.into_iter().skip(AUTO_BACKUP_RETENTION) {
        fs::remove_file(stale).map_err(error_string)?;
    }
    Ok(())
}

fn has_user_work_data(connection: &Connection) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM reference_library_entries LIMIT 1)\n                 OR EXISTS(SELECT 1 FROM analysis_results LIMIT 1)\n                 OR EXISTS(SELECT 1 FROM comparison_entries LIMIT 1)\n                 OR EXISTS(SELECT 1 FROM production_guidance LIMIT 1)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .map_err(error_string)
}

fn validate_database(connection: &Connection) -> Result<(), String> {
    let integrity = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(error_string)?;
    if integrity != "ok" {
        return Err(format!("SQLite integrity_check failed: {integrity}"));
    }
    Ok(())
}

fn error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}
impl<T> Pipe for T {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_persistence::{LocalPersistence, ReferenceLibraryUpsertInput};
    use serde_json::json;

    fn temp_dir(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("masterv-{label}-{}-{suffix}", std::process::id()))
    }

    #[test]
    fn automatic_backup_waits_for_user_data_then_respects_interval() {
        let dir = temp_dir("auto-backup");
        let persistence = LocalPersistence::initialize(&dir).unwrap();
        assert!(ensure_automatic_backup(&dir).unwrap().is_none());

        persistence
            .upsert_reference_library(&ReferenceLibraryUpsertInput {
                source_platform: "youtube".to_string(),
                source_id: "auto-backup-fixture".to_string(),
                native_id: "auto-backup-fixture".to_string(),
                canonical_url: "https://www.youtube.com/watch?v=auto-backup-fixture".to_string(),
                label: "automatic backup fixture".to_string(),
                analysis: json!({"summary":"automatic backup fixture"}),
                analysis_cache_key: "automatic-backup:test".to_string(),
                analysis_provenance: "test".to_string(),
                schema_version: "reference-library-v1".to_string(),
                first_saved_at: None,
                updated_at: None,
            })
            .unwrap();

        let backup_path = ensure_automatic_backup(&dir).unwrap().expect("automatic backup missing");
        assert!(backup_path.exists());
        let backup = Connection::open(&backup_path).unwrap();
        let count: i64 = backup
            .query_row("SELECT COUNT(*) FROM reference_library_entries WHERE source_id = 'auto-backup-fixture'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert!(ensure_automatic_backup(&dir).unwrap().is_none());
        assert_eq!(automatic_backups(&dir.join(BACKUP_DIRECTORY)).unwrap().len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
}
