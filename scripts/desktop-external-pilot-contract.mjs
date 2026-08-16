import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const candidatePath = "pilot/windows-private-v0.1.0/PILOT-CANDIDATE.json";
const runnerPath = "pilot/windows-private-v0.1.0/MasterV-External-Pilot.ps1";
const launcherPath = "pilot/windows-private-v0.1.0/START-EXTERNAL-PILOT.cmd";
const instructionsPath = "pilot/windows-private-v0.1.0/PILOT-INSTRUCTIONS.txt";
const workflowPath = ".github/workflows/desktop-external-pilot-readiness.yml";

const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
const runner = fs.readFileSync(runnerPath, "utf8");
const launcher = fs.readFileSync(launcherPath, "utf8");
const instructions = fs.readFileSync(instructionsPath, "utf8");
const workflow = fs.readFileSync(workflowPath, "utf8");
const determinism = fs.readFileSync("scripts/desktop-build-determinism-contract.mjs", "utf8");

assert(candidate.schema === "masterv-external-windows-private-pilot-v1", "3P candidate schema drifted");
assert(candidate.status === "MASTERV_EXTERNAL_PILOT_CANDIDATE_LOCKED", "3P candidate must remain locked");
assert(candidate.product === "MasterV" && candidate.version === "0.1.0", "3P candidate identity drifted");
assert(candidate.candidate_source_sha === "1eb6d16be87a7f0b67e5302cc96ad902e9a1ebf4", "3P must stay bound to the final 3O source SHA");
assert(candidate.candidate_checkout_sha === "271ad7c94ced34031947a9a2941a68eeeef28faf", "3P must stay bound to the final 3O synthetic-merge checkout SHA");
assert(candidate.candidate_base_sha === "f819da2a6568534360adbd4ee4282d22f495b923", "3P candidate base SHA drifted");
assert(candidate.candidate_workflow_run_id === 31970170083, "3P candidate workflow run drifted");
assert(candidate.candidate_artifact_id === 9269631775, "3P candidate artifact ID drifted");
assert(candidate.installer === "MasterV_0.1.0_x64-setup.exe", "3P installer filename drifted");
assert(candidate.installer_sha256 === "d85dae9d5d2a827fb86b3655c9a23821e1c15bb6712fa9d57e60831f6688fe25", "3P installer SHA256 drifted");
assert(candidate.signature_status === "NotSigned", "3P must remain explicitly unsigned");
assert(candidate.distribution === "private-direct-share", "3P distribution boundary drifted");
for (const field of ["external_execution_performed", "pilot_verified", "evidence_upload_automatic", "public_release", "publish_allowed", "updater_enabled", "activation_allowed", "background_batch_activation_allowed"]) {
  assert(candidate[field] === false, `3P candidate boundary must remain false: ${field}`);
}

for (const token of [
  "PILOT-CANDIDATE.json",
  "Get-FileHash",
  "Get-AuthenticodeSignature",
  "existing_masterv_installations",
  "windows_security_prompt",
  "install_registry_detected",
  "first_launch_visible",
  "login_success",
  "reference_library_success",
  "youtube_discovery_success",
  "deep_analysis",
  "production_guidance",
  "restart_signed_out",
  "explicit_logout_success",
  "post_uninstall",
  "release_blockers",
  "MASTERV_EXTERNAL_PILOT_PASS",
  "MASTERV_EXTERNAL_PILOT_PROVIDER_BLOCKED",
  "MASTERV_EXTERNAL_PILOT_FAIL",
  "Evidence was NOT uploaded automatically",
  "activation_allowed = $false",
  "background_batch_activation_allowed = $false"
]) {
  assert(runner.includes(token), `3P external runner invariant missing: ${token}`);
}

for (const forbidden of [
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "Send-MailMessage",
  "drive.google.com",
  "github.com",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "$env:COMPUTERNAME",
  "$env:USERNAME",
  "whoami",
  "Get-NetIPAddress",
  "ipconfig"
]) {
  assert(!runner.toLowerCase().includes(forbidden.toLowerCase()), `3P runner must not contain network/credential/identity authority: ${forbidden}`);
}

assert(/powershell\.exe\s+-NoProfile\s+-ExecutionPolicy\s+Bypass/i.test(launcher), "3P launcher must invoke the local runner explicitly");
assert(launcher.includes("MasterV-External-Pilot.ps1") && launcher.includes("-Mode Run"), "3P launcher wiring missing");
for (const forbidden of ["curl", "wget", "http://", "https://", "git ", "gh "]) {
  assert(!launcher.toLowerCase().includes(forbidden.toLowerCase()), `3P launcher must remain offline/local-only: ${forbidden}`);
}

for (const token of [
  "Do not enter your password into the pilot runner",
  "do not disable Windows Security",
  "MasterV-external-pilot-evidence.json",
  "does not upload evidence",
  "username/computer-name/IP"
]) {
  assert(instructions.includes(token), `3P operator instruction missing: ${token}`);
}

assert(/\bpull_request\s*:/.test(workflow), "3P readiness workflow must run on pull requests");
assert(/permissions:\s*\n\s*contents:\s*read/.test(workflow), "3P readiness workflow must be repository read-only");
assert(workflow.includes("actions/checkout@11d5960a326750d5838078e36cf38b85af677262"), "3P checkout action must be SHA-pinned");
assert(workflow.includes("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"), "3P setup-node action must be SHA-pinned");
assert(workflow.includes("node-version: 24.19.0"), "3P readiness Node version must be exact");
assert(workflow.includes("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"), "3P readiness evidence upload action must be SHA-pinned");
assert(workflow.includes("npm run test:desktop-build-determinism"), "3P readiness must retain 3K authority");
assert(workflow.includes("node scripts/desktop-external-pilot-contract.mjs"), "3P readiness must run the 3P static contract");
assert(workflow.includes("System.Management.Automation.Language.Parser"), "3P readiness must parse-check the PowerShell runner on Windows");
assert(workflow.includes("external_execution_performed = $false"), "3P readiness must not claim external execution");
assert(workflow.includes("pilot_verified = $false"), "3P readiness must not claim pilot verification");
for (const forbidden of ["setup.exe", "tauri build", "tauri bundle", "SUPABASE_TEST_PASSWORD", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY", "git tag", "gh release", "contents: write"]) {
  assert(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `3P readiness workflow crossed a forbidden boundary: ${forbidden}`);
}

assert(determinism.includes(workflowPath), "3K central determinism authority must include the 3P readiness workflow");

console.log(JSON.stringify({
  status: "MASTERV_DESKTOP_EXTERNAL_PILOT_CONTRACT_PASS",
  candidate_source_sha: candidate.candidate_source_sha,
  candidate_installer_sha256: candidate.installer_sha256,
  external_execution_performed: false,
  pilot_verified: false,
  user_execution_required: true,
  evidence_upload_automatic: false,
  public_release: false,
  activation_allowed: false
}));
