import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

if (process.platform !== "win32") throw new Error("3O shareable package audit must run on Windows");

const root = process.cwd();
const outputRoot = path.join(root, "artifacts/desktop-shareable-package");
fs.mkdirSync(outputRoot, { recursive: true });
const diagnosticPath = path.join(outputRoot, "audit-diagnostic.json");
const diagnostic = {
  status: "MASTERV_PRIVATE_SHARE_AUDIT_DIAGNOSTIC",
  phase: "initializing"
};

function checkpoint(phase, values = {}) {
  diagnostic.phase = phase;
  Object.assign(diagnostic, values);
  fs.writeFileSync(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, "utf8");
}

try {
  const packageJson = readJson(path.join(root, "package.json"));
  const tauriConfig = readJson(path.join(root, "src-tauri/tauri.conf.json"));
  const version = tauriConfig.version;
  checkpoint("version", { version, package_version: packageJson.version });
  assert(packageJson.version === version, "package.json and Tauri versions must match");

  const packageDirName = `MasterV-v${version}`;
  const packageDir = path.join(outputRoot, packageDirName);
  assert(fs.existsSync(packageDir), "Prepared private share package directory is missing");

  const expectedFiles = ["INSTALL.txt", "SHA256.txt", "release-manifest.json", `MasterV_${version}_x64-setup.exe`].sort();
  const actualFiles = fs.readdirSync(packageDir).sort();
  checkpoint("package-contents", { package_directory: packageDirName, expected_files: expectedFiles, actual_files: actualFiles });
  assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `Unexpected private share package contents: ${actualFiles.join(", ")}`);

  const manifestPath = path.join(packageDir, "release-manifest.json");
  const manifest = readJson(manifestPath);
  const installerPath = path.join(packageDir, manifest.installer || "");
  assert(fs.existsSync(installerPath), `Packaged installer missing: ${manifest.installer || "missing"}`);
  const packagedSha = sha256(installerPath);
  const signatureEvidencePath = path.join(outputRoot, "packaged-authenticode-evidence.json");
  assert(fs.existsSync(signatureEvidencePath), "Packaged Authenticode evidence is missing");
  const signatureEvidence = readJson(signatureEvidencePath);
  checkpoint("package-identity", {
    manifest,
    packaged_installer_sha256: packagedSha,
    packaged_authenticode_evidence: signatureEvidence
  });
  assert(packagedSha === manifest.installer_sha256, "Packaged installer SHA256 differs from manifest");
  assert(signatureEvidence.status === "MASTERV_PACKAGED_AUTHENTICODE_CHECK_PASS", `Packaged Authenticode check did not pass: ${signatureEvidence.status}`);
  assert(signatureEvidence.installer === manifest.installer, `Packaged Authenticode installer identity differs: evidence=${signatureEvidence.installer} manifest=${manifest.installer}`);
  assert(signatureEvidence.sha256 === packagedSha, `Packaged Authenticode SHA differs: evidence=${signatureEvidence.sha256} packaged=${packagedSha}`);
  assert(signatureEvidence.signature_status === "NotSigned", `Packaged installer must remain Authenticode NotSigned, got ${signatureEvidence.signature_status}`);

  const shaLine = fs.readFileSync(path.join(packageDir, "SHA256.txt"), "utf8").trim();
  assert(shaLine === `${packagedSha}  ${manifest.installer}`, `SHA256.txt does not match packaged installer: ${JSON.stringify(shaLine)}`);
  const installText = fs.readFileSync(path.join(packageDir, "INSTALL.txt"), "utf8");
  assert(installText.includes(`MasterV ${version}`), "INSTALL.txt must identify the package version");
  assert(installText.includes("코드 서명이 없는 비공개 테스트 빌드"), "INSTALL.txt must disclose unsigned private-test status");

  const installEvidencePath = path.join(root, "artifacts/desktop-installed-quality/install-evidence.json");
  const runtimeEvidencePath = path.join(root, "artifacts/desktop-windows-runtime/runtime-evidence.json");
  const lifecycleEvidencePath = path.join(root, "artifacts/desktop-installed-quality/session-uninstall-evidence.json");
  assert(fs.existsSync(installEvidencePath), "Installed preparation evidence is missing");
  assert(fs.existsSync(runtimeEvidencePath), "Local-first native runtime evidence is missing");
  assert(fs.existsSync(lifecycleEvidencePath), "Installed local-first lifecycle evidence is missing");
  const installEvidence = readJson(installEvidencePath);
  const runtimeEvidence = readJson(runtimeEvidencePath);
  const lifecycleEvidence = readJson(lifecycleEvidencePath);
  checkpoint("installed-evidence", {
    install_evidence: installEvidence,
    runtime_evidence: runtimeEvidence,
    lifecycle_evidence: lifecycleEvidence
  });

  assert(installEvidence.status === "MASTERV_WINDOWS_INSTALLED_PREPARE_PASS", `Installed preparation did not pass: ${installEvidence.status}`);
  assert(installEvidence.installer_sha256 === packagedSha, `Installed candidate hash differs from packaged installer hash: installed=${installEvidence.installer_sha256} packaged=${packagedSha}`);
  assert(installEvidence.signing === false && installEvidence.updater === false && installEvidence.activation === false, "Installed preparation crossed a forbidden lifecycle boundary");

  assert(runtimeEvidence.status === "MASTERV_WINDOWS_DESKTOP_RUNTIME_PASS", `Native local-first runtime did not pass: ${runtimeEvidence.status}`);
  assert(runtimeEvidence.migration_stage === "MV-SUPABASE-EXIT-2C", `Unexpected runtime migration stage: ${runtimeEvidence.migration_stage}`);
  assert(runtimeEvidence.fresh_runtime_auth_state === "LOCAL ONLY", `Native runtime must start LOCAL ONLY, got ${runtimeEvidence.fresh_runtime_auth_state}`);
  assert(runtimeEvidence.tauri_global_invoke_bridge === true, "Native runtime Tauri invoke bridge was not verified");
  assert(runtimeEvidence.local_sqlite_crud === "PASS", "Native runtime Local SQLite CRUD was not verified");
  assert(runtimeEvidence.local_sqlite_process_restart_persistence === "PASS", "Native runtime Local SQLite restart persistence was not verified");
  assert(runtimeEvidence.reference_detail_local_read === "PASS", "Native runtime local detail read was not verified");
  assert(runtimeEvidence.reference_compare_local_canonical === "PASS", "Native runtime local canonical compare was not verified");
  assert(runtimeEvidence.product_key_ui_present === true && runtimeEvidence.legacy_login_ui_present === false, "Visible Product-Key cutover was not verified");
  assert(runtimeEvidence.legacy_migration_ui_present === true, "0.1.2 legacy migration surface was not verified");
  assert(runtimeEvidence.persistent_auth_storage === false, "Native runtime persisted browser auth credentials");
  assert(runtimeEvidence.direct_provider_requests === 0 && runtimeEvidence.local_next_api_requests === 0, "Native local-first runtime emitted forbidden direct provider/local API requests");
  assert(runtimeEvidence.fixture_cleanup === "PASS", "Native runtime fixture cleanup was not verified");

  assert(lifecycleEvidence.status === "MASTERV_DESKTOP_INSTALLED_SESSION_UNINSTALL_PASS", `Installed lifecycle did not pass: ${lifecycleEvidence.status}`);
  assert(lifecycleEvidence.migration_stage === "MV-SUPABASE-EXIT-2C", `Unexpected installed lifecycle migration stage: ${lifecycleEvidence.migration_stage}`);
  assert(lifecycleEvidence.installed_launch === "PASS", "Installed MasterV launch was not verified");
  assert(lifecycleEvidence.runtime_mode === "LOCAL ONLY", `Installed runtime must remain LOCAL ONLY before activation, got ${lifecycleEvidence.runtime_mode}`);
  assert(lifecycleEvidence.native_invoke_bridge === true, "Installed native invoke bridge was not verified");
  assert(lifecycleEvidence.local_sqlite_write === "PASS", "Installed Local SQLite write was not verified");
  assert(lifecycleEvidence.local_sqlite_read_after_restart === "PASS", "Installed Local SQLite restart read was not verified");
  assert(lifecycleEvidence.local_sqlite_delete === "PASS", "Installed Local SQLite delete was not verified");
  assert(lifecycleEvidence.local_data_survived_process_restart === true, "Installed Local SQLite data did not survive process restart");
  assert(lifecycleEvidence.local_data_access_without_gateway_session === true, "Installed Local SQLite data required a Gateway session");
  assert(lifecycleEvidence.persistent_auth_storage === false && lifecycleEvidence.session_credential_persisted === false, "Installed runtime persisted a session credential");
  assert(Array.isArray(lifecycleEvidence.localStorage) && lifecycleEvidence.localStorage.length === 0, "Installed runtime persisted Local Storage auth state");
  assert(Array.isArray(lifecycleEvidence.sessionStorage) && lifecycleEvidence.sessionStorage.length === 0, "Installed runtime persisted Session Storage auth state");
  assert(lifecycleEvidence.direct_gemini_requests === 0 && lifecycleEvidence.direct_youtube_data_api_requests === 0 && lifecycleEvidence.local_next_api_requests === 0, "Installed runtime emitted forbidden direct provider/local API requests");
  assert(lifecycleEvidence.fixture_cleanup === true, "Installed Local SQLite fixture cleanup was not verified");
  assert(lifecycleEvidence.uninstall === "PASS", "Installed uninstall was not verified");
  assert(lifecycleEvidence.installed_executable_removed === true, "Installed executable residue remains after uninstall");
  assert(lifecycleEvidence.uninstall_registry_removed === true, "Uninstall registry residue remains after uninstall");
  assert(Array.isArray(lifecycleEvidence.autorun_residue) && lifecycleEvidence.autorun_residue.length === 0, "Installed lifecycle left autorun residue");
  assert(Array.isArray(lifecycleEvidence.service_residue) && lifecycleEvidence.service_residue.length === 0, "Installed lifecycle left service residue");
  assert(Array.isArray(lifecycleEvidence.scheduled_task_residue) && lifecycleEvidence.scheduled_task_residue.length === 0, "Installed lifecycle left scheduled-task residue");

  for (const [key, expected] of Object.entries({
    signed: false,
    runtime_verified: false,
    private_distribution_ready: false,
    drive_uploaded: false,
    email_sent: false,
    github_release_created: false,
    public_release: false,
    publish_allowed: false,
    updater_enabled: false,
    activation_allowed: false,
    background_batch_gate_changed: false
  })) {
    assert(manifest[key] === expected, `Prepared manifest invariant drifted: ${key} expected=${expected} actual=${manifest[key]}`);
  }
  assert(manifest.distribution === "private-direct-share", `3O distribution authority must remain private-direct-share, got ${manifest.distribution}`);
  assert(manifest.signature_status === "NotSigned", `3O manifest signature status must remain NotSigned, got ${manifest.signature_status}`);

  const finalManifest = {
    ...manifest,
    status: "MASTERV_PRIVATE_SHARE_PACKAGE_VERIFIED",
    runtime_verified: true,
    private_distribution_ready: true
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`, "utf8");

  const evidence = {
    status: "MASTERV_DESKTOP_SHAREABLE_PACKAGE_PASS",
    version,
    source_sha: finalManifest.source_sha,
    checkout_sha: finalManifest.checkout_sha,
    base_sha: finalManifest.base_sha,
    source_authority: finalManifest.source_authority,
    package_directory: packageDirName,
    package_format: finalManifest.package_format,
    architecture: finalManifest.architecture,
    installer: finalManifest.installer,
    installer_sha256: packagedSha,
    signature_status: "NotSigned",
    signed: false,
    installed_runtime_verified: true,
    runtime_mode: lifecycleEvidence.runtime_mode,
    visible_auth: runtimeEvidence.visible_auth,
    local_sqlite_crud: runtimeEvidence.local_sqlite_crud,
    local_sqlite_process_restart_persistence: runtimeEvidence.local_sqlite_process_restart_persistence,
    installed_local_sqlite_write: lifecycleEvidence.local_sqlite_write,
    installed_local_sqlite_read_after_restart: lifecycleEvidence.local_sqlite_read_after_restart,
    installed_local_sqlite_delete: lifecycleEvidence.local_sqlite_delete,
    native_invoke_bridge: lifecycleEvidence.native_invoke_bridge,
    persistent_auth_storage: lifecycleEvidence.persistent_auth_storage,
    session_credential_persisted: lifecycleEvidence.session_credential_persisted,
    direct_provider_requests: runtimeEvidence.direct_provider_requests,
    installed_direct_gemini_requests: lifecycleEvidence.direct_gemini_requests,
    installed_direct_youtube_data_api_requests: lifecycleEvidence.direct_youtube_data_api_requests,
    local_next_api_requests: lifecycleEvidence.local_next_api_requests,
    uninstall: lifecycleEvidence.uninstall,
    uninstall_residue: false,
    distribution: "private-direct-share",
    private_distribution_ready: true,
    drive_uploaded: false,
    email_sent: false,
    github_release_created: false,
    public_release: false,
    publish_allowed: false,
    updater_enabled: false,
    activation_allowed: false,
    background_batch_gate_changed: false
  };
  fs.writeFileSync(path.join(outputRoot, "shareable-package-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  checkpoint("pass", { result: evidence });
  console.log(JSON.stringify(evidence));
} catch (error) {
  checkpoint("failure", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null
  });
  throw error;
}
