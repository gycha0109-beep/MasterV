import assert from "node:assert/strict";
import {
  readMasterVRuntimeConfig,
  resolveMasterVRuntimeUrl,
  runtimeApiHeaders
} from "../lib/runtime-api";

const web = readMasterVRuntimeConfig({});
assert.deepEqual(web, { surface: "web", api_base_url: null });
assert.equal(resolveMasterVRuntimeUrl("/api/analyze", web), "/api/analyze");

const desktop = readMasterVRuntimeConfig({
  NEXT_PUBLIC_MASTERV_SURFACE: "desktop",
  NEXT_PUBLIC_MASTERV_API_BASE_URL: "https://example.supabase.co/functions/v1/"
});
assert.equal(desktop.surface, "desktop");
assert.equal(desktop.api_base_url, "https://example.supabase.co/functions/v1");
assert.equal(
  resolveMasterVRuntimeUrl("masterv-api-boundary", desktop),
  "https://example.supabase.co/functions/v1/masterv-api-boundary"
);

assert.throws(
  () => readMasterVRuntimeConfig({ NEXT_PUBLIC_MASTERV_SURFACE: "desktop" }),
  /API_BASE_URL/
);
assert.throws(
  () => readMasterVRuntimeConfig({ NEXT_PUBLIC_MASTERV_API_BASE_URL: "file:///tmp/api" }),
  /http\/https/
);

assert.deepEqual(runtimeApiHeaders(), {});
assert.deepEqual(
  runtimeApiHeaders({ access_token: " user-jwt ", publishable_key: " sb_publishable_test ", content_type: "application/json" }),
  {
    Authorization: "Bearer user-jwt",
    apikey: "sb_publishable_test",
    "Content-Type": "application/json"
  }
);

console.log(JSON.stringify({
  status: "RUNTIME_API_CONTRACT_PASS",
  web_relative_api_preserved: true,
  desktop_remote_api_required: true,
  auth_headers_supported: true
}));
