use rusqlite::{Connection, DatabaseName};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DATABASE_FILE: &str = "masterv.db";
const BACKUP_DIRECTORY: &str = "backups";
const AUTO_BACKUP_PREFIX: &str = "masterv-automatic-";
const AUTO_BACKUP_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const AUTO_BACKUP_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const AUTO_BACKUP_RETENTION: usize = 7;

pub fn ensure_automatic_backup<P: AsRef<Path>>(app_data_dir: P) -> Result<Option<PathBuf>, String> {
    ensure_automatic_backup_at(app_data_dir.as_ref(), SystemTime::now())
}

pub fn start_automatic_backup_loop(app_data_dir: PathBuf) -> Result<(), String> {
    thread::Builder::new()
        .name("masterv-automatic-backup".to_string())
        .spawn(move || loop {
            if let Err(error) = ensure_automatic_backup(&app_data_dir) {
                eprintln!("MasterV automatic backup check failed: {error}");
            }
            thread::sleep(AUTO_BACKUP_CHECK_INTERVAL);
        })
        .map(|_| ())
        .map_err(error_string)
}

fn ensure_automatic_backup_at(
    app_data_dir: &Path,
    now: SystemTime,
) -> Result<Option<PathBuf>, String> {
    let db_path = app_data_dir.join(DATABASE_FILE);
    if !db_path.exists() || fs::metadata(&db_path).map_err(error_string)?.len() == 0 {
        return Ok(None);
    }

    let connection = Connection::open(&db_path).map_err(error_string)?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(error_string)?;
    validate_database(&connection)?;

    if !has_user_work_data(&connection)? {
        return Ok(None);
    }

    let backup_dir = app_data_dir.join(BACKUP_DIRECTORY);
    fs::create_dir_all(&backup_dir).map_err(error_string)?;
    if !automatic_backup_due_at(&backup_dir, now)? {
        return Ok(None);
    }

    let timestamp = unix_timestamp_nanos(now)?;
    let destination = backup_dir.join(format!("{AUTO_BACKUP_PREFIX}{timestamp}.db"));
    connection
        .backup(DatabaseName::Main, &destination, None)
        .map_err(error_string)?;

    let validation = Connection::open(&destination)
        .map_err(error_string)
        .and_then(|backup| validate_database(&backup));
    if let Err(error) = validation {
        let _ = fs::remove_file(&destination);
        return Err(error);
    }

    prune_automatic_backups(&backup_dir)?;
    Ok(Some(destination))
}

fn automatic_backup_due_at(backup_dir: &Path, now: SystemTime) -> Result<bool, String> {
    let newest = automatic_backups(backup_dir)?
        .iter()
        .filter_map(|path| automatic_backup_timestamp(path))
        .max();
    let now = unix_timestamp_nanos(now)?;
    Ok(match newest {
        None => true,
        Some(timestamp) => now.saturating_sub(timestamp) >= AUTO_BACKUP_INTERVAL.as_nanos(),
    })
}

fn automatic_backups(backup_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    fs::read_dir(backup_dir)
        .map_err(error_string)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| automatic_backup_timestamp(path).is_some())
        .collect::<Vec<_>>()
        .pipe(Ok)
}

fn automatic_backup_timestamp(path: &Path) -> Option<u128> {
    let name = path.file_name()?.to_str()?;
    let timestamp = name
        .strip_prefix(AUTO_BACKUP_PREFIX)?
        .strip_suffix(".db")?;
    timestamp.parse::<u128>().ok()
}

fn prune_automatic_backups(backup_dir: &Path) -> Result<(), String> {
    let mut backups = automatic_backups(backup_dir)?;
    backups.sort_by_key(|path| automatic_backup_timestamp(path).unwrap_or(0));
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

fn unix_timestamp_nanos(value: SystemTime) -> Result<u128, String> {
    value
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .map_err(error_string)
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

    fn seed_reference(persistence: &LocalPersistence, source_id: &str) {
        persistence
            .upsert_reference_library(&ReferenceLibraryUpsertInput {
                source_platform: "youtube".to_string(),
                source_id: source_id.to_string(),
                native_id: source_id.to_string(),
                canonical_url: format!("https://www.youtube.com/watch?v={source_id}"),
                label: format!("automatic backup fixture {source_id}"),
                analysis: json!({"summary":"automatic backup fixture"}),
                analysis_cache_key: format!("automatic-backup:{source_id}"),
                analysis_provenance: "test".to_string(),
                schema_version: "reference-library-v1".to_string(),
                first_saved_at: None,
                updated_at: None,
            })
            .unwrap();
    }

    #[test]
    fn no_work_data_does_not_create_automatic_backup() {
        let dir = temp_dir("auto-backup-empty");
        LocalPersistence::initialize(&dir).unwrap();

        assert!(ensure_automatic_backup_at(
            &dir,
            UNIX_EPOCH + Duration::from_secs(1_700_000_000)
        )
        .unwrap()
        .is_none());
        assert!(automatic_backups(&dir.join(BACKUP_DIRECTORY))
            .unwrap()
            .is_empty());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn work_data_creates_integrity_checked_backup_and_preserves_data() {
        let dir = temp_dir("auto-backup-create");
        let persistence = LocalPersistence::initialize(&dir).unwrap();
        seed_reference(&persistence, "auto-backup-fixture");

        let backup_path = ensure_automatic_backup_at(
            &dir,
            UNIX_EPOCH + Duration::from_secs(1_700_000_000),
        )
        .unwrap()
        .expect("automatic backup missing");
        assert!(backup_path.exists());

        let backup = Connection::open(&backup_path).unwrap();
        let integrity: String = backup
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
        let count: i64 = backup
            .query_row(
                "SELECT COUNT(*) FROM reference_library_entries WHERE source_id = 'auto-backup-fixture'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn recent_automatic_backup_is_not_due() {
        let dir = temp_dir("auto-backup-recent");
        let persistence = LocalPersistence::initialize(&dir).unwrap();
        seed_reference(&persistence, "recent-fixture");
        let first = UNIX_EPOCH + Duration::from_secs(1_700_000_000);

        assert!(ensure_automatic_backup_at(&dir, first).unwrap().is_some());
        assert!(ensure_automatic_backup_at(
            &dir,
            first + Duration::from_secs(24 * 60 * 60 - 1)
        )
        .unwrap()
        .is_none());
        assert_eq!(
            automatic_backups(&dir.join(BACKUP_DIRECTORY)).unwrap().len(),
            1
        );

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn automatic_backup_retention_keeps_only_latest_seven() {
        let dir = temp_dir("auto-backup-retention");
        let persistence = LocalPersistence::initialize(&dir).unwrap();
        seed_reference(&persistence, "retention-fixture");
        let base = UNIX_EPOCH + Duration::from_secs(1_700_000_000);

        for index in 0..(AUTO_BACKUP_RETENTION + 2) {
            let now = base + Duration::from_secs(index as u64 * (24 * 60 * 60 + 1));
            assert!(ensure_automatic_backup_at(&dir, now).unwrap().is_some());
        }

        let backups = automatic_backups(&dir.join(BACKUP_DIRECTORY)).unwrap();
        assert_eq!(backups.len(), AUTO_BACKUP_RETENTION);
        let timestamps = backups
            .iter()
            .filter_map(|path| automatic_backup_timestamp(path))
            .collect::<Vec<_>>();
        let oldest_expected = unix_timestamp_nanos(
            base + Duration::from_secs(2 * (24 * 60 * 60 + 1)),
        )
        .unwrap();
        assert!(timestamps.iter().all(|timestamp| *timestamp >= oldest_expected));

        fs::remove_dir_all(dir).unwrap();
    }
}
