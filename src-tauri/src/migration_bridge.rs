use crate::local_persistence::{
    LegacyReferenceMigrationResult, LocalPersistence, ReferenceLibraryUpsertInput,
};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct VerifiedLegacyReferenceMigrationResult {
    pub migration_id: &'static str,
    pub already_completed: bool,
    pub received_count: usize,
    pub imported_count: usize,
    pub backup_path: String,
    pub integrity_verified: bool,
    pub schema_version: i64,
    pub local_authority_active: bool,
}

impl VerifiedLegacyReferenceMigrationResult {
    fn from_verified(
        result: LegacyReferenceMigrationResult,
        schema_version: i64,
        local_authority_active: bool,
    ) -> Self {
        Self {
            migration_id: result.migration_id,
            already_completed: result.already_completed,
            received_count: result.received_count,
            imported_count: result.imported_count,
            backup_path: result.backup_path,
            integrity_verified: true,
            schema_version,
            local_authority_active,
        }
    }
}

#[tauri::command]
pub fn desktop_migrate_legacy_reference_library_verified(
    state: State<'_, LocalPersistence>,
    records: Vec<ReferenceLibraryUpsertInput>,
) -> Result<VerifiedLegacyReferenceMigrationResult, String> {
    let result = state.migrate_legacy_reference_library(&records)?;
    let status = state.status()?;
    if !status.product_authority_active || status.supabase_primary_authority_active {
        return Err("post-import authority verification failed".to_string());
    }
    Ok(VerifiedLegacyReferenceMigrationResult::from_verified(
        result,
        status.schema_version,
        status.product_authority_active,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verified_result_contract_requires_integrity_flag() {
        let result = LegacyReferenceMigrationResult {
            migration_id: "supabase-reference-library-v1",
            already_completed: false,
            received_count: 2,
            imported_count: 2,
            backup_path: "backup.db".to_string(),
        };
        let verified = VerifiedLegacyReferenceMigrationResult::from_verified(result, 2, true);
        assert!(verified.integrity_verified);
        assert!(verified.local_authority_active);
        assert_eq!(verified.schema_version, 2);
    }
}
