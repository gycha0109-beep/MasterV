fn main() {
    println!("cargo:rerun-if-env-changed=MASTERV_GATEWAY_BASE_URL");
    tauri_build::build()
}
