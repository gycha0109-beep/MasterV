import assert from "node:assert/strict";
import { createGateway } from "../gateway/core";

async function main() {
  const gateway = createGateway({});

  const rootResponse = await gateway.handle(new Request("https://masterv.local/"));
  assert.equal(rootResponse.status, 404, "Gateway root must not expose a production web/health surface");
  const rootBody = await rootResponse.json() as Record<string, unknown>;
  assert.equal(rootBody.code, "GATEWAY_ROUTE_NOT_FOUND", "Gateway root must fail closed with route-not-found");

  const healthResponse = await gateway.handle(new Request("https://masterv.local/v1/health"));
  assert.equal(healthResponse.status, 200, "Gateway health endpoint must remain available under /v1/health");
  const healthBody = await healthResponse.json() as Record<string, unknown>;
  assert.equal(healthBody.service, "masterv-gateway");
  assert.equal(healthBody.contract_version, "mv-gateway-v1");

  console.log(JSON.stringify({
    status: "MASTERV_GATEWAY_ROOT_SURFACE_CONTRACT_PASS",
    root_status: rootResponse.status,
    health_status: healthResponse.status,
    production_surface: "/v1/*"
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
