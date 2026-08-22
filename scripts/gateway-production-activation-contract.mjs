import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const requiredSecretPresence = [
  "polar_access_token_present",
  "polar_organization_id_present",
  "gateway_credential_signing_secret_present",
  "polar_ai_meter_id_present",
  "gemini_api_key_present",
  "youtube_data_api_key_present"
];
const forbiddenSecretValueKeys = [
  "POLAR_ACCESS_TOKEN",
  "POLAR_ORGANIZATION_ID",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "POLAR_AI_METER_ID",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
];
const requiredProviders = ["license", "billing", "credential", "entitlement", "usage", "ai", "discovery"];

function runNode(relative) {
  const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${relative} failed:\n${result.stderr || result.stdout || result.error}`);
}

function canonicalGatewayOrigin(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("CANONICAL_GATEWAY_ORIGIN_REQUIRED");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("CANONICAL_GATEWAY_ORIGIN_INVALID");
  }
  if (url.protocol !== "https:") throw new Error("CANONICAL_GATEWAY_ORIGIN_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("CANONICAL_GATEWAY_ORIGIN_USERINFO_FORBIDDEN");
  if (url.port) throw new Error("CANONICAL_GATEWAY_ORIGIN_PORT_FORBIDDEN");
  if (url.pathname !== "/") throw new Error("CANONICAL_GATEWAY_ORIGIN_PATH_FORBIDDEN");
  if (url.search) throw new Error("CANONICAL_GATEWAY_ORIGIN_QUERY_FORBIDDEN");
  if (url.hash) throw new Error("CANONICAL_GATEWAY_ORIGIN_FRAGMENT_FORBIDDEN");

  const host = url.hostname.toLowerCase();
  if (!host.startsWith("api.masterv.") || host.length <= "api.masterv.".length) {
    throw new Error("CANONICAL_GATEWAY_ORIGIN_MASTER_V_HOST_REQUIRED");
  }
  for (const suffix of ["vercel.app", "workers.dev", "r2.dev", "supabase.co"]) {
    if (host === suffix || host.endsWith(`.${suffix}`)) throw new Error("CANONICAL_GATEWAY_ORIGIN_VENDOR_HOST_FORBIDDEN");
  }
  for (const suffix of ["example", "test", "invalid", "localhost"]) {
    if (host === suffix || host.endsWith(`.${suffix}`)) throw new Error("CANONICAL_GATEWAY_ORIGIN_RESERVED_HOST_FORBIDDEN");
  }
  return url.origin;
}

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function containsSecretValueKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSecretValueKey);
  return Object.entries(value).some(([key, child]) => forbiddenSecretValueKeys.includes(key) || containsSecretValueKey(child));
}

function validateDescriptor(value) {
  const errors = [];
  const plane = typeof value?.hosting_plane === "string" ? value.hosting_plane.trim() : "";
  if (!plane || plane.toLowerCase() === "unresolved") errors.push("HOSTING_PLANE_UNRESOLVED");
  if (typeof value?.hosting_project_reference !== "string" || !value.hosting_project_reference.trim()) errors.push("HOSTING_PROJECT_REFERENCE_REQUIRED");
  try {
    canonicalGatewayOrigin(value?.canonical_gateway_origin);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "CANONICAL_GATEWAY_ORIGIN_INVALID");
  }
  if (!validSha(value?.accepted_main_sha)) errors.push("ACCEPTED_MAIN_SHA_INVALID");
  if (!validSha(value?.deployment_source_sha)) errors.push("DEPLOYMENT_SOURCE_SHA_INVALID");
  if (validSha(value?.accepted_main_sha) && validSha(value?.deployment_source_sha) && value.accepted_main_sha !== value.deployment_source_sha) {
    errors.push("DEPLOYMENT_SOURCE_SHA_NOT_ACCEPTED_MAIN");
  }
  if (value?.production_surface !== "gateway-only") errors.push("PRODUCTION_SURFACE_NOT_GATEWAY_ONLY");
  if (value?.production_web_override_allowed !== false) errors.push("PRODUCTION_WEB_OVERRIDE_MUST_BE_FALSE");
  if (value?.stateless !== true) errors.push("GATEWAY_STATELESS_REQUIRED");
  if (value?.db_less !== true) errors.push("GATEWAY_DB_LESS_REQUIRED");
  if (value?.central_application_db_present !== false) errors.push("CENTRAL_APPLICATION_DB_MUST_BE_FALSE");
  if (value?.user_work_data_storage !== false) errors.push("USER_WORK_DATA_STORAGE_MUST_BE_FALSE");
  for (const key of requiredSecretPresence) {
    if (value?.server_secret_presence?.[key] !== true) errors.push(`SERVER_PRESENCE_REQUIRED:${key}`);
  }
  if (value?.polar_product_authority_readiness?.plan_metadata_ready !== true) errors.push("POLAR_PLAN_METADATA_NOT_READY");
  if (value?.polar_product_authority_readiness?.usage_meter_ready !== true) errors.push("POLAR_USAGE_METER_NOT_READY");
  if (value?.polar_product_authority_readiness?.usage_event_authority_ready !== true) errors.push("POLAR_USAGE_EVENT_AUTHORITY_NOT_READY");
  if (value?.explicit_production_mutation_approval !== true) errors.push("PRODUCTION_MUTATION_APPROVAL_REQUIRED");
  if (value?.secret_values_embedded !== false) errors.push("SECRET_VALUES_EMBEDDED_MUST_BE_FALSE");
  if (containsSecretValueKey(value)) errors.push("SECRET_VALUE_KEY_FORBIDDEN");
  return { ok: errors.length === 0, errors };
}

function validatePostDeployment(value) {
  const errors = [];
  try {
    canonicalGatewayOrigin(value?.canonical_gateway_origin);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "CANONICAL_GATEWAY_ORIGIN_INVALID");
  }
  if (!validSha(value?.accepted_main_sha)) errors.push("POST_DEPLOYMENT_ACCEPTED_MAIN_SHA_INVALID");
  if (!validSha(value?.deployment_source_sha)) errors.push("POST_DEPLOYMENT_SOURCE_SHA_INVALID");
  if (validSha(value?.accepted_main_sha) && validSha(value?.deployment_source_sha) && value.accepted_main_sha !== value.deployment_source_sha) {
    errors.push("POST_DEPLOYMENT_SOURCE_SHA_NOT_ACCEPTED_MAIN");
  }
  if (typeof value?.hosting_project_reference !== "string" || !value.hosting_project_reference.trim()) errors.push("POST_DEPLOYMENT_PROJECT_REFERENCE_REQUIRED");
  if (typeof value?.deployment_reference !== "string" || !value.deployment_reference.trim()) errors.push("POST_DEPLOYMENT_DEPLOYMENT_REFERENCE_REQUIRED");
  if (value?.production_surface !== "gateway-only") errors.push("POST_DEPLOYMENT_SURFACE_NOT_GATEWAY_ONLY");
  if (value?.health_http_status !== 200) errors.push("POST_DEPLOYMENT_HEALTH_STATUS_INVALID");
  if (value?.options_http_status !== 204) errors.push("POST_DEPLOYMENT_OPTIONS_STATUS_INVALID");
  if (value?.health?.service !== "masterv-gateway") errors.push("POST_DEPLOYMENT_SERVICE_INVALID");
  if (value?.health?.contract_version !== "mv-gateway-v1") errors.push("POST_DEPLOYMENT_CONTRACT_VERSION_INVALID");
  if (value?.health?.architecture?.stateless !== true) errors.push("POST_DEPLOYMENT_STATELESS_REQUIRED");
  if (value?.health?.architecture?.db_less !== true) errors.push("POST_DEPLOYMENT_DB_LESS_REQUIRED");
  if (value?.health?.architecture?.user_work_data_storage !== false) errors.push("POST_DEPLOYMENT_USER_WORK_STORAGE_MUST_BE_FALSE");
  for (const provider of requiredProviders) {
    if (value?.health?.providers?.[provider] !== true) errors.push(`POST_DEPLOYMENT_PROVIDER_NOT_READY:${provider}`);
  }
  for (const [route, status] of Object.entries(value?.rejected_routes ?? {})) {
    if (!["root", "legacy_analyze", "legacy_discovery", "legacy_product_truth"].includes(route)) continue;
    if (status !== 404) errors.push(`POST_DEPLOYMENT_REJECTED_ROUTE_INVALID:${route}`);
  }
  for (const route of ["root", "legacy_analyze", "legacy_discovery", "legacy_product_truth"]) {
    if (value?.rejected_routes?.[route] !== 404) errors.push(`POST_DEPLOYMENT_REJECTED_ROUTE_REQUIRED:${route}`);
  }
  if (value?.rejected_route_provider_execution !== false) errors.push("POST_DEPLOYMENT_REJECTED_ROUTE_PROVIDER_EXECUTION_MUST_BE_FALSE");
  if (value?.secret_values_embedded !== false) errors.push("POST_DEPLOYMENT_SECRET_VALUES_EMBEDDED_MUST_BE_FALSE");
  if (containsSecretValueKey(value)) errors.push("POST_DEPLOYMENT_SECRET_VALUE_KEY_FORBIDDEN");
  return { ok: errors.length === 0, errors };
}

runNode("scripts/gateway-production-readiness-contract.mjs");

const paths = {
  doc: "docs/architecture/MV-PILOT-1B-GATEWAY-PRODUCTION-ACTIVATION-CONTRACT.md",
  predecessor: "docs/architecture/MV-PILOT-1A-GATEWAY-PRODUCTION-READINESS.md",
  runtime: "gateway/runtime.ts",
  polar: "gateway/providers/polar-authority-provider.ts",
  core: "gateway/core.ts",
  env: "gateway/.env.example",
  route: "app/v1/[...segments]/route.ts",
  surface: "lib/deployment-surface.ts",
  proxy: "proxy.ts",
  ci: ".github/workflows/ci.yml"
};
for (const relative of Object.values(paths)) assert(exists(relative), `MV-PILOT-1B dependency missing: ${relative}`);

const doc = read(paths.doc);
const predecessor = read(paths.predecessor);
const runtime = read(paths.runtime);
const polar = read(paths.polar);
const core = read(paths.core);
const envExample = read(paths.env);
const route = read(paths.route);
const surface = read(paths.surface);
const proxy = read(paths.proxy);
const ci = read(paths.ci);

for (const marker of [
  "ACTIVATION_CONTRACT != PRODUCTION_MUTATION_AUTHORITY",
  "VERCEL_MASTERV_PROJECT = NOT_FOUND_READ_ONLY_2026_08_22",
  "HOSTING_PLANE = UNRESOLVED",
  "CANONICAL_GATEWAY_HOSTNAME = UNRESOLVED",
  "https://api.masterv.<domain>",
  "SECRET_VALUE_IN_ACTIVATION_EVIDENCE = FORBIDDEN",
  "deployment_source_sha == accepted_main_sha",
  "POLAR_AI_METER_ID = PRESENT_SERVER_SIDE",
  "GATEWAY_PLAN_NOT_CONFIGURED",
  "GATEWAY_USAGE_METER_NOT_CONFIGURED",
  "PRODUCTION_DEPLOYMENT_SURFACE = GATEWAY_ONLY",
  "providers.discovery = true",
  "Gateway deployment approval does not imply signing or release-publication approval.",
  "PRODUCTION_GATEWAY_ACTIVATION_AUTHORIZED = FALSE",
  "MV_PILOT_1B = ACTIVATION_CONTRACT_FROZEN",
  "MV_PILOT_1 = BLOCKED_PENDING_EXPLICIT_PRODUCTION_GATEWAY_ACTIVATION"
]) assert(doc.includes(marker), `MV-PILOT-1B authority marker missing: ${marker}`);

for (const marker of [
  "GATEWAY_SERVERLESS_SURFACE = READY",
  "PRODUCTION_WEB_OVERRIDE_ALLOWED = FALSE",
  "PUBLISHED_V0_1_4_GATEWAY_CONFIGURED = FALSE",
  "Gateway production deployment"
]) assert(predecessor.includes(marker), `MV-PILOT-1A predecessor marker missing: ${marker}`);

for (const name of ["POLAR_ACCESS_TOKEN", "POLAR_ORGANIZATION_ID", "GATEWAY_CREDENTIAL_SIGNING_SECRET", "POLAR_AI_METER_ID", "GEMINI_API_KEY", "YOUTUBE_DATA_API_KEY"]) {
  assert(envExample.includes(`${name}=`), `Gateway env template missing ${name}`);
}
for (const marker of [
  "if (polarConfiguredValues > 0 && polarConfiguredValues < 3)",
  "Polar authority requires POLAR_ACCESS_TOKEN, POLAR_ORGANIZATION_ID, and GATEWAY_CREDENTIAL_SIGNING_SECRET together.",
  "ai_meter_id: env.POLAR_AI_METER_ID",
  "api_key: geminiKey",
  "new YouTubeDiscoveryGatewayProvider(youtubeKey)"
]) assert(runtime.includes(marker), `Gateway runtime activation marker missing: ${marker}`);
for (const marker of [
  "GATEWAY_PLAN_NOT_CONFIGURED",
  "if (!entitlement.owner && !this.aiMeterId)",
  "GATEWAY_USAGE_METER_NOT_CONFIGURED",
  "GATEWAY_LICENSE_INACTIVE",
  "AI credit balance is insufficient."
]) assert(polar.includes(marker), `Polar fail-closed marker missing: ${marker}`);
for (const marker of [
  'service: "masterv-gateway"',
  'architecture: { stateless: true, db_less: true, user_work_data_storage: false }',
  'license: Boolean(frozenDependencies.license)',
  'billing: Boolean(frozenDependencies.billing)',
  'credential: Boolean(frozenDependencies.credential)',
  'entitlement: Boolean(frozenDependencies.entitlement)',
  'usage: Boolean(frozenDependencies.usage)',
  'ai: Boolean(frozenDependencies.ai)',
  'discovery: Boolean(frozenDependencies.discovery)'
]) assert(core.includes(marker), `Gateway health marker missing: ${marker}`);
assert(route.includes("createGateway(createGatewayProviderRuntime(process.env))"));
assert(surface.includes('throw new Error("MasterV production deployment surface must be gateway")'));
for (const marker of ['pathname === "/v1" || pathname.startsWith("/v1/")', 'code: "GATEWAY_ROUTE_NOT_FOUND"', "status: 404"]) {
  assert(proxy.includes(marker), `Production proxy marker missing: ${marker}`);
}

assert.equal(canonicalGatewayOrigin("https://api.masterv.example.com"), "https://api.masterv.example.com");
for (const origin of [
  "http://api.masterv.example.com",
  "https://masterv.example.com",
  "https://api.masterv.example",
  "https://api.masterv.test",
  "https://api.masterv.invalid",
  "https://api.masterv.vercel.app",
  "https://api.masterv.workers.dev",
  "https://api.masterv.r2.dev",
  "https://api.masterv.supabase.co",
  "https://user:pass@api.masterv.example.com",
  "https://api.masterv.example.com:8443",
  "https://api.masterv.example.com/v1",
  "https://api.masterv.example.com?x=1",
  "https://api.masterv.example.com#fragment"
]) assert.throws(() => canonicalGatewayOrigin(origin), undefined, `Forbidden production origin accepted: ${origin}`);

const startingSha = "19881cdf2a0e7f3a23b2263a5f588c2f134e9896";
const current = validateDescriptor({
  hosting_plane: "UNRESOLVED",
  hosting_project_reference: "",
  canonical_gateway_origin: "https://api.masterv.example",
  accepted_main_sha: startingSha,
  deployment_source_sha: startingSha,
  production_surface: "gateway-only",
  production_web_override_allowed: false,
  stateless: true,
  db_less: true,
  central_application_db_present: false,
  user_work_data_storage: false,
  server_secret_presence: Object.fromEntries(requiredSecretPresence.map((key) => [key, false])),
  polar_product_authority_readiness: { plan_metadata_ready: false, usage_meter_ready: false, usage_event_authority_ready: false },
  explicit_production_mutation_approval: false,
  secret_values_embedded: false
});
assert.equal(current.ok, false);
for (const blocker of ["HOSTING_PLANE_UNRESOLVED", "HOSTING_PROJECT_REFERENCE_REQUIRED", "CANONICAL_GATEWAY_ORIGIN_RESERVED_HOST_FORBIDDEN", "PRODUCTION_MUTATION_APPROVAL_REQUIRED"]) {
  assert(current.errors.includes(blocker), `Current activation blocker missing: ${blocker}`);
}

const syntheticSha = "a".repeat(40);
const resolved = {
  hosting_plane: "synthetic-production-host",
  hosting_project_reference: "synthetic-masterv-gateway-project",
  canonical_gateway_origin: "https://api.masterv.example.com",
  accepted_main_sha: syntheticSha,
  deployment_source_sha: syntheticSha,
  production_surface: "gateway-only",
  production_web_override_allowed: false,
  stateless: true,
  db_less: true,
  central_application_db_present: false,
  user_work_data_storage: false,
  server_secret_presence: Object.fromEntries(requiredSecretPresence.map((key) => [key, true])),
  polar_product_authority_readiness: { plan_metadata_ready: true, usage_meter_ready: true, usage_event_authority_ready: true },
  explicit_production_mutation_approval: true,
  secret_values_embedded: false
};
assert.deepEqual(validateDescriptor(resolved), { ok: true, errors: [] });
const mismatched = validateDescriptor({ ...resolved, deployment_source_sha: "b".repeat(40) });
assert(mismatched.errors.includes("DEPLOYMENT_SOURCE_SHA_NOT_ACCEPTED_MAIN"));

const postDeployment = {
  canonical_gateway_origin: "https://api.masterv.example.com",
  accepted_main_sha: syntheticSha,
  deployment_source_sha: syntheticSha,
  hosting_project_reference: "synthetic-masterv-gateway-project",
  deployment_reference: "synthetic-deployment-id",
  production_surface: "gateway-only",
  health_http_status: 200,
  options_http_status: 204,
  health: {
    service: "masterv-gateway",
    contract_version: "mv-gateway-v1",
    architecture: { stateless: true, db_less: true, user_work_data_storage: false },
    providers: Object.fromEntries(requiredProviders.map((key) => [key, true]))
  },
  rejected_routes: { root: 404, legacy_analyze: 404, legacy_discovery: 404, legacy_product_truth: 404 },
  rejected_route_provider_execution: false,
  secret_values_embedded: false
};
assert.deepEqual(validatePostDeployment(postDeployment), { ok: true, errors: [] });
const incomplete = validatePostDeployment({
  ...postDeployment,
  health: { ...postDeployment.health, providers: { ...postDeployment.health.providers, usage: false } }
});
assert(incomplete.errors.includes("POST_DEPLOYMENT_PROVIDER_NOT_READY:usage"));

for (const forbidden of [
  "POLAR_ACCESS_TOKEN: ${{ secrets.",
  "POLAR_ORGANIZATION_ID: ${{ secrets.",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET: ${{ secrets.",
  "GEMINI_API_KEY: ${{ secrets.",
  "YOUTUBE_DATA_API_KEY: ${{ secrets.",
  "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.",
  "gh release create",
  "gh release upload",
  "gh release edit"
]) assert(!ci.includes(forbidden), `PR CI regained production authority: ${forbidden}`);
for (const credential of forbiddenSecretValueKeys) {
  assert.equal(process.env[credential], undefined, `MV-PILOT-1B deterministic contract received credential: ${credential}`);
}

const workflowDir = path.join(root, ".github", "workflows");
const automaticPrWorkflows = fs.readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .filter((name) => {
    const text = read(path.join(".github/workflows", name));
    return /^\s*pull_request\s*:/m.test(text) || /^\s*pull_request\s*$/m.test(text);
  })
  .sort();
assert.deepEqual(automaticPrWorkflows, ["ci.yml", "mv-exit-3-clean-cut.yml"]);

console.log(JSON.stringify({
  status: "MASTERV_PILOT_1B_GATEWAY_PRODUCTION_ACTIVATION_CONTRACT_PASS",
  predecessor_gateway_readiness_green: true,
  canonical_production_gateway_origin_contract_ready: true,
  exact_source_deployment_gate_ready: true,
  full_pilot_server_presence_contract_ready: true,
  polar_product_authority_readiness_contract_ready: true,
  post_deployment_acceptance_schema_ready: true,
  current_hosting_plane: "UNRESOLVED",
  current_canonical_gateway_hostname: "UNRESOLVED",
  current_activation_descriptor_valid: current.ok,
  current_activation_blockers: current.errors,
  synthetic_future_activation_descriptor_valid: true,
  production_gateway_activation_authorized: false,
  production_gateway_deployment_executed: false,
  production_secret_mutation_executed: false,
  polar_production_mutation_executed: false,
  production_signing_authorized: false,
  release_publication_authorized: false,
  external_human_pilot_authorized: false,
  target: "BLOCKED_PENDING_EXPLICIT_PRODUCTION_GATEWAY_ACTIVATION",
  automatic_pr_workflows: automaticPrWorkflows
}));
