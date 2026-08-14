import assert from "node:assert/strict";
import { signInWithPassword } from "../lib/supabase-auth";

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const email = process.env.SUPABASE_TEST_EMAIL?.trim();
const password = process.env.SUPABASE_TEST_PASSWORD;

assert.ok(projectUrl, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
assert.ok(email, "SUPABASE_TEST_EMAIL is required");
assert.ok(password, "SUPABASE_TEST_PASSWORD is required");
assert.equal(process.env.GEMINI_API_KEY, undefined, "GEMINI_API_KEY must not be present");
assert.equal(process.env.YOUTUBE_DATA_API_KEY, undefined, "YOUTUBE_DATA_API_KEY must not be present");

const config = { project_url: projectUrl, publishable_key: publishableKey };
const session = await signInWithPassword(config, email, password);
const response = await fetch(`${projectUrl}/functions/v1/masterv-api-boundary`, {
  method: "GET",
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${session.access_token}`
  }
});

const body = await response.json() as {
  service?: string;
  contract_version?: string;
  authenticated?: boolean;
  capabilities?: Record<string, boolean>;
};

assert.equal(response.status, 200);
assert.equal(body.service, "masterv-hosted-api");
assert.equal(body.contract_version, "mv-hosted-api-v1");
assert.equal(body.authenticated, true);
assert.equal(body.capabilities?.boundary_probe, true);
assert.equal(body.capabilities?.analyze, false);
assert.equal(body.capabilities?.youtube_discovery, false);

console.log(JSON.stringify({
  status: "HOSTED_API_BOUNDARY_SMOKE_PASS",
  authenticated: true,
  boundary_probe: true,
  analyze_migrated: false,
  youtube_discovery_migrated: false,
  gemini_requests_executed: 0,
  youtube_requests_executed: 0
}));
