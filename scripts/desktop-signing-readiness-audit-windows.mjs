import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
assert(packageJson.version === tauriConfig.version, "package.json and Tauri versions must match");

const logPath = process.env.MASTERV_SIGNING_INVOCATION_LOG || "";
assert(path.isAbsolute(logPath) && fs.existsSync(logPath), "Signing invocation log is missing");
const invocations = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
assert(invocations.length >= 2, `Expected multiple Tauri signing hook invocations, found ${invocations.length}`);
assert(invocations.every((entry) => entry.status === "MASTERV_WINDOWS_SIGNING_BRIDGE_DRY_RUN"), "Unexpected signing bridge status");
assert(invocations.every((entry) => entry.mode === "dry-run" && entry.external_signer_invoked === false && entry.signature_written === false), "3N must not invoke a live signer or write signatures");
assert(invocations.some((entry) => entry.target_class === "app-executable"), "Tauri signing hook did not observe the MasterV application executable");
assert(invocations.some((entry) => entry.target_class === "nsis-installer"), "Tauri signing hook did not observe the final NSIS installer");

const bundleDir = path.join(root, "src-tauri/target/release/bundle/nsis");
const installers = fs.readdirSync(bundleDir).filter((name) => name.endsWith("-setup.exe")).map((name) => path.join(bundleDir, name));
assert(installers.length === 1, `Expected exactly one NSIS installer, found ${installers.length}`);
const installer = installers[0];
const installerBytes = fs.readFileSync(installer);
const installerSha256 = crypto.createHash("sha256").update(installerBytes).digest("hex");

const sourceSha = process.env.MASTERV_SIGNING_SOURCE_SHA || "";
const checkoutSha = process.env.MASTERV_SIGNING_CHECKOUT_SHA || "";
const baseSha = process.env.MASTERV_SIGNING_BASE_SHA || "";
const sourceAuthority = process.env.MASTERV_SIGNING_SOURCE_AUTHORITY || "";
const installerStatus = process.env.MASTERV_SIGNING_INSTALLER_STATUS || "";
const appStatus = process.env.MASTERV_SIGNING_APP_STATUS || "";
assert(/^[0-9a-f]{40}$/i.test(sourceSha), "MASTERV_SIGNING_SOURCE_SHA must be an exact commit SHA");
assert(/^[0-9a-f]{40}$/i.test(checkoutSha), "MASTERV_SIGNING_CHECKOUT_SHA must be an exact checkout SHA");
assert(baseSha === "" || /^[0-9a-f]{40}$/i.test(baseSha), "MASTERV_SIGNING_BASE_SHA must be empty or an exact commit SHA");
assert(["pr-synthetic-merge", "explicit-exact-sha"].includes(sourceAuthority), "Unexpected signing source authority");
assert(installerStatus === "NotSigned", `3N dry-run installer must remain NotSigned, got ${installerStatus || "missing"}`);
assert(appStatus === "NotSigned", `3N dry-run app executable must remain NotSigned, got ${appStatus || "missing"}`);

const outputDir = path.join(root, "artifacts/desktop-signing-readiness");
fs.mkdirSync(outputDir, { recursive: true });
const manifest = {
  status: "MASTERV_DESKTOP_SIGNING_INTEGRATION_PASS",
  version: tauriConfig.version,
  source_sha: sourceSha,
  checkout_sha: checkoutSha,
  base_sha: baseSha || null,
  source_authority: sourceAuthority,
  signing_mode: "dry-run",
  signing_hook_invocations: invocations.length,
  observed_target_classes: [...new Set(invocations.map((entry) => entry.target_class))].sort(),
  installer: path.basename(installer),
  installer_sha256: installerSha256,
  installer_signature_status: installerStatus,
  app_signature_status: appStatus,
  provider_selected: false,
  signing_identity_configured: false,
  signing_credentials_consumed: false,
  signed_artifact_produced: false,
  publish_allowed: false,
  activation_allowed: false,
  updater_enabled: false,
  background_batch_gate_changed: false
};

fs.writeFileSync(path.join(outputDir, "signing-readiness.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest));
