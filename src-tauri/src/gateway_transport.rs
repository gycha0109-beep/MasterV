use crate::device_secure_store::{DeviceIdentityRecord, DeviceSecureStore};
use reqwest::redirect::Policy;
use reqwest::{Client, Method};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::State;
use uuid::Uuid;

const GATEWAY_ENV: &str = "MASTERV_GATEWAY_BASE_URL";
const GATEWAY_TIMEOUT_SECONDS: u64 = 45;

#[derive(Clone, Debug)]
pub struct GatewayTransport {
    base_url: Option<String>,
    client: Client,
}

#[derive(Debug, Serialize)]
pub struct GatewayTransportStatus {
    pub configured: bool,
    pub authority: &'static str,
    pub transport: &'static str,
    pub product_key_bearer_allowed: bool,
    pub device_credential_persisted: bool,
    pub session_credential_persisted: bool,
}

impl GatewayTransport {
    pub fn initialize() -> Result<Self, String> {
        let configured = std::env::var(GATEWAY_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| option_env!("MASTERV_GATEWAY_BASE_URL").map(str::to_string))
            .map(|value| normalize_base_url(&value))
            .transpose()?;
        let client = Client::builder()
            .timeout(Duration::from_secs(GATEWAY_TIMEOUT_SECONDS))
            .redirect(Policy::none())
            .build()
            .map_err(error_string)?;
        Ok(Self {
            base_url: configured,
            client,
        })
    }

    pub fn status(&self) -> GatewayTransportStatus {
        GatewayTransportStatus {
            configured: self.base_url.is_some(),
            authority: "masterv-gateway",
            transport: "native-https-json",
            product_key_bearer_allowed: false,
            device_credential_persisted: true,
            session_credential_persisted: false,
        }
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        bearer: Option<&str>,
        body: Option<Value>,
    ) -> Result<Value, String> {
        let base = self
            .base_url
            .as_deref()
            .ok_or_else(|| format!("{GATEWAY_ENV} is not configured for this Desktop build"))?;
        let url = format!("{base}{path}");
        let mut request = self
            .client
            .request(method, url)
            .header("Accept", "application/json")
            .header("x-masterv-request-id", Uuid::new_v4().to_string());
        if let Some(credential) = bearer {
            if credential.trim().is_empty() {
                return Err("Gateway bearer credential must not be empty".to_string());
            }
            request = request.bearer_auth(credential);
        }
        if let Some(payload) = body {
            request = request.json(&payload);
        }
        let response = request.send().await.map_err(error_string)?;
        let status = response.status();
        let payload: Value = response.json().await.map_err(error_string)?;
        if !status.is_success() {
            let code = payload
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or("GATEWAY_REQUEST_FAILED");
            let message = payload
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("MasterV Gateway request failed");
            return Err(format!("{code}: {message}"));
        }
        Ok(payload)
    }

    async fn post(&self, path: &str, bearer: Option<&str>, body: Value) -> Result<Value, String> {
        self.request(Method::POST, path, bearer, Some(body)).await
    }

    async fn get(&self, path: &str, bearer: Option<&str>) -> Result<Value, String> {
        self.request(Method::GET, path, bearer, None).await
    }
}

fn normalize_base_url(value: &str) -> Result<String, String> {
    let normalized = value.trim().trim_end_matches('/').to_string();
    if normalized.is_empty() {
        return Err("Gateway base URL must not be empty".to_string());
    }
    let parsed = reqwest::Url::parse(&normalized).map_err(error_string)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Gateway base URL must include a hostname".to_string())?;
    let https = parsed.scheme() == "https";
    let local_debug = cfg!(debug_assertions)
        && parsed.scheme() == "http"
        && matches!(host, "127.0.0.1" | "localhost" | "::1");
    if !https && !local_debug {
        return Err("Gateway base URL must use HTTPS outside local debug tests".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Gateway base URL must not contain query or fragment components".to_string());
    }
    Ok(normalized)
}

fn result_object(payload: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    payload
        .get("result")
        .and_then(Value::as_object)
        .ok_or_else(|| "Gateway response is missing result object".to_string())
}

fn required_string(record: &serde_json::Map<String, Value>, key: &str) -> Result<String, String> {
    record
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Gateway response is missing {key}"))
}

fn session_view(
    provider_action: &str,
    install_id: &str,
    session_credential: String,
    expires_at: String,
    entitlement: Value,
) -> Value {
    json!({
        "provider": "masterv-gateway",
        "provider_action": provider_action,
        "credential_kind": "bearer",
        "credential": session_credential,
        "subject_id": format!("device:{install_id}"),
        "expires_at": expires_at,
        "install_id": install_id,
        "entitlement": entitlement
    })
}

#[tauri::command]
pub fn desktop_gateway_status(state: State<'_, GatewayTransport>) -> GatewayTransportStatus {
    state.status()
}

#[tauri::command]
pub async fn desktop_gateway_activate(
    gateway: State<'_, GatewayTransport>,
    secure_store: State<'_, DeviceSecureStore>,
    product_key: String,
    device_label: Option<String>,
) -> Result<Value, String> {
    let product_key = product_key.trim();
    if product_key.is_empty() {
        return Err("Product Key is required".to_string());
    }
    if product_key.len() > 256 {
        return Err("Product Key is too long".to_string());
    }
    let existing = secure_store.load()?;
    let install_id = existing
        .as_ref()
        .map(|record| record.install_id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let payload = gateway
        .post(
            "/v1/license/activate",
            None,
            json!({
                "product_key": product_key,
                "install_id": install_id,
                "device_label": device_label.unwrap_or_else(|| "MasterV Desktop".to_string())
            }),
        )
        .await?;
    let result = result_object(&payload)?;
    let device_credential = required_string(result, "device_credential")?;
    let device_credential_expires_at = required_string(result, "device_credential_expires_at")?;
    let session_credential = required_string(result, "session_credential")?;
    let session_expires_at = required_string(result, "session_credential_expires_at")?;
    let entitlement = result.get("entitlement").cloned().unwrap_or(Value::Null);
    secure_store.save(&DeviceIdentityRecord {
        install_id: install_id.clone(),
        device_credential,
        device_credential_expires_at,
    })?;
    Ok(session_view(
        "product-key-activation",
        &install_id,
        session_credential,
        session_expires_at,
        entitlement,
    ))
}

#[tauri::command]
pub async fn desktop_gateway_resume_session(
    gateway: State<'_, GatewayTransport>,
    secure_store: State<'_, DeviceSecureStore>,
) -> Result<Value, String> {
    let device = secure_store
        .load()?
        .ok_or_else(|| "No secure MasterV device credential is stored on this Windows user profile".to_string())?;
    let payload = gateway
        .post(
            "/v1/session",
            Some(&device.device_credential),
            json!({ "install_id": device.install_id }),
        )
        .await?;
    let result = result_object(&payload)?;
    let session_credential = required_string(result, "session_credential")?;
    let session_expires_at = required_string(result, "session_credential_expires_at")?;
    let entitlement = result.get("entitlement").cloned().unwrap_or(Value::Null);
    Ok(session_view(
        "device-session-resume",
        &device.install_id,
        session_credential,
        session_expires_at,
        entitlement,
    ))
}

#[tauri::command]
pub async fn desktop_gateway_entitlement(
    gateway: State<'_, GatewayTransport>,
    session_credential: String,
) -> Result<Value, String> {
    gateway
        .get("/v1/entitlement", Some(&session_credential))
        .await
}

#[tauri::command]
pub async fn desktop_gateway_discover(
    gateway: State<'_, GatewayTransport>,
    session_credential: String,
    query: String,
    options: Value,
) -> Result<Value, String> {
    gateway
        .post(
            "/v1/discovery",
            Some(&session_credential),
            json!({ "query": query, "options": options }),
        )
        .await
}

#[tauri::command]
pub async fn desktop_gateway_analyze(
    gateway: State<'_, GatewayTransport>,
    session_credential: String,
    url: String,
) -> Result<Value, String> {
    gateway
        .post(
            "/v1/analyze",
            Some(&session_credential),
            json!({ "url": url }),
        )
        .await
}

#[tauri::command]
pub async fn desktop_gateway_guidance(
    gateway: State<'_, GatewayTransport>,
    session_credential: String,
    analysis: Value,
    product_truth: Value,
) -> Result<Value, String> {
    gateway
        .post(
            "/v1/guidance",
            Some(&session_credential),
            json!({ "analysis": analysis, "product_truth": product_truth }),
        )
        .await
}

fn error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_url_requires_https_outside_local_debug_exception() {
        assert_eq!(normalize_base_url("https://api.masterv.example/").unwrap(), "https://api.masterv.example");
        assert!(normalize_base_url("file:///tmp/gateway").is_err());
        assert!(normalize_base_url("https://api.masterv.example/?x=1").is_err());
    }

    #[test]
    fn gateway_status_never_allows_product_key_bearer_or_session_persistence() {
        let gateway = GatewayTransport {
            base_url: None,
            client: Client::builder().build().expect("client"),
        };
        let status = gateway.status();
        assert!(!status.product_key_bearer_allowed);
        assert!(status.device_credential_persisted);
        assert!(!status.session_credential_persisted);
    }
}
