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

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function denoPilotOrigin(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("DENO_PILOT_ORIGIN_REQUIRED");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("DENO_PILOT_ORIGIN_INVALID");
  }
  if (url.protocol !== "https:") throw new Error("DENO_PILOT_ORIGIN_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("DENO_PILOT_ORIGIN_USERINFO_FORBIDDEN");
  if (url.port) throw new Error("DENO_PILOT_ORIGIN_PORT_FORBIDDEN");
  if (url.pathname !== "/") throw new Error("DENO_PILOT_ORIGIN_PATH_FORBIDDEN");
  if (url.search) throw new Error("DENO_PILOT_ORIGIN_QUERY_FORBIDDEN");
  if (url.hash) throw new Error("DENO_PILOT_ORIGIN_FRAGMENT_FORBIDDEN");
  const labels = url.hostname.toLowerCase().split(".");
  if (labels.length < 4 || labels.at(-2) !== "deno" || labels.at(-1) !== "net") {
    throw new Error("DENO_PILOT_ORIGIN_HOST_REQUIRED");
  }
  return url.origin;
}

function validateLaunchDescriptor(value) {
  const errors = [];
  if (value?.hosting_plane !== "deno-deploy-free") errors.push("DENO_HOSTING_PLANE_REQUIRED");
  if (typeof value?.hosting_app_reference !== "string" || !value.hosting_app_reference.trim()) errors.push("DENO_APP_REFERENCE_REQUIRED");
  try {
    denoPilotOrigin(value?.gateway_origin);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "DENO_PILOT_ORIGIN_INVALID");
  }
  if (!validSha(value?.accepted_main_sha)) errors.push("ACCEPTED_MAIN_SHA_INVALID");
  if (!validSha(value?.deployment_source_sha)) errors.push("DEPLOYMENT_SOURCE_SHA_INVALID");
  if (validSha(value?.accepted_main_sha) && validSha(value?.deployment_source_sha) && value.accepted_main_sha !== value.deployment_source_sha) {
    errors.push("DEPLOYMENT_SOURCE_SHA_NOT_ACCEPTED_MAIN");
  }
  if (value?.vendor_hostname_exception !== true) errors.push("DENO_VENDOR_HOSTNAME_EXCEPTION_REQUIRED");
  if (value?.custom_domain_present !== false) errors.push("ZERO_COST_PILOT_CUSTOM_DOMAIN_MUST_BE_FALSE");
  if (value?.production_surface !== "gateway-only") errors.push("PILOT_SURFACE_NOT_GATEWAY_ONLY");
  if (value?.stateless !== true) errors.push("GATEWAY_STATELESS_REQUIRED");
  if (value?.db_less !== true) errors.push("GATEWAY_DB_LESS_REQUIRED");
  if (value?.central_application_db_present !== false) errors.push("CENTRAL_APPLICATION_DB_MUST_BE_FALSE");
  if (value?.user_work_data_storage !== false) errors.push("USER_WORK_DATA_STORAGE_MUST_BE_FALSE");
  if (value?.explicit_deployment_approval !== true) errors.push("DENO_DEPLOYMENT_APPROVAL_REQUIRED");
  if (value?.secret_values_embedded !== false) errors.push("SECRET_VALUES_EMBEDDED_MUST_BE_FALSE");
  return { ok: errors.length === 0, errors };
}

runNode("scripts/gateway-production-activation-contract.mjs");

const paths = {
  doc: "docs/architecture/MV-PILOT-1C-ZERO-COST-DENO-GATEWAY-LAUNCH-READINESS.md",
  denoConfig: "deno.json",
  denoServer: "gateway/deno-server.ts",
  runtime: "gateway/runtime.ts",
  core: "gateway/core.ts",
  predecessor: "docs/architecture/MV-PILOT-1B-GATEWAY-PRODUCTION-ACTIVATION-CONTRACT.md"
};
for (const relative of Object.values(paths)) assert(exists(relative), `MV-PILOT-1C dependency missing: ${relative}`);

const doc = read(paths.doc);
const denoConfigText = read(paths.denoConfig);
const denoServer = read(paths.denoServer);
const runtime = read(paths.runtime);
const core = read(paths.core);
const predecessor = read(paths.predecessor);
const denoConfig = JSON.parse(denoConfigText);

for (const marker of [
  "ZERO_COST_PILOT_HOSTING_PLANE = DENO_DEPLOY_FREE",
  "VERCEL = VALID_FALLBACK_NOT_SELECTED",
  "CUSTOM_DOMAIN_PURCHASE_REQUIRED = FALSE",
  "ZERO_COST_PILOT_VENDOR_HOSTNAME_EXCEPTION = TEMPORARILY_ALLOWED",
  "EXCEPTION_SCOPE = ZERO_COST_EXTERNAL_PILOT_ONLY",
  "TARGET_ARCHITECTURE_INV_9 = TEMPORARILY_DEVIATED",
  "TARGET_ARCHITECTURE_INV_9_FINAL_CLOSURE = DEFERRED",
  "CUSTOM_DOMAIN_MIGRATION = REQUIRED_BEFORE_FINAL_INV_9_CLOSURE",
  "entrypoint = ./gateway/deno-server.ts",
  "GATEWAY_STATELESS = TRUE",
  "GATEWAY_DB_LESS = TRUE",
  "MASTERV_CENTRAL_APPLICATION_DB = NONE",
  "USER_WORK_DATA_AUTHORITY = LOCAL_SQLITE",
  "DENO_DEPLOYMENT = NOT_EXECUTED",
  "DENO_SECRET_REGISTRATION = NOT_EXECUTED",
  "MV_PILOT_1C = ZERO_COST_DENO_LAUNCH_READINESS_FROZEN",
  "EXTERNAL_HUMAN_PILOT = BLOCKED_PENDING_ZERO_COST_GATEWAY_DEPLOYMENT"
]) assert(doc.includes(marker), `MV-PILOT-1C authority marker missing: ${marker}`);

for (const marker of [
  "ACTIVATION_CONTRACT != PRODUCTION_MUTATION_AUTHORITY",
  "https://api.masterv.<domain>",
  "PRODUCTION_GATEWAY_ACTIVATION_AUTHORIZED = FALSE"
]) assert(predecessor.includes(marker), `MV-PILOT-1B predecessor marker missing: ${marker}`);

assert.equal(denoConfig.nodeModulesDir, "auto", "Deno npm compatibility must use automatic node_modules materialization");
assert.deepEqual(denoConfig.unstable, ["sloppy-imports"], "Deno pilot compatibility must explicitly scope extension inference to sloppy-imports");
assert.equal(denoConfig.deploy?.runtime?.type, "dynamic", "Deno pilot must use dynamic API runtime");
assert.equal(denoConfig.deploy?.runtime?.entrypoint, "./gateway/deno-server.ts", "Deno pilot must deploy only the Gateway entrypoint");
assert.equal(denoConfig.deploy?.framework, undefined, "Deno pilot must not deploy the repository Next.js surface");
assert.equal(denoConfig.deploy?.build, undefined, "Deno Gateway pilot does not require a web build command");
assert.equal(denoConfig.deploy?.predeploy, undefined, "Deno Gateway pilot must not gain migration/predeploy mutation authority");

for (const marker of [
  'import { createGateway } from "./core"',
  'import { createGatewayProviderRuntime } from "./runtime"',
  'throw new Error("DENO_RUNTIME_REQUIRED")',
  "createGateway(createGatewayProviderRuntime(deno.env.toObject()))",
  "deno.serve((request) => gateway.handle(request))"
]) assert(denoServer.includes(marker), `Deno Gateway adapter marker missing: ${marker}`);

for (const forbidden of ["Deno.openKv", "Deno.Kv", "DATABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_"]) {
  assert(!denoServer.includes(forbidden), `Deno adapter gained forbidden persistence/public config: ${forbidden}`);
  assert(!denoConfigText.includes(forbidden), `Deno config gained forbidden persistence/public config: ${forbidden}`);
}

for (const marker of [
  "POLAR_ACCESS_TOKEN",
  "POLAR_ORGANIZATION_ID",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "POLAR_AI_METER_ID",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY"
]) assert(runtime.includes(marker), `Gateway runtime lost server-only provider setting: ${marker}`);

for (const marker of [
  'architecture: { stateless: true, db_less: true, user_work_data_storage: false }',
  'service: "masterv-gateway"'
]) assert(core.includes(marker), `Gateway architecture marker missing: ${marker}`);

assert.equal(denoPilotOrigin("https://masterv-gateway.example-org.deno.net"), "https://masterv-gateway.example-org.deno.net");
for (const origin of [
  "http://masterv-gateway.example-org.deno.net",
  "https://deno.net",
  "https://masterv.deno.net",
  "https://masterv-gateway.example-org.deno.net/v1",
  "https://masterv-gateway.example-org.deno.net?x=1",
  "https://masterv-gateway.example-org.deno.net#fragment",
  "https://user:pass@masterv-gateway.example-org.deno.net",
  "https://masterv-gateway.example-org.deno.net:8443",
  "https://masterv-gateway.vercel.app",
  "https://masterv-gateway.workers.dev",
  "https://localhost"
]) assert.throws(() => denoPilotOrigin(origin), undefined, `Forbidden zero-cost pilot origin accepted: ${origin}`);

const acceptedMain = "d53435724e7c75b165914b6858a746118ea5441b";
const current = validateLaunchDescriptor({
  hosting_plane: "deno-deploy-free",
  hosting_app_reference: "",
  gateway_origin: "",
  accepted_main_sha: acceptedMain,
  deployment_source_sha: acceptedMain,
  vendor_hostname_exception: true,
  custom_domain_present: false,
  production_surface: "gateway-only",
  stateless: true,
  db_less: true,
  central_application_db_present: false,
  user_work_data_storage: false,
  explicit_deployment_approval: false,
  secret_values_embedded: false
});
assert.equal(current.ok, false, "Current pre-deployment state must remain fail closed");
for (const blocker of ["DENO_APP_REFERENCE_REQUIRED", "DENO_PILOT_ORIGIN_REQUIRED", "DENO_DEPLOYMENT_APPROVAL_REQUIRED"]) {
  assert(current.errors.includes(blocker), `Current Deno launch blocker missing: ${blocker}`);
}

const synthetic = validateLaunchDescriptor({
  hosting_plane: "deno-deploy-free",
  hosting_app_reference: "synthetic-app-reference",
  gateway_origin: "https://masterv-gateway.example-org.deno.net",
  accepted_main_sha: acceptedMain,
  deployment_source_sha: acceptedMain,
  vendor_hostname_exception: true,
  custom_domain_present: false,
  production_surface: "gateway-only",
  stateless: true,
  db_less: true,
  central_application_db_present: false,
  user_work_data_storage: false,
  explicit_deployment_approval: true,
  secret_values_embedded: false
});
assert.deepEqual(synthetic, { ok: true, errors: [] }, "Synthetic fully resolved Deno pilot descriptor must pass");

const mismatch = validateLaunchDescriptor({
  hosting_plane: "deno-deploy-free",
  hosting_app_reference: "synthetic-app-reference",
  gateway_origin: "https://masterv-gateway.example-org.deno.net",
  accepted_main_sha: acceptedMain,
  deployment_source_sha: "410eea191f914c1db9cbde869715482ecaca749d",
  vendor_hostname_exception: true,
  custom_domain_present: false,
  production_surface: "gateway-only",
  stateless: true,
  db_less: true,
  central_application_db_present: false,
  user_work_data_storage: false,
  explicit_deployment_approval: true,
  secret_values_embedded: false
});
assert(mismatch.errors.includes("DEPLOYMENT_SOURCE_SHA_NOT_ACCEPTED_MAIN"), "Deno deployment must remain exact-SHA bound");

for (const forbiddenCredential of [
  "POLAR_ACCESS_TOKEN",
  "POLAR_ORGANIZATION_ID",
  "GATEWAY_CREDENTIAL_SIGNING_SECRET",
  "POLAR_AI_METER_ID",
  "GEMINI_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
]) assert.equal(process.env[forbiddenCredential], undefined, `MV-PILOT-1C deterministic CI must not receive credential: ${forbiddenCredential}`);

console.log(JSON.stringify({
  status: "MASTERV_PILOT_1C_ZERO_COST_DENO_LAUNCH_READINESS_PASS",
  accepted_main: acceptedMain,
  hosting_plane: "deno-deploy-free",
  custom_domain_purchase_required: false,
  vendor_hostname_exception: "zero-cost-external-pilot-only",
  target_architecture_inv_9_final_closure: "deferred",
  deno_gateway_runtime_adapter_ready: true,
  deno_deploy_config_as_code_ready: true,
  deno_import_compatibility: "sloppy-imports",
  deno_deployment_authorized: false,
  deno_deployment_executed: false,
  deno_secret_registration_executed: false,
  production_signing_authorized: false,
  release_publication_authorized: false,
  external_human_pilot: "blocked-pending-zero-cost-gateway-deployment"
}));