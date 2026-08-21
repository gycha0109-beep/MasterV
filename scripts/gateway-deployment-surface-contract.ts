import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { legacyWebApiEnabled, resolveMasterVDeploymentSurface } from "../lib/deployment-surface";

async function main() {
  assert.equal(resolveMasterVDeploymentSurface({ NODE_ENV: "production" }), "gateway");
  assert.equal(resolveMasterVDeploymentSurface({ NODE_ENV: "development" }), "web");
  assert.equal(resolveMasterVDeploymentSurface({ NODE_ENV: "production", MASTERV_DEPLOYMENT_SURFACE: "gateway" }), "gateway");
  assert.equal(resolveMasterVDeploymentSurface({ NODE_ENV: "production", MASTERV_DEPLOYMENT_SURFACE: "web" }), "web");
  assert.equal(legacyWebApiEnabled({ NODE_ENV: "production" }), false);
  assert.equal(legacyWebApiEnabled({ NODE_ENV: "production", MASTERV_DEPLOYMENT_SURFACE: "web" }), true);
  assert.throws(
    () => resolveMasterVDeploymentSurface({ NODE_ENV: "production", MASTERV_DEPLOYMENT_SURFACE: "invalid" }),
    /Invalid MASTERV_DEPLOYMENT_SURFACE/
  );

  const previousNodeEnv = process.env.NODE_ENV;
  const previousSurface = process.env.MASTERV_DEPLOYMENT_SURFACE;
  process.env.NODE_ENV = "production";
  delete process.env.MASTERV_DEPLOYMENT_SURFACE;

  try {
    const [{ proxy }, analyze, discover, interpret] = await Promise.all([
      import("../proxy"),
      import("../app/api/analyze/route"),
      import("../app/api/discover/youtube/route"),
      import("../app/api/interpret-product-truth/route")
    ]);

    const blockedProxyResponse = proxy(new NextRequest("https://api.masterv.example/api/analyze"));
    assert.equal(blockedProxyResponse.status, 404);
    assert.equal(blockedProxyResponse.headers.get("cache-control"), "no-store");
    const blockedProxyBody = await blockedProxyResponse.json();
    assert.equal(blockedProxyBody.service, "masterv-gateway");
    assert.equal(blockedProxyBody.code, "GATEWAY_ROUTE_NOT_FOUND");

    const legacyRequests: Array<[string, (request: Request) => Promise<Response>]> = [
      ["analyze", analyze.POST],
      ["discover", discover.POST],
      ["interpret-product-truth", interpret.POST]
    ];

    for (const [name, handler] of legacyRequests) {
      const response = await handler(new Request(`https://api.masterv.example/api/${name}`, { method: "POST" }));
      assert.equal(response.status, 404, `${name} legacy API must fail closed on production Gateway surface`);
      const body = await response.json();
      assert.equal(body.code, "LEGACY_WEB_API_DISABLED", `${name} legacy API returned unexpected fail-closed code`);
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSurface === undefined) delete process.env.MASTERV_DEPLOYMENT_SURFACE;
    else process.env.MASTERV_DEPLOYMENT_SURFACE = previousSurface;
  }

  console.log(JSON.stringify({
    status: "MASTERV_GATEWAY_DEPLOYMENT_SURFACE_CONTRACT_PASS",
    production_default_surface: "gateway",
    allowed_production_prefix: "/v1/*",
    legacy_web_api_default_enabled_in_production: false,
    legacy_web_api_explicit_override: "MASTERV_DEPLOYMENT_SURFACE=web",
    provider_credentials_received: false,
    provider_calls_executed: false,
    production_deployment_mutation: false
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
