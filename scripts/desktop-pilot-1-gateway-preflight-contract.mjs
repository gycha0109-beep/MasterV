import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const docPath = "docs/architecture/MV-PILOT-1-PRODUCTION-GATEWAY-PREFLIGHT.md";
const verifierPath = "scripts/desktop-pilot-1-gateway-preflight-windows.mjs";
const ciPath = ".github/workflows/ci.yml";

assert(exists(docPath), "Published Gateway preflight authority document is missing");
assert(exists(verifierPath), "Published Gateway preflight Windows observer is missing");

const doc = read(docPath);
const verifier = read(verifierPath);
const ci = read(ciPath);

for (const marker of [
  "SOURCE_CONTRACT_PASS != PUBLISHED_BINARY_GATEWAY_CONFIGURED",
  "PRODUCT_KEY_SUBMITTED = FALSE",
  "POLAR_MUTATION = FALSE",
  "PROVIDER_OPERATION = FALSE",
  "RELEASE_MUTATION = FALSE",
  "EXTERNAL_HUMAN_PILOT_EXECUTED = FALSE",
  "PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE",
  "EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION",
  "MV_PILOT_1 = BLOCKED_ON_PRODUCTION_GATEWAY_CONFIGURATION",
  "MASTERV_PILOT_1_PUBLISHED_GATEWAY_PREFLIGHT_OBSERVED",
  "READY_FOR_GATEWAY_REACHABILITY_PREFLIGHT",
  "BLOCKED_GATEWAY_NOT_CONFIGURED"
]) {
  assert(doc.includes(marker), `Gateway preflight authority marker missing: ${marker}`);
}

for (const marker of [
  'const releaseVersion = "0.1.4"',
  'releases/latest/download/latest.json',
  'MasterV_${releaseVersion}_x64-setup.exe',
  'desktop_gateway_status',
  'gateway.authority === "masterv-gateway"',
  'gateway.transport === "native-https-json"',
  'gateway.product_key_bearer_allowed === false',
  'gateway.session_credential_persisted === false',
  'runtime_gateway_env_injected: false',
  'product_key_submitted: false',
  'activation_called: false',
  'provider_operation_executed: false',
  'polar_mutation: false',
  'release_mutation: false',
  'gateway_deployment_mutation: false',
  'external_human_pilot_executed: false',
  'MASTERV_PILOT_1_PUBLISHED_GATEWAY_PREFLIGHT_OBSERVED',
  'BLOCKED_GATEWAY_NOT_CONFIGURED'
]) {
  assert(verifier.includes(marker), `Gateway preflight observer marker missing: ${marker}`);
}

for (const forbidden of [
  'desktop_gateway_activate',
  '/v1/license/activate',
  'desktop_gateway_resume_session',
  'desktop_gateway_discover',
  'desktop_gateway_analyze',
  'desktop_gateway_guidance',
  'gh release create',
  'gh release upload',
  'gh release edit',
  'secrets.POLAR_ACCESS_TOKEN',
  'secrets.GEMINI_API_KEY',
  'secrets.YOUTUBE_DATA_API_KEY',
  'secrets.TAURI_SIGNING_PRIVATE_KEY'
]) {
  assert(!verifier.includes(forbidden), `Gateway preflight regained forbidden mutation authority: ${forbidden}`);
}

assert(
  verifier.includes('assert(!process.env.MASTERV_GATEWAY_BASE_URL'),
  "Published Gateway observation must reject runtime MASTERV_GATEWAY_BASE_URL injection"
);

const syntax = spawnSync(process.execPath, ["--check", verifierPath], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `Gateway preflight observer syntax check failed: ${syntax.stderr || syntax.stdout}`);

for (const marker of [
  "Verify published v0.1.4 Gateway configuration preflight",
  "node scripts/desktop-pilot-1-gateway-preflight-windows.mjs",
  "masterv-0.1.4-pilot-1-gateway-preflight",
  "artifacts/desktop-pilot-1-gateway-preflight"
]) {
  assert(ci.includes(marker), `Gateway preflight CI marker missing: ${marker}`);
}

assert(!ci.includes("MASTERV_GATEWAY_BASE_URL:"), "PR CI must not inject a Gateway URL into the published binary preflight");
assert(!ci.includes("POLAR_ACCESS_TOKEN: ${{ secrets."), "PR CI must not consume Polar production credentials");
assert(!ci.includes("TAURI_SIGNING_PRIVATE_KEY: ${{ secrets."), "PR CI must not consume production signing credentials");

const workflowDir = path.join(root, ".github", "workflows");
const automaticPrWorkflows = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .filter((name) => {
    const text = read(path.join(".github/workflows", name));
    return /^\s*pull_request\s*:/m.test(text) || /^\s*pull_request\s*$/m.test(text);
  })
  .sort();
assert.deepEqual(automaticPrWorkflows, ["ci.yml", "mv-exit-3-clean-cut.yml"], "Gateway preflight must not add automatic PR workflows");

console.log(JSON.stringify({
  status: "MASTERV_PILOT_1_GATEWAY_PREFLIGHT_CONTRACT_PASS",
  production_baseline: "v0.1.4",
  observer_is_read_only: true,
  product_key_submission_allowed: false,
  production_mutation_allowed: false,
  configured_value_forced_by_contract: false,
  automatic_pr_workflows: automaticPrWorkflows
}));
