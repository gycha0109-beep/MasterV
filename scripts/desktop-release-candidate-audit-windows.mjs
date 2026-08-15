import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = tauriConfig.version;
assert(typeof version === "string" && version.length > 0, "Tauri version is required");
assert(packageJson.version === version, "package.json and Tauri release versions must match");

const bundleDir = path.join(root, "src-tauri/target/release/bundle/nsis");
assert(fs.existsSync(bundleDir), "NSIS bundle directory is missing");
const installers = fs.readdirSync(bundleDir)
  .filter((name) => name.endsWith("-setup.exe"))
  .map((name) => path.join(bundleDir, name));
assert(installers.length === 1, `Expected exactly one NSIS setup executable, found ${installers.length}`);

const installer = installers[0];
const expectedName = `MasterV_${version}_x64-setup.exe`;
assert(path.basename(installer) === expectedName, `Unexpected release candidate filename: ${path.basename(installer)}`);

const bytes = fs.readFileSync(installer);
const forbiddenIdentifiers = [
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY"
];
for (const token of forbiddenIdentifiers) {
  const utf8 = Buffer.from(token, "utf8");
  const utf16 = Buffer.from(token, "utf16le");
  assert(bytes.indexOf(utf8) === -1 && bytes.indexOf(utf16) === -1, `Forbidden credential identifier embedded in release candidate: ${token}`);
}

const sourceSha = process.env.MASTERV_RELEASE_SOURCE_SHA || "";
const checkoutSha = process.env.MASTERV_RELEASE_CHECKOUT_SHA || "";
const baseSha = process.env.MASTERV_RELEASE_BASE_SHA || "";
const sourceAuthority = process.env.MASTERV_RELEASE_SOURCE_AUTHORITY || "";
const signatureStatus = process.env.MASTERV_RELEASE_SIGNATURE_STATUS || "";
assert(/^[0-9a-f]{40}$/i.test(sourceSha), "MASTERV_RELEASE_SOURCE_SHA must be an exact 40-character commit SHA");
assert(/^[0-9a-f]{40}$/i.test(checkoutSha), "MASTERV_RELEASE_CHECKOUT_SHA must be an exact 40-character checkout SHA");
assert(baseSha === "" || /^[0-9a-f]{40}$/i.test(baseSha), "MASTERV_RELEASE_BASE_SHA must be empty or an exact 40-character commit SHA");
assert(["pr-synthetic-merge", "explicit-exact-sha"].includes(sourceAuthority), "Unexpected release source authority");
assert(signatureStatus === "NotSigned", `3M release candidate must remain unsigned, got ${signatureStatus || "missing"}`);

const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const outputDir = path.join(root, "artifacts/desktop-release-readiness");
fs.mkdirSync(outputDir, { recursive: true });
const manifest = {
  status: "MASTERV_DESKTOP_RELEASE_READINESS_PASS",
  release_candidate: true,
  version,
  source_sha: sourceSha,
  checkout_sha: checkoutSha,
  base_sha: baseSha || null,
  source_authority: sourceAuthority,
  installer: path.basename(installer),
  installer_sha256: sha256,
  signature_status: signatureStatus,
  credential_identifiers_present: false,
  publish_allowed: false,
  activation_allowed: false,
  updater_enabled: false,
  background_batch_gate_changed: false
};

fs.writeFileSync(path.join(outputDir, "release-candidate.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
