import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const docPath = "docs/architecture/MV-PILOT-1A-GATEWAY-PRODUCTION-READINESS.md";
const routePath = "app/v1/[...segments]/route.ts";
const surfaceContractPath = "scripts/gateway-serverless-surface-contract.ts";
const bindingVerifierPath = "scripts/desktop-gateway-build-binding-windows.mjs";
const buildScriptPath = "src-tauri/build.rs";

for (const relative of [docPath, routePath, surfaceContractPath, bindingVerifierPath, buildScriptPath]) {
  assert(exists(relative), `Gateway production readiness file is missing: ${relative}`);
}

const doc = read(docPath);
const route = read(routePath);
const surfaceContract = read(surfaceContractPath);
const bindingVerifier = read(bindingVerifierPath);
const buildScript = read(buildScriptPath);
const ci = read(".github/workflows/ci.yml");

for (const marker of [
  "PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE",
  "EXTERNAL_HUMAN_PILOT = BLOCKED_PRE_EXECUTION",
  "Gateway production deployment",
  "production signing activation",
  "GitHub Release publication",
  "https://api.masterv.<domain>",
  "https://api.masterv.example",
  "cargo:rerun-if-env-changed=MASTERV_GATEWAY_BASE_URL",
  "MV_PILOT_1 = BLOCKED_PENDING_PRODUCTION_GATEWAY_ACTIVATION_AND_NEW_SIGNED_DESKTOP"
]) {
  assert(doc.includes(marker), `Gateway readiness authority marker missing: ${marker}`);
}

for (const marker of [
  'createGateway(createGatewayProviderRuntime(process.env))',
  'export const runtime = "nodejs"',
  'export const dynamic = "force-dynamic"',
  'handle as GET',
  'handle as POST',
  'handle as OPTIONS'
]) {
  assert(route.includes(marker), `Serverless Gateway route marker missing: ${marker}`);
}

for (const forbidden of ["postgres", "supabase", "redis", "d1", "prisma", "drizzle"] ) {
  assert(!route.toLowerCase().includes(forbidden), `Serverless Gateway adapter introduced persistence dependency marker: ${forbidden}`);
}

for (const marker of [
  'new Request("https://api.masterv.example/v1/health")',
  'GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE',
  'provider_calls_executed: false',
  'production_deployment_mutation: false'
]) {
  assert(surfaceContract.includes(marker), `Serverless surface contract marker missing: ${marker}`);
}

assert(buildScript.includes('println!("cargo:rerun-if-env-changed=MASTERV_GATEWAY_BASE_URL")'), "Cargo must rebuild when compile-time Gateway URL changes");

for (const marker of [
  'desktop_gateway_status',
  'gateway?.configured === true',
  'probe_gateway_hostname: "api.masterv.example"',
  'runtime_gateway_env_injected: false',
  'product_key_submitted: false',
  'activation_called: false',
  'provider_operation_executed: false',
  'polar_mutation: false',
  'signing_credentials_used: false',
  'release_mutation: false',
  'gateway_deployment_mutation: false'
]) {
  assert(bindingVerifier.includes(marker), `Desktop Gateway build-binding verifier marker missing: ${marker}`);
}

for (const forbidden of [
  "desktop_gateway_activate",
  "/v1/license/activate",
  "fetch(",
  "POLAR_ACCESS_TOKEN: ${{ secrets.",
  "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.",
  "gh release create",
  "gh release upload",
  "gh release edit"
]) {
  assert(!bindingVerifier.includes(forbidden), `Desktop Gateway build-binding verifier regained mutation authority: ${forbidden}`);
}

const syntax = spawnSync(process.execPath, ["--check", bindingVerifierPath], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `Gateway build-binding verifier syntax failed: ${syntax.stderr || syntax.stdout}`);

for (const marker of [
  "Verify Gateway serverless surface contract",
  "npx tsx scripts/gateway-serverless-surface-contract.ts",
  "Build unsigned Gateway-bound Desktop probe",
  "MASTERV_GATEWAY_BASE_URL: https://api.masterv.example",
  "Verify compile-time Gateway binding",
  "node scripts/desktop-gateway-build-binding-windows.mjs",
  "masterv-gateway-build-binding-readiness"
]) {
  assert(ci.includes(marker), `Gateway production readiness CI marker missing: ${marker}`);
}

for (const forbidden of [
  "POLAR_ACCESS_TOKEN: ${{ secrets.",
  "POLAR_ORGANIZATION_ID: ${{ secrets.",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET: ${{ secrets.",
  "GEMINI_API_KEY: ${{ secrets.",
  "YOUTUBE_DATA_API_KEY: ${{ secrets.",
  "gh release create",
  "gh release upload",
  "gh release edit"
]) {
  assert(!ci.includes(forbidden), `PR CI must not receive production Gateway/release authority: ${forbidden}`);
}

const workflowDir = path.join(root, ".github", "workflows");
const automaticPrWorkflows = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .filter((name) => {
    const text = read(path.join(".github/workflows", name));
    return /^\s*pull_request\s*:/m.test(text) || /^\s*pull_request\s*$/m.test(text);
  })
  .sort();
assert.deepEqual(automaticPrWorkflows, ["ci.yml", "mv-exit-3-clean-cut.yml"], "Gateway readiness must not add automatic PR workflows");

console.log(JSON.stringify({
  status: "MASTERV_PILOT_1A_GATEWAY_PRODUCTION_READINESS_CONTRACT_PASS",
  serverless_gateway_surface_ready: true,
  desktop_compile_time_gateway_binding_probe_ready: true,
  published_v0_1_4_gateway_configured: false,
  production_gateway_deployment_authorized: false,
  production_secret_mutation_authorized: false,
  production_signing_authorized: false,
  release_publication_authorized: false,
  external_human_pilot_authorized: false,
  target: "BLOCKED_PENDING_PRODUCTION_GATEWAY_ACTIVATION_AND_NEW_SIGNED_DESKTOP",
  automatic_pr_workflows: automaticPrWorkflows
}));
