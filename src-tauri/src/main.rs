#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod updater;

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(updater::UPDATE_PUBLIC_KEY)
                .target(updater::UPDATE_TARGET)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            updater::desktop_update_check,
            updater::desktop_update_install
        ])
        .setup(|app| {
            let mut window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("MasterV")
            .inner_size(1280.0, 820.0)
            .min_inner_size(900.0, 620.0)
            .resizable(true)
            .fullscreen(false)
            .use_https_scheme(true);

            #[cfg(target_os = "windows")]
            {
                if let Ok(port) = std::env::var("MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT") {
                    let port: u16 = port
                        .parse()
                        .map_err(|_| "invalid MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT")?;
                    if port == 0 {
                        return Err("MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT must be non-zero".into());
                    }

                    let data_dir = std::env::var("MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR")
                        .map_err(|_| "MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR is required with the test debug port")?;
                    let browser_args = format!(
                        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port}"
                    );

                    window = window
                        .additional_browser_args(&browser_args)
                        .data_directory(data_dir.into());
                }
            }

            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run MasterV desktop shell");
}
