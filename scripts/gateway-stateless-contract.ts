import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createGateway } from "../gateway/core";
import { GATEWAY_USAGE_UNITS, type GatewayDependencies } from "../gateway/contracts";
import type { VideoAnalysis } from "../lib/analysis-schema";

const root = process.cwd();
const gatewayDir = path.join(root, "gateway");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const gatewayFiles = walk(gatewayDir).filter((file) => file.endsWith(".ts"));
assert.ok(gatewayFiles.length >= 7, "gateway source surface is incomplete");
const sourceByPath = new Map(gatewayFiles.map((file) => [path.relative(root, file).replaceAll(path.sep, "/"), fs.readFileSync(file, "utf8")]));
const allGatewaySource = [...sourceByPath.values()].join("\n");

for (const forbidden of [
  "supabase",
  "postgres",
  "postgresql",
  "redis",
  "cloudflare d1",
  "prisma",
  "sqlite",
  "reference_library_entries",
  "background_batch_ledger"
]) {
  assert.equal(allGatewaySource.toLowerCase().includes(forbidden), false, `gateway must remain DB/vendor-storage independent: ${forbidden}`);
}
for (const forbiddenImport of ["node:fs", "node:sqlite", "pg", "@supabase", "ioredis", "redis"]) {
  assert.equal(allGatewaySource.includes(forbiddenImport), false, `gateway must not import persistence dependency: ${forbiddenImport}`);
}

const contracts = sourceByPath.get("gateway/contracts.ts") || "";
for (const required of [
  "GatewayLicenseProvider",
  "GatewayBillingProvider",
  "GatewayAiProvider",
  "GatewayDiscoveryProvider",
  "GatewayCredentialProvider",
  "GatewayEntitlementProvider",
  "GatewayUsageProvider"
]) {
  assert.ok(contracts.includes(required), `gateway provider contract missing: ${required}`);
}
assert.equal(GATEWAY_USAGE_UNITS.discovery, 0);
assert.equal(GATEWAY_USAGE_UNITS.analyze, 5);
assert.equal(GATEWAY_USAGE_UNITS.guidance, 1);

const core = sourceByPath.get("gateway/core.ts") || "";
for (const route of [
  "/v1/license/activate",
  "/v1/session",
  "/v1/entitlement",
  "/v1/discovery",
  "/v1/analyze",
  "/v1/guidance"
]) {
  assert.ok(core.includes(route), `gateway route missing: ${route}`);
}
assert.ok(core.includes("stateless: true"), "gateway must declare stateless architecture");
assert.ok(core.includes("db_less: true"), "gateway must declare DB-less architecture");
assert.ok(core.includes("user_work_data_storage: false"), "gateway must reject central user work-data authority");
assert.ok(core.includes("GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE"), "gateway must fail closed when license provider is absent");
assert.ok(core.includes("GATEWAY_USAGE_PROVIDER_NOT_ACTIVE"), "paid capability must fail closed without usage enforcement");
assert.ok(core.includes("provider_authority: \"gateway-secret\""), "provider secret authority must be Gateway-side");
assert.ok(!core.includes("product_key") && !core.includes("license_key"), "product key must not become a generic bearer credential in Gateway core");

const runtime = sourceByPath.get("gateway/runtime.ts") || "";
assert.ok(runtime.includes("GEMINI_API_KEY"), "Gateway runtime must own Gemini server secret lookup");
assert.ok(runtime.includes("YOUTUBE_DATA_API_KEY"), "Gateway runtime must own YouTube server secret lookup");
assert.ok(!runtime.includes("NEXT_PUBLIC_"), "Gateway secrets must never use public environment variable names");

const minimalAnalysis: VideoAnalysis = {
  summary: "test",
  structure_label: "hook → demo",
  duration_seconds: 4,
  hook: { type: "문제제기", text: "", visual: "", duration_seconds: 1 },
  product_presentation: {
    first_seen_seconds: 1,
    demonstration_present: true,
    before_after_present: false,
    comparison_present: false,
    result_visual_present: false,
    face_present: false,
    hand_present: true
  },
  persuasion: {
    problem: "",
    solution: "",
    benefit: "",
    proof: "",
    social_proof: "",
    offer: "",
    cta: "",
    emotional_trigger: ""
  },
  presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
  transcript: { full: "", segments: [] },
  scenes: [],
  observation_segments: [],
  tags: [],
  confidence_notes: []
};

async function main() {
  let usageAuthorizations = 0;
  let usageRecords = 0;
  let discoveryCalls = 0;
  let analyzeCalls = 0;
  let guidanceCalls = 0;

  const dependencies: GatewayDependencies = {
    credential: {
      async verifySession(credential) {
        if (credential !== "session-test") throw new Error("unexpected credential");
        return {
          subject: "owner:test",
          session_id: "session:test",
          device_id: "device:test",
          customer_id: "customer:test",
          license_id: "license:test",
          activation_id: "activation:test"
        };
      }
    },
    entitlement: {
      async getEntitlement() {
        return {
          license_status: "active",
          subscription_status: "active",
          grace_active: false,
          plan: "TEST",
          owner: false,
          current_period_end: null,
          device_limit: 1,
          usage_remaining: 100,
          capabilities: { discovery: true, analyze: true, guidance: true }
        };
      }
    },
    usage: {
      async authorize(input) {
        usageAuthorizations += 1;
        return { allowed: true, remaining: 100, required_units: input.required_units };
      },
      async record(input) {
        usageRecords += 1;
        return { capability: input.capability, charged_units: input.charged_units, external_id: input.operation_id };
      }
    },
    discovery: {
      async discoverYouTube(query) {
        discoveryCalls += 1;
        return {
          provider: "youtube",
          query,
          candidates: [],
          diagnostics: {
            input_count: 0,
            duration_eligible_count: 0,
            deduped_count: 0,
            shortlisted_count: 0,
            excluded_duration_count: 0,
            excluded_creator_cap_count: 0,
            excluded_duplicate_count: 0,
            youtube_api_requests: 1,
            gemini_requests: 0
          }
        } as never;
      }
    },
    ai: {
      async analyzeYouTube() {
        analyzeCalls += 1;
        return { provider: "gemini", model: "test-model", analysis: minimalAnalysis, derived_metrics: { test: true } };
      },
      async generateProductionGuidance() {
        guidanceCalls += 1;
        return { provider: "none", model: null, guide: { test: true } as never, gemini_requests: 0 };
      }
    }
  };

  const inactive = createGateway({});
  const health = await inactive.handle(new Request("https://api.masterv.example/v1/health"));
  assert.equal(health.status, 200);
  const healthBody = await health.json() as Record<string, any>;
  assert.equal(healthBody.architecture?.stateless, true);
  assert.equal(healthBody.architecture?.db_less, true);
  assert.equal(healthBody.architecture?.user_work_data_storage, false);
  assert.equal(JSON.stringify(healthBody).includes("GEMINI_API_KEY"), false, "health response must not leak secret names");

  const inactiveLicense = await inactive.handle(new Request("https://api.masterv.example/v1/license/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product_key: "must-not-be-echoed", install_id: "test-install" })
  }));
  assert.equal(inactiveLicense.status, 501, "license activation must remain fail-closed when provider is absent");
  const inactiveLicenseText = await inactiveLicense.text();
  assert.equal(inactiveLicenseText.includes("must-not-be-echoed"), false, "product key must never be echoed in gateway errors");

  const active = createGateway(dependencies);
  const unauthorizedAnalyze = await active.handle(new Request("https://api.masterv.example/v1/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://youtu.be/abc12345678" })
  }));
  assert.equal(unauthorizedAnalyze.status, 401, "paid compute must reject missing session credential");
  assert.equal(analyzeCalls, 0, "AI provider must not run before credential validation");

  const authHeaders = { authorization: "Bearer session-test", "content-type": "application/json" };
  const discovery = await active.handle(new Request("https://api.masterv.example/v1/discovery", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ query: "test" })
  }));
  assert.equal(discovery.status, 200);
  assert.equal(discoveryCalls, 1);
  assert.equal(usageAuthorizations, 0, "zero-credit discovery must not consume paid usage authorization");
  assert.equal(usageRecords, 0, "zero-credit discovery must not record paid usage");

  const analyze = await active.handle(new Request("https://api.masterv.example/v1/analyze", {
    method: "POST",
    headers: { ...authHeaders, "x-masterv-request-id": "regression-analyze" },
    body: JSON.stringify({ url: "https://youtu.be/abc12345678" })
  }));
  assert.equal(analyze.status, 200);
  assert.equal(analyzeCalls, 1);
  assert.equal(usageAuthorizations, 1);
  assert.equal(usageRecords, 1);
  const analyzeBody = await analyze.json() as Record<string, any>;
  assert.equal(analyzeBody.provider_authority, "gateway-secret");
  assert.equal(analyzeBody.persistence_authority, "none");
  assert.equal(analyzeBody.usage.charged_units, 5);

  const guidance = await active.handle(new Request("https://api.masterv.example/v1/guidance", {
    method: "POST",
    headers: { ...authHeaders, "x-masterv-request-id": "regression-guidance" },
    body: JSON.stringify({
      analysis: minimalAnalysis,
      product_truth: { product_name: "test", verified_facts: "", target_customer: "", price_offer: "" }
    })
  }));
  assert.equal(guidance.status, 200);
  assert.equal(guidanceCalls, 1);
  assert.equal(usageAuthorizations, 2, "guidance must validate paid entitlement");
  assert.equal(usageRecords, 2, "guidance must record its one-credit operation");
  const guidanceBody = await guidance.json() as Record<string, any>;
  assert.equal(guidanceBody.usage.charged_units, 1);

  console.log(JSON.stringify({
    status: "MASTERV_SUPABASE_EXIT_1C_STATELESS_GATEWAY_PASS",
    gateway_files: gatewayFiles.length,
    central_db_dependencies: 0,
    user_work_data_storage: false,
    absent_license_provider_fail_closed: true,
    session_credential_required: true,
    discovery_credit_units: 0,
    analyze_credit_units: 5,
    guidance_credit_units: 1,
    gemini_secret_authority: "gateway-runtime",
    youtube_secret_authority: "gateway-runtime",
    desktop_wiring_changed: false,
    gateway_stateless_invariant: true
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
