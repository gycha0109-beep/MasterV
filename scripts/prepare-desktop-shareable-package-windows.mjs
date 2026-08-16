import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

if (process.platform !== "win32") throw new Error("3O shareable package preparation must run on Windows");

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = tauriConfig.version;
assert(typeof version === "string" && version.length > 0, "Tauri version is required");
assert(packageJson.version === version, "package.json and Tauri versions must match");

const sourceSha = process.env.MASTERV_SHARE_SOURCE_SHA || "";
const checkoutSha = process.env.MASTERV_SHARE_CHECKOUT_SHA || "";
const baseSha = process.env.MASTERV_SHARE_BASE_SHA || "";
const sourceAuthority = process.env.MASTERV_SHARE_SOURCE_AUTHORITY || "";
const signatureStatus = process.env.MASTERV_SHARE_SIGNATURE_STATUS || "";
assert(/^[0-9a-f]{40}$/i.test(sourceSha), "MASTERV_SHARE_SOURCE_SHA must be an exact 40-character commit SHA");
assert(/^[0-9a-f]{40}$/i.test(checkoutSha), "MASTERV_SHARE_CHECKOUT_SHA must be an exact 40-character checkout SHA");
assert(baseSha === "" || /^[0-9a-f]{40}$/i.test(baseSha), "MASTERV_SHARE_BASE_SHA must be empty or an exact 40-character commit SHA");
assert(["pr-synthetic-merge", "explicit-exact-sha"].includes(sourceAuthority), "Unexpected share package source authority");
assert(signatureStatus === "NotSigned", `3O private share package must remain unsigned, got ${signatureStatus || "missing"}`);

const bundleDir = path.join(root, "src-tauri/target/release/bundle/nsis");
assert(fs.existsSync(bundleDir), "NSIS bundle directory is missing");
const installers = fs.readdirSync(bundleDir)
  .filter((name) => /-setup\.exe$/i.test(name))
  .map((name) => path.join(bundleDir, name));
assert(installers.length === 1, `Expected exactly one NSIS installer, found ${installers.length}`);

const installer = installers[0];
const installerName = `MasterV_${version}_x64-setup.exe`;
assert(path.basename(installer) === installerName, `Unexpected installer filename: ${path.basename(installer)}`);
const installerSha256 = sha256(installer);

const forbiddenIdentifiers = [
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY"
];
const installerBytes = fs.readFileSync(installer);
for (const token of forbiddenIdentifiers) {
  assert(
    installerBytes.indexOf(Buffer.from(token, "utf8")) === -1 && installerBytes.indexOf(Buffer.from(token, "utf16le")) === -1,
    `Forbidden credential identifier embedded in private share installer: ${token}`
  );
}

const outputRoot = path.join(root, "artifacts/desktop-shareable-package");
const packageDirName = `MasterV-v${version}`;
const packageDir = path.join(outputRoot, packageDirName);
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(installer, path.join(packageDir, installerName));

const installText = `MasterV ${version} - Windows private test build\r\n\r\n설치 방법\r\n1. ${installerName} 파일을 다운로드합니다.\r\n2. 파일을 실행합니다.\r\n3. 이 빌드는 현재 코드 서명이 없는 비공개 테스트 빌드이므로 Windows 경고가 표시될 수 있습니다.\r\n4. 전달받은 링크와 파일 출처가 신뢰되는 경우에만 Windows의 추가 정보 화면에서 실행을 선택합니다.\r\n5. 설치 후 MasterV를 실행합니다.\r\n\r\n문제가 발생하면 MasterV 버전(${version})과 오류 화면을 함께 전달해주세요.\r\n`;
fs.writeFileSync(path.join(packageDir, "INSTALL.txt"), installText, "utf8");
fs.writeFileSync(path.join(packageDir, "SHA256.txt"), `${installerSha256}  ${installerName}\r\n`, "utf8");

const manifest = {
  status: "MASTERV_PRIVATE_SHARE_PACKAGE_PREPARED",
  product: "MasterV",
  version,
  source_sha: sourceSha,
  checkout_sha: checkoutSha,
  base_sha: baseSha || null,
  source_authority: sourceAuthority,
  package_directory: packageDirName,
  package_format: "nsis-exe",
  architecture: "x64",
  installer: installerName,
  installer_sha256: installerSha256,
  signature_status: signatureStatus,
  signed: false,
  distribution: "private-direct-share",
  intended_delivery: ["drive-link", "email-link"],
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
};
fs.writeFileSync(path.join(packageDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest));
