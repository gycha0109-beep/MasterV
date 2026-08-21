import assert from "node:assert/strict";

async function main() {
  for (const name of [
    "POLAR_ACCESS_TOKEN",
    "POLAR_ORGANIZATION_ID",
    "GATEWAY_CREDENTIAL_SIGNING_SECRET",
    "GEMINI_API_KEY",
    "YOUTUBE_DATA_API_KEY"
  ]) {
    assert.equal(process.env[name], undefined, `Serverless surface contract must not receive credential: ${name}`);
  }

  const route = await import("../app/v1/[...segments]/route");

  assert.equal(route.runtime, "nodejs");
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.POST, "function");
  assert.equal(typeof route.OPTIONS, "function");

  const health = await route.GET(new Request("https://api.masterv.example/v1/health"));
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  const healthBody = await health.json() as any;
  assert.equal(healthBody.service, "masterv-gateway");
  assert.equal(healthBody.contract_version, "mv-gateway-v1");
  assert.deepEqual(healthBody.architecture, {
    stateless: true,
    db_less: true,
    user_work_data_storage: false
  });
  assert.deepEqual(healthBody.routes, {
    license_activate: "/v1/license/activate",
    session: "/v1/session",
    entitlement: "/v1/entitlement",
    discovery: "/v1/discovery",
    analyze: "/v1/analyze",
    guidance: "/v1/guidance"
  });
  assert.deepEqual(healthBody.providers, {
    license: false,
    billing: false,
    credential: false,
    entitlement: false,
    usage: false,
    ai: false,
    discovery: false
  });

  const options = await route.OPTIONS(new Request("https://api.masterv.example/v1/health", { method: "OPTIONS" }));
  assert.equal(options.status, 204);

  const inactiveActivation = await route.POST(new Request("https://api.masterv.example/v1/license/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product_key: "synthetic-contract-only", install_id: "synthetic-contract-only" })
  }));
  assert.equal(inactiveActivation.status, 501);
  const inactiveBody = await inactiveActivation.json() as any;
  assert.equal(inactiveBody.code, "GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE");

  console.log(JSON.stringify({
    status: "MASTERV_GATEWAY_SERVERLESS_SURFACE_CONTRACT_PASS",
    route_surface: "/v1/*",
    runtime: "nodejs",
    stateless: true,
    db_less: true,
    provider_credentials_received: false,
    provider_calls_executed: false,
    production_deployment_mutation: false
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
