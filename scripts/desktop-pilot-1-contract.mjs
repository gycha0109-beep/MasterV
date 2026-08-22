import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const exists = (relative) => fs.existsSync(path.join(root, relative));

function runNode(relative) {
  const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${relative} failed:\n${result.stderr || result.stdout || result.error}`);
}

runNode("scripts/desktop-arch-001-closure-contract.mjs");

const docPath = "docs/architecture/MV-PILOT-1-PRODUCTION-EXTERNAL-PILOT-FIRST-RUN-ACCEPTANCE.md";
const verifierPath = "scripts/desktop-pilot-1-first-run-windows.mjs";
assert(exists(docPath), "MV-PILOT-1 authority document is missing");
assert(exists(verifierPath), "MV-PILOT-1 production first-run verifier is missing");

const doc = read(docPath);
const verifier = read(verifierPath);
const ci = read(".github/workflows/ci.yml");
const historicalPilot = read(".github/workflows/desktop-external-pilot-readiness.yml");

for (const marker of [
  "MV_ARCH_001 = CLOSED",
  "PRODUCTION_BASELINE = v0.1.4",
  "PRODUCTION_FIRST_RUN_ACCEPTANCE = REQUIRED",
  "EXTERNAL_HUMAN_PILOT = NOT_STARTED",
  "MV_PILOT_1 = READY_FOR_EXTERNAL_PILOT",
  "Local SQLite remains usable before Product Key activation",
  "Product Key is not persisted",
  "Session credential remains memory-only",
  "Updater remains subscription-independent",
  "No Polar production mutation",
  "No release mutation"
]) {
  assert(doc.includes(marker), `MV-PILOT-1 authority marker missing: ${marker}`);
}

for (const marker of [
  'const releaseVersion = "0.1.4"',
  'const releaseTag = `v${releaseVersion}`',
  'releases/latest/download/latest.json',
  'MasterV_${releaseVersion}_x64-setup.exe',
  'desktop_device_secure_store_status',
  'desktop_local_persistence_status',
  'desktop_local_reference_upsert',
  'desktop_local_reference_delete',
  'record_present === false',
  'product_key_stored === false',
  'session_credential_stored === false',
  'local_sqlite_authority_active === true',
  'remote_fallback_available === false',
  'value.auth === "LOCAL ONLY"',
  'value.updaterStatus === "최신 버전"',
  'product_key_submitted: false',
  'polar_mutation: false',
  'release_mutation: false',
  'external_human_pilot_executed: false',
  'MASTERV_PILOT_1_PRODUCTION_FIRST_RUN_ACCEPTANCE_PASS'
]) {
  assert(verifier.includes(marker), `MV-PILOT-1 first-run verifier marker missing: ${marker}`);
}

for (const forbidden of [
  "desktop_gateway_activate",
  "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.",
  "POLAR_ACCESS_TOKEN: ${{ secrets.",
  "gh release create",
  "gh release upload",
  "gh release edit"
]) {
  assert(!verifier.includes(forbidden), `MV-PILOT-1 first-run verifier regained mutation/credential authority: ${forbidden}`);
}

const syntax = spawnSync(process.execPath, ["--check", verifierPath], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `MV-PILOT-1 verifier syntax check failed: ${syntax.stderr || syntax.stdout}`);

for (const marker of [
  "Verify MV-PILOT-1 contract",
  "node scripts/desktop-pilot-1-contract.mjs",
  "Verify published v0.1.4 production first-run acceptance",
  "node scripts/desktop-pilot-1-first-run-windows.mjs",
  "masterv-0.1.4-pilot-1-first-run-acceptance"
]) {
  assert(ci.includes(marker), `MV-PILOT-1 existing CI integration marker missing: ${marker}`);
}

assert(!ci.includes("TAURI_SIGNING_PRIVATE_KEY: ${{ secrets."), "MV-PILOT-1 PR CI must not consume production signing credentials");
assert(!ci.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets."), "MV-PILOT-1 PR CI must not consume production signing password");
assert(!ci.includes("POLAR_ACCESS_TOKEN: ${{ secrets."), "MV-PILOT-1 PR CI must not consume Polar production credentials");

const workflowDir = path.join(root, ".github", "workflows");
const automaticPrWorkflows = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .filter((name) => {
    const text = read(path.join(".github/workflows", name));
    return /^\s*pull_request\s*:/m.test(text) || /^\s*pull_request\s*$/m.test(text);
  })
  .sort();
assert.deepEqual(automaticPrWorkflows, ["ci.yml", "mv-exit-3-clean-cut.yml"], "automatic PR governance must remain exactly CI + EXIT-3");

assert(historicalPilot.includes("workflow_dispatch:"), "Historical external-pilot readiness workflow must remain manual-only");
assert(historicalPilot.includes("distribution=$false"), "Historical external-pilot readiness workflow must retain no-distribution boundary");
assert(historicalPilot.includes("publication=$false"), "Historical external-pilot readiness workflow must retain no-publication boundary");
assert(!/^\s*pull_request\s*:/m.test(historicalPilot), "Historical external-pilot readiness workflow must not become an automatic PR workflow");
assert(!/^\s*push\s*:/m.test(historicalPilot), "Historical external-pilot readiness workflow must not become an automatic push workflow");
assert(!historicalPilot.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "Historical pilot readiness must not consume production signing credentials");

for (const forbiddenCredential of [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "POLAR_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY"
]) {
  assert.equal(process.env[forbiddenCredential], undefined, `MV-PILOT-1 deterministic contract must not receive credential: ${forbiddenCredential}`);
}

runNode("scripts/desktop-pilot-1-human-contract.mjs");
runNode("scripts/desktop-pilot-1-gateway-preflight-contract.mjs");
runNode("scripts/gateway-production-readiness-contract.mjs");
runNode("scripts/gateway-production-activation-contract.mjs");
runNode("scripts/gateway-zero-cost-deno-launch-contract.mjs");

console.log(JSON.stringify({
  status: "MASTERV_PILOT_1_CONTRACT_PASS",
  starting_main_sha: "fa8c43269cfb7687ea242d65dafd1621d11e0e7e",
  production_baseline: "v0.1.4",
  architecture_closed: true,
  production_first_run_acceptance_required: true,
  published_asset_only: true,
  product_key_submission_allowed_by_automated_gate: false,
  polar_production_mutation_allowed: false,
  release_mutation_allowed: false,
  human_pilot_fabrication_allowed: false,
  human_pilot_execution_contract_ready: true,
  published_gateway_preflight_contract_ready: true,
  published_v0_1_4_gateway_configured: false,
  gateway_production_readiness_contract_ready: true,
  gateway_production_activation_contract_ready: true,
  gateway_zero_cost_deno_launch_readiness_contract_ready: true,
  zero_cost_pilot_hosting_plane: "deno-deploy-free",
  custom_domain_purchase_required: false,
  deno_deployment_authorized: false,
  production_gateway_activation_authorized: false,
  target_after_exact_head_green: "BLOCKED_PENDING_EXPLICIT_ZERO_COST_DENO_GATEWAY_DEPLOYMENT",
  automatic_pr_workflows: automaticPrWorkflows
}));