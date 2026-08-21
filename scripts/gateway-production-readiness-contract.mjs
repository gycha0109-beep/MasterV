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
const deploymentSurfaceContractPath = "scripts/gateway-deployment-surface-contract.ts";
const deploymentSurfacePath = "lib/deployment-surface.ts";
const proxyPath = "proxy.ts";
const legacyApiContracts = [
  ["app/api/analyze/route.ts", "const managed = await analyzeYouTubeDeepManaged"],
  ["app/api/discover/youtube/route.ts", "const result = await discoverYouTubeProgressive"],
  ["app/api/interpret-product-truth/route.ts", "const interpretation = await interpretProductTruthAgainstReference"]
];
const bindingVerifierPath = "scripts/desktop-gateway-build-binding-windows.mjs";
const publishedPreflightPath = "scripts/desktop-pilot-1-gateway-preflight-windows.mjs";
const buildScriptPath = "src-tauri/build.rs";

for (const relative of [
  docPath,
  routePath,
  surfaceContractPath,
  deploymentSurfaceContractPath,
  deploymentSurfacePath,
  proxyPath,
  ...legacyApiContracts.map(([relative]) => relative),
  bindingVerifierPath,
  publishedPreflightPath,
  buildScriptPath
]) {
  assert(exists(relative), `Gateway production readiness file is missing: ${relative}`);
}

const doc = read(docPath);
const route = read(routePath);
const surfaceContract = read(surfaceContractPath);
const deploymentSurfaceContract = read(deploymentSurfaceContractPath);
const deploymentSurface = read(deploymentSurfacePath);
const proxy = read(proxyPath);
const bindingVerifier = read(bindingVerifierPath);
const publishedPreflight = read(publishedPreflightPath);
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
  "PRODUCTION_GATEWAY_PUBLIC_SURFACE = /v1/* ONLY",
  "MASTERV_DEPLOYMENT_SURFACE=web",
  "GATEWAY_PRODUCTION_SURFACE_ISOLATION = READY",
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
for (const forbidden of ["postgres", "supabase", "redis", "d1", "prisma", "drizzle"]) {
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

for (const marker of [
  'return env.NODE_ENV === "production" ? "gateway" : "web"',
  'MASTERV_DEPLOYMENT_SURFACE',
  'return resolveMasterVDeploymentSurface(env) === "web"'
]) {
  assert(deploymentSurface.includes(marker), `Deployment surface authority marker missing: ${marker}`);
}
for (const marker of [
  'resolveMasterVDeploymentSurface() !== "gateway"',
  'pathname === "/v1" || pathname.startsWith("/v1/")',
  'code: "GATEWAY_ROUTE_NOT_FOUND"',
  'status: 404',
  '"Cache-Control": "no-store"'
]) {
  assert(proxy.includes(marker), `Gateway-only proxy marker missing: ${marker}`);
}

for (const [relative, providerInvocation] of legacyApiContracts) {
  const source = read(relative);
  const guardIndex = source.indexOf("legacyWebApiEnabled()");
  const providerInvocationIndex = source.indexOf(providerInvocation);
  assert(guardIndex >= 0, `Legacy API ${relative} is missing deployment-surface guard`);
  assert(source.includes('code: "LEGACY_WEB_API_DISABLED"'), `Legacy API ${relative} is missing fail-closed code`);
  assert(providerInvocationIndex >= 0, `Legacy API ${relative} provider invocation marker is missing`);
  assert(guardIndex < providerInvocationIndex, `Legacy API ${relative} must guard before provider execution`);
}

for (const marker of [
  'resolveMasterVDeploymentSurface({ NODE_ENV: "production" }), "gateway"',
  'MASTERV_DEPLOYMENT_SURFACE: "web"',
  'new NextRequest("https://api.masterv.example/api/analyze")',
  'LEGACY_WEB_API_DISABLED',
  'provider_calls_executed: false',
  'production_deployment_mutation: false'
]) {
  assert(deploymentSurfaceContract.includes(marker), `Deployment surface contract marker missing: ${marker}`);
}

const tsxExecutable = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
assert(exists(path.relative(root, tsxExecutable)), "tsx executable is required for Gateway readiness contracts");
for (const contractPath of [surfaceContractPath, deploymentSurfaceContractPath]) {
  const execution = spawnSync(tsxExecutable, [contractPath], { cwd: root, encoding: "utf8" });
  assert.equal(execution.status, 0, `${contractPath} failed:\n${execution.stderr || execution.stdout || execution.error}`);
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
const bindingSyntax = spawnSync(process.execPath, ["--check", bindingVerifierPath], { cwd: root, encoding: "utf8" });
assert.equal(bindingSyntax.status, 0, `Gateway build-binding verifier syntax failed: ${bindingSyntax.stderr || bindingSyntax.stdout}`);

for (const marker of [
  'const compileTimeProbeGatewayUrl = "https://api.masterv.example"',
  "runCompileTimeBindingProbe",
  '"cargo"',
  'MASTERV_GATEWAY_BASE_URL: compileTimeProbeGatewayUrl',
  'delete runtimeEnv.MASTERV_GATEWAY_BASE_URL',
  'scripts/desktop-gateway-build-binding-windows.mjs',
  'gateway-build-binding-evidence.json'
]) {
  assert(publishedPreflight.includes(marker), `Published Gateway preflight is not linked to build-binding readiness: ${marker}`);
}
const preflightSyntax = spawnSync(process.execPath, ["--check", publishedPreflightPath], { cwd: root, encoding: "utf8" });
assert.equal(preflightSyntax.status, 0, `Published Gateway preflight syntax failed: ${preflightSyntax.stderr || preflightSyntax.stdout}`);

for (const marker of [
  "Verify published v0.1.4 Gateway configuration preflight",
  "node scripts/desktop-pilot-1-gateway-preflight-windows.mjs",
  "masterv-0.1.4-pilot-1-gateway-preflight",
  "artifacts/desktop-pilot-1-gateway-preflight"
]) {
  assert(ci.includes(marker), `Existing Gateway preflight CI authority marker missing: ${marker}`);
}
assert(!ci.includes("MASTERV_GATEWAY_BASE_URL:"), "PR workflow must not inject Gateway URL globally; binding probe owns an isolated subprocess value");
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
  production_gateway_surface_isolation_ready: true,
  legacy_web_api_enabled_by_default_in_production: false,
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
