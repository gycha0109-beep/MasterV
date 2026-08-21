import assert from "node:assert/strict";
import { readMasterVRuntimeConfig, resolveMasterVRuntimeUrl, runtimeApiHeaders } from "../lib/runtime-api";

const web = readMasterVRuntimeConfig({});
assert.deepEqual(web, { surface: "web", api_base_url: null });
assert.equal(resolveMasterVRuntimeUrl("/api/analyze", web), "/api/analyze");

const desktop = readMasterVRuntimeConfig({ NEXT_PUBLIC_MASTERV_SURFACE: "desktop" });
assert.deepEqual(desktop, { surface: "desktop", api_base_url: null });
assert.equal(resolveMasterVRuntimeUrl("api/analyze", desktop), "/api/analyze");

assert.deepEqual(runtimeApiHeaders(), {});
assert.deepEqual(runtimeApiHeaders({ access_token: " session-token ", content_type: "application/json" }), {
  Authorization: "Bearer session-token",
  "Content-Type": "application/json"
});

console.log(JSON.stringify({
  status: "RUNTIME_API_CLEAN_CUT_CONTRACT_PASS",
  web_relative_api_preserved: true,
  desktop_public_hosted_api_config: false,
  publishable_key_header: false
}));
