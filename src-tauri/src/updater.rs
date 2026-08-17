use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const UPDATE_ENDPOINT: &str = "https://euqkjrmrhhvnyzasppnd.supabase.co/functions/v1/masterv-update-channel?current_version={{current_version}}&target={{target}}";
pub(crate) const UPDATE_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEEzQjFEMEM0NUE1QzEzMUYKUldRZkUxeGF4TkN4bzUrUDhCc3JQTWFGMmpmdlQ3L3o3MUFXSDEwckpzR0JxOUtvcUcvMGkxK1MK";
pub(crate) const UPDATE_TARGET: &str = "windows-x86_64";

fn validate_credentials(access_token: &str, apikey: &str) -> Result<(), String> {
    if access_token.trim().is_empty() {
        return Err("MasterV 로그인 세션이 필요합니다.".to_string());
    }
    if apikey.trim().is_empty() {
        return Err("MasterV publishable API key가 구성되지 않았습니다.".to_string());
    }
    Ok(())
}

async fn check(
    app: &AppHandle,
    access_token: String,
    apikey: String,
) -> Result<Option<tauri_plugin_updater::Update>, String> {
    validate_credentials(&access_token, &apikey)?;
    let endpoint = UPDATE_ENDPOINT
        .parse()
        .map_err(|error| format!("업데이트 endpoint가 올바르지 않습니다: {error}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| format!("업데이트 endpoint 설정에 실패했습니다: {error}"))?
        .pubkey(UPDATE_PUBLIC_KEY)
        .target(UPDATE_TARGET)
        .timeout(Duration::from_secs(30))
        .header("Authorization", format!("Bearer {}", access_token.trim()))
        .map_err(|error| format!("업데이트 인증 header 설정에 실패했습니다: {error}"))?
        .header("apikey", apikey.trim())
        .map_err(|error| format!("업데이트 API header 설정에 실패했습니다: {error}"))?
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
    access_token: String,
    apikey: String,
) -> Result<Option<Vec<String>>, String> {
    let update = check(&app, access_token, apikey).await?;
    Ok(update.map(|release| vec![release.version, release.body.unwrap_or_default()]))
}

#[tauri::command]
pub(crate) async fn desktop_update_install(
    app: AppHandle,
    access_token: String,
    apikey: String,
) -> Result<String, String> {
    let update = check(&app, access_token, apikey)
        .await?
        .ok_or_else(|| "설치할 새 MasterV 버전이 없습니다.".to_string())?;
    let version = update.version.clone();
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("업데이트 다운로드 또는 설치에 실패했습니다: {error}"))?;
    Ok(version)
}
