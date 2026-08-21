use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub(crate) const UPDATE_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQ3MkMzNDk0ODg2NDUxM0UKUldRK1VXU0lsRFFzMTZHQUFZc3Z3eUxpcnN5bnE2QzRkalVtZDJDTFE4cGFCRFo1ejVCdFQ4QzAK";
pub(crate) const UPDATE_TARGET: &str = "windows-x86_64";

async fn check(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let updater = app
        .updater_builder()
        .pubkey(UPDATE_PUBLIC_KEY)
        .target(UPDATE_TARGET)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("업데이터 초기화에 실패했습니다: {error}"))?;

    updater
        .check()
        .await
        .map_err(|error| format!("업데이트 확인에 실패했습니다: {error}"))
}

#[tauri::command]
pub(crate) async fn desktop_update_check(
    app: AppHandle,
) -> Result<Option<Vec<String>>, String> {
    let update = check(&app).await?;
    Ok(update.map(|release| vec![release.version, release.body.unwrap_or_default()]))
}

#[tauri::command]
pub(crate) async fn desktop_update_install(
    app: AppHandle,
) -> Result<String, String> {
    let update = check(&app)
        .await?
        .ok_or_else(|| "설치할 새 MasterV 버전이 없습니다.".to_string())?;
    let version = update.version.clone();
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("업데이트 다운로드 또는 설치에 실패했습니다: {error}"))?;
    Ok(version)
}
