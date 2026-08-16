import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function authenticodeStatus(file) {
  const escaped = file.replace(/'/g, "''");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `(Get-AuthenticodeSignature -LiteralPath '${escaped}').Status.ToString()`],
    { encoding: "utf8", timeout: 30_000 }
  );
  if (result.status !== 0) throw new Error(`Authenticode audit failed (${result.status}): ${result.stderr || result.stdout}`);
  return (result.stdout || "").trim();
}

if (process.platform !== "win32") throw new Error("3O shareable package audit must run on Windows");

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = tauriConfig.version;
assert(packageJson.version === version, "package.json and Tauri versions must match");

const outputRoot = path.join(root, "artifacts/desktop-shareable-package");
const packageDirName = `MasterV-v${version}`;
const packageDir = path.join(outputRoot, packageDirName);
assert(fs.existsSync(packageDir), "Prepared private share package directory is missing");

const expectedFiles = ["INSTALL.txt", "SHA256.txt", "release-manifest.json", `MasterV_${version}_x64-setup.exe`].sort();
const actualFiles = fs.readdirSync(packageDir).sort();
assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `Unexpected private share package contents: ${actualFiles.join(", ")}`);

const manifestPath = path.join(packageDir, "release-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const installerPath = path.join(packageDir, manifest.installer || "");
assert(fs.existsSync(installerPath), `Packaged installer missing: ${manifest.installer || "missing"}`);
const packagedSha = sha256(installerPath);
assert(packagedSha === manifest.installer_sha256, "Packaged installer SHA256 differs from manifest");
assert(authenticodeStatus(installerPath) === "NotSigned", "Packaged installer must remain Authenticode NotSigned");

const shaLine = fs.readFileSync(path.join(packageDir, "SHA256.txt"), "utf8").trim();
assert(shaLine === `${packagedSha}  ${manifest.installer}`, "SHA256.txt does not match packaged installer");
const installText = fs.readFileSync(path.join(packageDir, "INSTALL.txt"), "utf8");
assert(installText.includes(`MasterV ${version}`), "INSTALL.txt must identify the package version");
assert(installText.includes("코드 서명이 없는 비공개 테스트 빌드"), "INSTALL.txt must disclose unsigned private-test status");

const installEvidencePath = path.join(root, "artifacts/desktop-installed-quality/install-evidence.json");
const qualityEvidencePath = path.join(root, "artifacts/desktop-installed-quality/installed-quality-evidence.json");
assert(fs.existsSync(installEvidencePath), "Installed preparation evidence is missing");
assert(fs.existsSync(qualityEvidencePath), "Installed lifecycle evidence is missing");
const installEvidence = JSON.parse(fs.readFileSync(installEvidencePath, "utf8"));
const qualityEvidence = JSON.parse(fs.readFileSync(qualityEvidencePath, "utf8"));
assert(installEvidence.status === "MASTERV_WINDOWS_INSTALLED_PREPARE_PASS", `Installed preparation did not pass: ${installEvidence.status}`);
assert(installEvidence.installer_sha256 === packagedSha, "Installed candidate hash differs from packaged installer hash");
assert(installEvidence.signing === false && installEvidence.updater === false && installEvidence.activation === false, "Installed preparation crossed a forbidden lifecycle boundary");
assert(qualityEvidence.status === "MASTERV_WINDOWS_INSTALLED_QUALITY_PASS", `Installed quality lifecycle did not pass: ${qualityEvidence.status}`);
assert(qualityEvidence.installed_launch === "PASS", "Installed MasterV launch was not verified");
assert(qualityEvidence.authenticated_runtime === "PASS", "Installed authenticated runtime was not verified");
assert(qualityEvidence.process_restart_without_logout === "PASS", "Installed process restart lifecycle was not verified");
assert(qualityEvidence.restart_auth_status === "SIGNED OUT", "Installed restart must remain signed out");
assert(qualityEvidence.explicit_logout_clear === true, "Installed explicit logout clear was not verified");
assert(qualityEvidence.uninstall === "PASS", "Installed uninstall was not verified");
assert(qualityEvidence.installed_executable_removed === true, "Installed executable residue remains after uninstall");
assert(qualityEvidence.uninstall_registry_removed === true, "Uninstall registry residue remains after uninstall");
assert(qualityEvidence.autorun_residue === false && qualityEvidence.service_residue === false && qualityEvidence.scheduled_task_residue === false, "Installed lifecycle left forbidden OS persistence residue");
assert(qualityEvidence.updater_created === false && qualityEvidence.activation === false, "Installed lifecycle crossed updater/activation boundary");

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
  assert(manifest[key] === expected, `Prepared manifest invariant drifted: ${key}`);
}
assert(manifest.distribution === "private-direct-share", "3O distribution authority must remain private-direct-share");
assert(manifest.signature_status === "NotSigned", "3O manifest signature status must remain NotSigned");

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
  installed_launch: qualityEvidence.installed_launch,
  authenticated_runtime: qualityEvidence.authenticated_runtime,
  process_restart_without_logout: qualityEvidence.process_restart_without_logout,
  restart_auth_status: qualityEvidence.restart_auth_status,
  explicit_logout_clear: qualityEvidence.explicit_logout_clear,
  uninstall: qualityEvidence.uninstall,
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
console.log(JSON.stringify(evidence));
