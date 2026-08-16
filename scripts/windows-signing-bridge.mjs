import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mode = process.env.MASTERV_SIGNING_MODE || "";
assert(mode === "dry-run", "MASTERV_SIGNING_PROVIDER_REQUIRED: live signing is intentionally unavailable until a signing provider and identity are selected");

const targetArgument = process.argv[2] || "";
assert(targetArgument.length > 0, "Signing target path is required");
const target = path.resolve(targetArgument);
assert(fs.existsSync(target), `Signing target does not exist: ${target}`);
const extension = path.extname(target).toLowerCase();
assert(extension === ".exe" || extension === ".dll", `Unexpected signing target extension: ${extension || "none"}`);

const logPath = process.env.MASTERV_SIGNING_INVOCATION_LOG || "";
assert(path.isAbsolute(logPath), "MASTERV_SIGNING_INVOCATION_LOG must be an absolute path because Tauri may invoke the signer from nested NSIS working directories");
const normalizedLog = path.normalize(logPath).toLowerCase();
const expectedSegment = path.normalize(`${path.sep}artifacts${path.sep}desktop-signing-readiness${path.sep}`).toLowerCase();
assert(normalizedLog.includes(expectedSegment), "Signing invocation log must stay under artifacts/desktop-signing-readiness");
fs.mkdirSync(path.dirname(logPath), { recursive: true });

const basename = path.basename(target);
let targetClass = "windows-binary";
if (/^masterv-desktop\.exe$/i.test(basename)) targetClass = "app-executable";
else if (/^MasterV_.+_x64-setup\.exe$/i.test(basename)) targetClass = "nsis-installer";
else if (extension === ".dll") targetClass = "nsis-plugin-or-dll";
else if (extension === ".exe") targetClass = "nsis-uninstaller-or-executable";

const record = {
  status: "MASTERV_WINDOWS_SIGNING_BRIDGE_DRY_RUN",
  mode: "dry-run",
  target: basename,
  target_class: targetClass,
  extension,
  signing_provider_configured: false,
  signing_identity_configured: false,
  credentials_consumed: false,
  external_signer_invoked: false,
  signature_written: false
};
fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
console.log(JSON.stringify(record));
