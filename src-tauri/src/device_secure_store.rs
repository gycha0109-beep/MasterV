use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

const DEVICE_IDENTITY_FILE: &str = "device-identity.dpapi";

#[derive(Clone, Debug)]
pub struct DeviceSecureStore {
    path: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct DeviceIdentityRecord {
    pub install_id: String,
    pub device_credential: String,
    pub device_credential_expires_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeviceSecureStoreStatus {
    pub available: bool,
    pub backend: &'static str,
    pub record_present: bool,
    pub product_key_stored: bool,
    pub session_credential_stored: bool,
}

impl DeviceSecureStore {
    pub fn initialize<P: AsRef<Path>>(app_data_dir: P) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir.as_ref()).map_err(error_string)?;
        Ok(Self {
            path: app_data_dir.as_ref().join(DEVICE_IDENTITY_FILE),
        })
    }

    pub fn status(&self) -> DeviceSecureStoreStatus {
        DeviceSecureStoreStatus {
            available: cfg!(target_os = "windows"),
            backend: if cfg!(target_os = "windows") {
                "windows-dpapi"
            } else {
                "unsupported"
            },
            record_present: self.path.is_file(),
            product_key_stored: false,
            session_credential_stored: false,
        }
    }

    pub fn save(&self, record: &DeviceIdentityRecord) -> Result<(), String> {
        validate_record(record)?;
        let encoded = serde_json::to_vec(record).map_err(error_string)?;
        let protected = platform::protect(&encoded)?;
        let temporary = self.path.with_extension("dpapi.tmp");
        fs::write(&temporary, protected).map_err(error_string)?;
        if self.path.exists() {
            fs::remove_file(&self.path).map_err(error_string)?;
        }
        fs::rename(&temporary, &self.path).map_err(error_string)?;
        Ok(())
    }

    pub fn load(&self) -> Result<Option<DeviceIdentityRecord>, String> {
        if !self.path.is_file() {
            return Ok(None);
        }
        let protected = fs::read(&self.path).map_err(error_string)?;
        let plaintext = platform::unprotect(&protected)?;
        let record: DeviceIdentityRecord = serde_json::from_slice(&plaintext).map_err(error_string)?;
        validate_record(&record)?;
        Ok(Some(record))
    }

    pub fn clear(&self) -> Result<(), String> {
        if self.path.exists() {
            fs::remove_file(&self.path).map_err(error_string)?;
        }
        Ok(())
    }

    #[cfg(test)]
    fn path(&self) -> &Path {
        &self.path
    }
}

fn validate_record(record: &DeviceIdentityRecord) -> Result<(), String> {
    if record.install_id.trim().is_empty() {
        return Err("install_id must not be empty".to_string());
    }
    if record.device_credential.trim().is_empty() {
        return Err("device_credential must not be empty".to_string());
    }
    if record.device_credential_expires_at.trim().is_empty() {
        return Err("device_credential_expires_at must not be empty".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_device_secure_store_status(
    state: State<'_, DeviceSecureStore>,
) -> DeviceSecureStoreStatus {
    state.status()
}

#[tauri::command]
pub fn desktop_device_identity_save(
    state: State<'_, DeviceSecureStore>,
    record: DeviceIdentityRecord,
) -> Result<(), String> {
    state.save(&record)
}

#[tauri::command]
pub fn desktop_device_identity_load(
    state: State<'_, DeviceSecureStore>,
) -> Result<Option<DeviceIdentityRecord>, String> {
    state.load()
}

#[tauri::command]
pub fn desktop_device_identity_clear(
    state: State<'_, DeviceSecureStore>,
) -> Result<(), String> {
    state.clear()
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;
    use std::ptr::null_mut;

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "Crypt32")]
    extern "system" {
        fn CryptProtectData(
            data_in: *const DataBlob,
            data_description: *const u16,
            optional_entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            data_in: *const DataBlob,
            data_description: *mut *mut u16,
            optional_entropy: *const DataBlob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "Kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }

    fn transform(input: &[u8], unprotect: bool) -> Result<Vec<u8>, String> {
        if input.is_empty() {
            return Err("secure-store payload must not be empty".to_string());
        }
        let mut owned = input.to_vec();
        let input_blob = DataBlob {
            cb_data: u32::try_from(owned.len()).map_err(|_| "secure-store payload is too large")?,
            pb_data: owned.as_mut_ptr(),
        };
        let mut output_blob = DataBlob {
            cb_data: 0,
            pb_data: null_mut(),
        };
        let result = unsafe {
            if unprotect {
                CryptUnprotectData(
                    &input_blob,
                    null_mut(),
                    std::ptr::null(),
                    null_mut(),
                    null_mut(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output_blob,
                )
            } else {
                CryptProtectData(
                    &input_blob,
                    std::ptr::null(),
                    std::ptr::null(),
                    null_mut(),
                    null_mut(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output_blob,
                )
            }
        };
        if result == 0 {
            return Err(format!(
                "Windows DPAPI operation failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        if output_blob.pb_data.is_null() || output_blob.cb_data == 0 {
            if !output_blob.pb_data.is_null() {
                unsafe {
                    LocalFree(output_blob.pb_data.cast::<c_void>());
                }
            }
            return Err("Windows DPAPI returned an empty payload".to_string());
        }
        let output = unsafe {
            std::slice::from_raw_parts(output_blob.pb_data, output_blob.cb_data as usize).to_vec()
        };
        unsafe {
            LocalFree(output_blob.pb_data.cast::<c_void>());
        }
        Ok(output)
    }

    pub fn protect(input: &[u8]) -> Result<Vec<u8>, String> {
        transform(input, false)
    }

    pub fn unprotect(input: &[u8]) -> Result<Vec<u8>, String> {
        transform(input, true)
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn protect(_input: &[u8]) -> Result<Vec<u8>, String> {
        Err("device secure storage is only available on Windows".to_string())
    }

    pub fn unprotect(_input: &[u8]) -> Result<Vec<u8>, String> {
        Err("device secure storage is only available on Windows".to_string())
    }
}

fn error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "masterv-device-secure-store-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn status_never_claims_product_key_or_session_persistence() {
        let root = test_directory("status");
        let store = DeviceSecureStore::initialize(&root).expect("initialize");
        let status = store.status();
        assert!(!status.product_key_stored);
        assert!(!status.session_credential_stored);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_dpapi_roundtrip_and_clear() {
        let root = test_directory("roundtrip");
        let store = DeviceSecureStore::initialize(&root).expect("initialize");
        let record = DeviceIdentityRecord {
            install_id: "test-install-uuid".to_string(),
            device_credential: "device-credential-secret".to_string(),
            device_credential_expires_at: "2027-01-01T00:00:00Z".to_string(),
        };
        store.save(&record).expect("save");
        assert!(store.path().is_file());
        let raw = fs::read(store.path()).expect("raw");
        assert!(!String::from_utf8_lossy(&raw).contains("device-credential-secret"));
        assert_eq!(store.load().expect("load"), Some(record));
        store.clear().expect("clear");
        assert_eq!(store.load().expect("empty"), None);
        let _ = fs::remove_dir_all(root);
    }
}
