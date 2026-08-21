#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod automatic_backup;
mod device_secure_store;
mod gateway_transport;
mod local_persistence;

#[cfg(feature = "independent-updater")]
mod updater;

use std::io;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(feature = "independent-updater")]
    let builder = builder
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(updater::UPDATE_PUBLIC_KEY)
                .target(updater::UPDATE_TARGET)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            local_persistence::desktop_local_persistence_status,
            local_persistence::desktop_local_workspace_id,
            local_persistence::desktop_local_reference_library_list,
            local_persistence::desktop_local_reference_detail,
            local_persistence::desktop_local_reference_delete,
            local_persistence::desktop_local_reference_upsert,
            local_persistence::desktop_local_analysis_save,
            local_persistence::desktop_local_comparison_save,
            local_persistence::desktop_local_guidance_save,
            local_persistence::desktop_local_export_database,
            local_persistence::desktop_local_import_database,
            device_secure_store::desktop_device_secure_store_status,
            device_secure_store::desktop_device_identity_save,
            device_secure_store::desktop_device_identity_load,
            device_secure_store::desktop_device_identity_clear,
            gateway_transport::desktop_gateway_status,
            gateway_transport::desktop_gateway_activate,
            gateway_transport::desktop_gateway_resume_session,
            gateway_transport::desktop_gateway_entitlement,
            gateway_transport::desktop_gateway_discover,
            gateway_transport::desktop_gateway_analyze,
            gateway_transport::desktop_gateway_guidance,
            updater::desktop_update_check,
            updater::desktop_update_install
        ]);

    #[cfg(not(feature = "independent-updater"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        local_persistence::desktop_local_persistence_status,
        local_persistence::desktop_local_workspace_id,
        local_persistence::desktop_local_reference_library_list,
        local_persistence::desktop_local_reference_detail,
        local_persistence::desktop_local_reference_delete,
        local_persistence::desktop_local_reference_upsert,
        local_persistence::desktop_local_analysis_save,
        local_persistence::desktop_local_comparison_save,
        local_persistence::desktop_local_guidance_save,
        local_persistence::desktop_local_export_database,
        local_persistence::desktop_local_import_database,
        device_secure_store::desktop_device_secure_store_status,
        device_secure_store::desktop_device_identity_save,
        device_secure_store::desktop_device_identity_load,
        device_secure_store::desktop_device_identity_clear,
        gateway_transport::desktop_gateway_status,
        gateway_transport::desktop_gateway_activate,
        gateway_transport::desktop_gateway_resume_session,
        gateway_transport::desktop_gateway_entitlement,
        gateway_transport::desktop_gateway_discover,
        gateway_transport::desktop_gateway_analyze,
        gateway_transport::desktop_gateway_guidance
    ]);

    builder
        .setup(|app| {
            let app_local_data_dir = app.path().app_local_data_dir()?;
            let persistence = local_persistence::LocalPersistence::initialize(&app_local_data_dir)
                .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
            let secure_store = device_secure_store::DeviceSecureStore::initialize(&app_local_data_dir)
                .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
            let gateway = gateway_transport::GatewayTransport::initialize()
                .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

            if let Err(error) = automatic_backup::start_automatic_backup_loop(app_local_data_dir.clone()) {
                eprintln!("MasterV automatic backup worker failed to start: {error}");
            }

            app.manage(persistence);
            app.manage(secure_store);
            app.manage(gateway);

            let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("MasterV")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 620.0)
                .resizable(true)
                .fullscreen(false)
                .use_https_scheme(true);

            #[cfg(target_os = "windows")]
            {
                if let Ok(port) = std::env::var("MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT") {
                    let port: u16 = port.parse().map_err(|_| "invalid MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT")?;
                    if port == 0 { return Err("MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT must be non-zero".into()); }
                    let data_dir = std::env::var("MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR")
                        .map_err(|_| "MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR is required with the test debug port")?;
                    let browser_args = format!("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port}");
                    window = window.additional_browser_args(&browser_args).data_directory(data_dir.into());
                }
            }

            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run MasterV desktop shell");
}
