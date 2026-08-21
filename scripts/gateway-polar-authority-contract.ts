import assert from "node:assert/strict";
import { createGateway } from "../gateway/core";
import { GatewayCredentialCodec } from "../gateway/credentials";
import { PolarGatewayAuthorityProvider } from "../gateway/providers/polar-authority-provider";
import { PolarHttpClient, type PolarFetch } from "../gateway/providers/polar-http-client";
import { createGatewayProviderRuntime } from "../gateway/runtime";
import type { VideoAnalysis } from "../lib/analysis-schema";

const installId = "install-test-001";
const customerId = "customer-test-001";
const licenseId = "license-test-001";
const activationId = "activation-test-001";
const benefitId = "benefit-test-001";
const meterId = "meter-ai-test-001";
const rawProductKey = "MV-TEST-PRODUCT-KEY-SECRET";

const license = {
  id: licenseId,
  customer_id: customerId,
  benefit_id: benefitId,
  status: "granted",
  key: rawProductKey,
  display_key: "MV-****-SECRET",
  limit_activations: 3,
  usage: 0,
  limit_usage: null,
  expires_at: "2099-01-01T00:00:00.000Z"
};

let plan = "BASIC";
let meterBalance = 30;
let subscriptionStatus = "active";
let cancelAtPeriodEnd = false;
const requests: Array<{ url: string; method: string; body: any }> = [];
const usageEvents: any[] = [];

const customerState = () => ({
  id: customerId,
  active_subscriptions: plan === "OWNER" ? [] : [{
    id: "subscription-test-001",
    status: subscriptionStatus,
    product_id: "product-test-001",
    current_period_end: "2099-01-01T00:00:00.000Z",
    cancel_at_period_end: cancelAtPeriodEnd
  }],
  granted_benefits: [{
    benefit_id: benefitId,
    benefit_type: "license_keys",
    benefit_metadata: { masterv_plan: plan }
  }],
  active_meters: plan === "OWNER" ? [] : [{
    id: "customer-meter-test-001",
    meter_id: meterId,
    consumed_units: 0,
    credited_units: 30,
    balance: meterBalance
  }]
});

const fetcher: PolarFetch = async (input, init = {}) => {
  const url = String(input);
  const method = String(init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ url, method, body });

  if (url.endsWith("/v1/license-keys/activate") && method === "POST") {
    assert.equal(body.key, rawProductKey, "Polar activation must receive the bootstrap product key server-side");
    assert.equal(body.organization_id, "org-test-001");
    assert.equal(body.meta.masterv_install_id, installId);
    return Response.json({
      id: activationId,
      license_key_id: licenseId,
      label: body.label,
      meta: body.meta,
      license_key: license
    });
  }

  if (url.endsWith(`/v1/license-keys/${licenseId}`) && method === "GET") {
    return Response.json(license);
  }

  if (url.endsWith(`/v1/license-keys/${licenseId}/activations/${activationId}`) && method === "GET") {
    return Response.json({
      id: activationId,
      license_key_id: licenseId,
      label: "MasterV test",
      meta: { masterv_install_id: installId }
    });
  }

  if (url.endsWith(`/v1/customers/${customerId}/state`) && method === "GET") {
    return Response.json(customerState());
  }

  if (url.endsWith("/v1/events/ingest") && method === "POST") {
    usageEvents.push(...body.events);
    return Response.json({ inserted: 1, duplicates: 0 });
  }

  return Response.json({ detail: `Unhandled Polar test request: ${method} ${url}` }, { status: 500 });
};

const client = new PolarHttpClient({
  access_token: "polar-test-access-token",
  organization_id: "org-test-001",
  base_url: "https://polar.test",
  fetcher
});
const credentials = new GatewayCredentialCodec({
  secret: "0123456789abcdef0123456789abcdef0123456789abcdef",
  device_ttl_seconds: 3600,
  session_ttl_seconds: 600
});
const authority = new PolarGatewayAuthorityProvider({
  client,
  credentials,
  ai_meter_id: meterId,
  usage_event_name: "masterv_ai_usage",
  plan_metadata_key: "masterv_plan"
});

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
  observation_segments: [{
    start_seconds: 0,
    end_seconds: 4,
    visual: {
      description: "제품 시연",
      subjects: ["제품"],
      material_types: ["직접촬영", "상품실물"],
      presenter_presence: ["손"],
      subject_role: "판매제품",
      contains_product: true
    },
    action: { type: "제품제시", description: "제품을 보여준다" },
    scene_purpose: "제품 시연",
    message_roles: ["제품소개", "사용시연"],
    spoken_text: "",
    on_screen_text: "",
    claims: [],
    evidence: {
      types: ["직접사용"],
      scope: "판매제품직접",
      supports_selling_product_claim: false,
      observable_result: "",
      result_visually_observable: false
    },
    confidence: "high"
  }],
  tags: [],
  confidence_notes: []
};

let analyzeCalls = 0;
let guidanceCalls = 0;
const gateway = createGateway({
  license: authority,
  billing: authority,
  credential: authority,
  entitlement: authority,
  usage: authority,
  discovery: {
    async discoverYouTube(query) {
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
      return { provider: "gemini", model: "test-model", analysis: minimalAnalysis, derived_metrics: { ok: true } };
    },
    async generateProductionGuidance() {
      guidanceCalls += 1;
      return { provider: "none", model: null, guide: { ok: true } as never, gemini_requests: 0 };
    }
  }
});

async function json(response: Response) {
  return await response.json() as Record<string, any>;
}

async function main() {
  const activationResponse = await gateway.handle(new Request("https://api.masterv.example/v1/license/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      product_key: rawProductKey,
      install_id: installId,
      device_label: "MasterV Test Device"
    })
  }));
  assert.equal(activationResponse.status, 200);
  const activationBody = await json(activationResponse);
  const activationText = JSON.stringify(activationBody);
  assert.equal(activationText.includes(rawProductKey), false, "bootstrap product key must never be returned by MasterV Gateway");

  const deviceCredential = activationBody.result.device_credential as string;
  const initialSession = activationBody.result.session_credential as string;
  assert.ok(deviceCredential && initialSession, "activation must issue device and short-lived session credentials");
  const devicePayload = JSON.parse(Buffer.from(deviceCredential.split(".")[0], "base64url").toString("utf8"));
  const sessionPayload = JSON.parse(Buffer.from(initialSession.split(".")[0], "base64url").toString("utf8"));
  assert.equal(devicePayload.kind, "device");
  assert.equal(sessionPayload.kind, "session");
  assert.equal(JSON.stringify(devicePayload).includes(rawProductKey), false, "device credential must not contain the product key");
  assert.equal(JSON.stringify(sessionPayload).includes(rawProductKey), false, "session credential must not contain the product key");
  assert.equal(devicePayload.license_id, licenseId);
  assert.equal(devicePayload.activation_id, activationId);
  assert.equal(devicePayload.customer_id, customerId);
  assert.equal(devicePayload.device_id, installId);

  const missingDeviceSession = await gateway.handle(new Request("https://api.masterv.example/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  }));
  assert.equal(missingDeviceSession.status, 401, "session refresh must require a device credential");

  const sessionResponse = await gateway.handle(new Request("https://api.masterv.example/v1/session", {
    method: "POST",
    headers: {
      authorization: `Bearer ${deviceCredential}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ install_id: installId })
  }));
  assert.equal(sessionResponse.status, 200);
  const sessionBody = await json(sessionResponse);
  const sessionCredential = sessionBody.result.session_credential as string;
  assert.ok(sessionCredential);
  assert.equal(JSON.stringify(sessionBody).includes(rawProductKey), false, "session refresh must not return the product key");

  const entitlementResponse = await gateway.handle(new Request("https://api.masterv.example/v1/entitlement", {
    headers: { authorization: `Bearer ${sessionCredential}` }
  }));
  assert.equal(entitlementResponse.status, 200);
  const entitlementBody = await json(entitlementResponse);
  assert.equal(entitlementBody.entitlement.plan, "BASIC");
  assert.equal(entitlementBody.entitlement.license_status, "active");
  assert.equal(entitlementBody.entitlement.subscription_status, "active");
  assert.equal(entitlementBody.entitlement.usage_remaining, 30);
  assert.equal(entitlementBody.entitlement.capabilities.analyze, true);

  const analyzeResponse = await gateway.handle(new Request("https://api.masterv.example/v1/analyze", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionCredential}`,
      "content-type": "application/json",
      "x-masterv-request-id": "req-analysis-001"
    },
    body: JSON.stringify({ url: "https://youtu.be/abc12345678" })
  }));
  assert.equal(analyzeResponse.status, 200);
  const analyzeBody = await json(analyzeResponse);
  assert.equal(analyzeCalls, 1);
  assert.equal(analyzeBody.request_id, "req-analysis-001");
  assert.equal(analyzeBody.usage.charged_units, 5, "Deep Analysis must charge five MasterV credits");
  assert.equal(usageEvents.at(-1).external_id, "masterv:req-analysis-001:analyze");
  assert.equal(usageEvents.at(-1).metadata.units, 5);

  const guidanceResponse = await gateway.handle(new Request("https://api.masterv.example/v1/guidance", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionCredential}`,
      "content-type": "application/json",
      "x-masterv-request-id": "req-guidance-001"
    },
    body: JSON.stringify({
      analysis: minimalAnalysis,
      product_truth: { product_name: "test", verified_facts: "", target_customer: "", price_offer: "" }
    })
  }));
  assert.equal(guidanceResponse.status, 200);
  const guidanceBody = await json(guidanceResponse);
  assert.equal(guidanceCalls, 1);
  assert.equal(guidanceBody.usage.charged_units, 1, "Production Guidance must charge one MasterV credit even when no Gemini call is required");
  assert.equal(usageEvents.at(-1).external_id, "masterv:req-guidance-001:guidance");
  assert.equal(usageEvents.at(-1).metadata.units, 1);

  const eventsBeforeDenial = usageEvents.length;
  meterBalance = 4;
  const deniedAnalyze = await gateway.handle(new Request("https://api.masterv.example/v1/analyze", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionCredential}`,
      "content-type": "application/json",
      "x-masterv-request-id": "req-analysis-denied"
    },
    body: JSON.stringify({ url: "https://youtu.be/abc12345678" })
  }));
  assert.equal(deniedAnalyze.status, 402, "insufficient Polar meter balance must block paid compute");
  assert.equal(analyzeCalls, 1, "AI provider must not execute after usage denial");
  assert.equal(usageEvents.length, eventsBeforeDenial, "denied usage must not be recorded");

  meterBalance = 30;
  subscriptionStatus = "past_due";
  const graceEntitlement = await authority.getEntitlement(await authority.verifySession(sessionCredential));
  assert.equal(graceEntitlement.subscription_status, "past_due");
  assert.equal(graceEntitlement.grace_active, true);
  assert.equal(graceEntitlement.license_status, "active");
  assert.equal(graceEntitlement.capabilities.analyze, true, "recoverable past_due must remain usable while Polar license grant remains active");

  subscriptionStatus = "active";
  plan = "OWNER";
  const ownerEntitlement = await authority.getEntitlement(await authority.verifySession(sessionCredential));
  assert.equal(ownerEntitlement.owner, true);
  assert.equal(ownerEntitlement.usage_remaining, null);
  const ownerDecision = await authority.authorize({
    principal: await authority.verifySession(sessionCredential),
    entitlement: ownerEntitlement,
    capability: "analyze",
    required_units: 5
  });
  assert.equal(ownerDecision.allowed, true);
  const ownerEventsBefore = usageEvents.length;
  const ownerReceipt = await authority.record({
    principal: await authority.verifySession(sessionCredential),
    entitlement: ownerEntitlement,
    capability: "analyze",
    charged_units: 5,
    operation_id: "owner-operation"
  });
  assert.equal(ownerReceipt.charged_units, 0, "OWNER license must not consume metered credit");
  assert.equal(usageEvents.length, ownerEventsBefore);

  const tampered = `${sessionCredential.slice(0, -1)}${sessionCredential.endsWith("a") ? "b" : "a"}`;
  const tamperedResponse = await gateway.handle(new Request("https://api.masterv.example/v1/entitlement", {
    headers: { authorization: `Bearer ${tampered}` }
  }));
  assert.equal(tamperedResponse.status, 401, "tampered signed session credential must be rejected");

  assert.throws(
    () => createGatewayProviderRuntime({ POLAR_ACCESS_TOKEN: "partial-only" }),
    /requires POLAR_ACCESS_TOKEN, POLAR_ORGANIZATION_ID, and GATEWAY_CREDENTIAL_SIGNING_SECRET together/
  );
  const configuredRuntime = createGatewayProviderRuntime({
    POLAR_ACCESS_TOKEN: "token",
    POLAR_ORGANIZATION_ID: "org",
    GATEWAY_CREDENTIAL_SIGNING_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef",
    POLAR_AI_METER_ID: meterId
  });
  assert.ok(configuredRuntime.license);
  assert.ok(configuredRuntime.credential);
  assert.ok(configuredRuntime.entitlement);
  assert.ok(configuredRuntime.usage);
  assert.strictEqual(configuredRuntime.license, configuredRuntime.credential, "one stateless Polar authority must back license and credential boundaries");
  assert.strictEqual(configuredRuntime.entitlement, configuredRuntime.usage, "one stateless Polar authority must back entitlement and usage boundaries");

  const postActivationProductKeyCalls = requests
    .filter((request) => !request.url.endsWith("/v1/license-keys/activate"))
    .some((request) => JSON.stringify(request.body).includes(rawProductKey));
  assert.equal(postActivationProductKeyCalls, false, "post-activation Polar calls must not transmit the product key");

  console.log(JSON.stringify({
    status: "MASTERV_SUPABASE_EXIT_1D_PRODUCT_KEY_POLAR_PASS",
    bootstrap_product_key_only: true,
    device_credential_signed: true,
    session_credential_short_lived: true,
    polar_license_revalidation: true,
    polar_activation_revalidation: true,
    polar_customer_state_authority: true,
    deep_analysis_credit_units: 5,
    production_guidance_credit_units: 1,
    youtube_discovery_credit_units: 0,
    usage_event_idempotency_key: true,
    past_due_grace_preserved: true,
    owner_unlimited: true,
    central_masterv_db: false,
    desktop_wiring_changed: false,
    live_polar_credentials_used: false
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
