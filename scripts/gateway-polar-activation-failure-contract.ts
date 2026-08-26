import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { GatewayCredentialCodec } from "../gateway/credentials";
import { GatewayError } from "../gateway/errors";
import { PolarGatewayAuthorityProvider } from "../gateway/providers/polar-authority-provider";
import { PolarHttpClient, type PolarFetch } from "../gateway/providers/polar-http-client";

const rawProductKey = "MV-BASIC-TEST-PRODUCT-KEY-SECRET-001";
const accessToken = "polar_test_access_token_secret_001";
const installId = "install-polar-failure-001";
const customerId = "customer-polar-failure-001";
const licenseId = "license-polar-failure-001";
const activationId = "activation-polar-failure-001";
const benefitId = "benefit-polar-failure-001";
const meterId = "meter-polar-failure-001";

const license = Object.freeze({
  id: licenseId,
  customer_id: customerId,
  benefit_id: benefitId,
  status: "granted",
  key: rawProductKey,
  display_key: "MV-****-001",
  limit_activations: 1,
  usage: 0,
  limit_usage: null,
  expires_at: null
});

const activation = Object.freeze({
  id: activationId,
  license_key_id: licenseId,
  label: "MasterV Failure Contract",
  meta: Object.freeze({ masterv_install_id: installId }),
  license_key: license
});

const activationInput = Object.freeze({
  product_key: rawProductKey,
  install_id: installId,
  device_label: "MasterV Failure Contract"
});

function credentials() {
  return new GatewayCredentialCodec({
    secret: "0123456789abcdef0123456789abcdef0123456789abcdef",
    device_ttl_seconds: 3600,
    session_ttl_seconds: 600
  });
}

function authority(fetcher: PolarFetch) {
  return new PolarGatewayAuthorityProvider({
    client: new PolarHttpClient({
      access_token: accessToken,
      organization_id: "org-polar-failure-001",
      base_url: "https://polar.test",
      fetcher
    }),
    credentials: credentials(),
    ai_meter_id: meterId,
    usage_event_name: "masterv_ai_usage",
    plan_metadata_key: "masterv_plan"
  });
}

async function capturedFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    assert.ok(error instanceof GatewayError, "activation failure must remain a GatewayError");
    return error;
  }
  assert.fail("expected activation to fail");
}

function assertSecretSafe(value: string) {
  assert.equal(value.includes(rawProductKey), false, "Product Key must not appear in activation diagnostics");
  assert.equal(value.includes(accessToken), false, "Polar access token must not appear in activation diagnostics");
}

async function activateRejectedContract() {
  let activateCalls = 0;
  let deactivateCalls = 0;
  const fetcher: PolarFetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/v1/license-keys/activate")) {
      activateCalls += 1;
      return Response.json(
        { detail: `Activation limit reached for ${rawProductKey}` },
        { status: 422 }
      );
    }
    if (url.endsWith("/v1/license-keys/deactivate")) {
      deactivateCalls += 1;
      return new Response(null, { status: 204 });
    }
    return Response.json({ detail: "unexpected request" }, { status: 500 });
  };

  const error = await capturedFailure(() => authority(fetcher).activate(activationInput));
  assert.equal(error.code, "POLAR_UPSTREAM_ERROR");
  assert.equal(error.status, 400);
  assert.match(error.message, /\[phase=activate upstream_status=422\]/);
  assert.match(error.message, /\[REDACTED\]/);
  assertSecretSafe(error.message);
  assert.equal(activateCalls, 1, "failed activation must not be retried automatically");
  assert.equal(deactivateCalls, 0, "a rejected activation must not trigger compensation");
}

async function readbackFailureRollbackSuccessContract() {
  let activateCalls = 0;
  let stateCalls = 0;
  let deactivateCalls = 0;
  let deactivatedActivationId = "";

  const fetcher: PolarFetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;

    if (url.endsWith("/v1/license-keys/activate") && method === "POST") {
      activateCalls += 1;
      return Response.json(activation);
    }
    if (url.endsWith(`/v1/customers/${customerId}/state`) && method === "GET") {
      stateCalls += 1;
      return Response.json(
        { detail: `Customer state unavailable for ${rawProductKey}` },
        { status: 503 }
      );
    }
    if (url.endsWith("/v1/license-keys/deactivate") && method === "POST") {
      deactivateCalls += 1;
      assert.equal(body.key, rawProductKey, "compensation must use the in-memory bootstrap Product Key");
      deactivatedActivationId = String(body.activation_id || "");
      return new Response(null, { status: 204 });
    }
    return Response.json({ detail: "unexpected request" }, { status: 500 });
  };

  const error = await capturedFailure(() => authority(fetcher).activate(activationInput));
  assert.equal(error.code, "POLAR_UPSTREAM_ERROR");
  assert.equal(error.status, 502);
  assert.match(error.message, /\[phase=customer_state upstream_status=503\]/);
  assert.match(error.message, /\[activation_rollback=completed\]/);
  assert.match(error.message, /\[REDACTED\]/);
  assertSecretSafe(error.message);
  assert.equal(activateCalls, 1);
  assert.equal(stateCalls, 1);
  assert.equal(deactivateCalls, 1, "post-activation initialization failure must compensate exactly once");
  assert.equal(deactivatedActivationId, activationId, "compensation must target only the newly created activation");
}

async function readbackFailureRollbackFailureContract() {
  let activateCalls = 0;
  let deactivateCalls = 0;

  const fetcher: PolarFetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();

    if (url.endsWith("/v1/license-keys/activate") && method === "POST") {
      activateCalls += 1;
      return Response.json(activation);
    }
    if (url.endsWith(`/v1/customers/${customerId}/state`) && method === "GET") {
      return Response.json({ detail: "Customer state unavailable" }, { status: 503 });
    }
    if (url.endsWith("/v1/license-keys/deactivate") && method === "POST") {
      deactivateCalls += 1;
      return Response.json({ detail: `Rollback rejected for ${rawProductKey}` }, { status: 503 });
    }
    return Response.json({ detail: "unexpected request" }, { status: 500 });
  };

  const error = await capturedFailure(() => authority(fetcher).activate(activationInput));
  assert.equal(error.code, "POLAR_ACTIVATION_ROLLBACK_FAILED");
  assert.equal(error.status, 502);
  assert.match(error.message, /\[root_code=POLAR_UPSTREAM_ERROR rollback_code=POLAR_UPSTREAM_ERROR\]/);
  assertSecretSafe(error.message);
  assert.equal(activateCalls, 1, "rollback failure must never cause automatic reactivation");
  assert.equal(deactivateCalls, 1, "rollback must be attempted once and only once");
}

function desktopSafeDiagnosticContract() {
  const source = fs.readFileSync("desktop/backend/provider-boundary.js", "utf8");
  const context = vm.createContext({ window: {} as Record<string, any> });
  vm.runInContext(source, context, { filename: "provider-boundary.js" });
  const contract = (context.window as any).MASTERV_BACKEND_PROVIDER_CONTRACT;
  assert.ok(contract, "Desktop provider boundary contract must load");

  const provider = contract.createBackendProvider({
    session: {
      configured: () => true,
      openSession: async () => null,
      closeSession: async () => null,
      describeSession: () => null
    },
    workData: {
      configured: () => true,
      bootstrapPersonalWorkspace: async () => null,
      listReferenceLibrary: async () => [],
      fetchReferenceDetail: async () => null,
      deleteReferenceLibraryEntry: async () => null
    },
    remoteOperations: {
      configured: () => true,
      probeCapabilities: async () => null,
      compileReferenceWorkflow: async () => null,
      discoverYouTube: async () => null,
      analyzeYouTube: async () => null,
      generateProductionGuidance: async () => null,
      probeBackgroundBatch: async () => null,
      listBackgroundBatchJobs: async () => [],
      submitBackgroundBatchJob: async () => null,
      checkBackgroundBatchJob: async () => null
    }
  });

  const upstream = provider.formatError(new Error(
    `POLAR_UPSTREAM_ERROR: Polar request failed [phase=activate upstream_status=422]: Activation limit for ${rawProductKey}`
  ));
  assert.match(upstream, /\[phase=activate upstream_status=422\]/);
  assert.equal(upstream.includes("Activation limit"), false, "Desktop must not surface arbitrary upstream detail");
  assertSecretSafe(upstream);

  const rollback = provider.formatError(new Error(
    "POLAR_ACTIVATION_ROLLBACK_FAILED: Polar activation initialization failed and rollback could not be confirmed [root_code=POLAR_UPSTREAM_ERROR rollback_code=POLAR_UPSTREAM_ERROR]."
  ));
  assert.match(rollback, /POLAR_ACTIVATION_ROLLBACK_FAILED/);
  assert.match(rollback, /root_code=POLAR_UPSTREAM_ERROR rollback_code=POLAR_UPSTREAM_ERROR/);
  assert.match(rollback, /다시 시도하지 마세요/);
}

async function main() {
  await activateRejectedContract();
  await readbackFailureRollbackSuccessContract();
  await readbackFailureRollbackFailureContract();
  desktopSafeDiagnosticContract();
  console.log(JSON.stringify({
    status: "MASTERV_GATEWAY_POLAR_ACTIVATION_FAILURE_CONTRACT_PASS",
    activate_rejection_phase_status: true,
    activation_retry_disabled: true,
    post_activation_rollback_verified: true,
    rollback_failure_fail_closed: true,
    product_key_diagnostics_redacted: true,
    desktop_safe_diagnostics_only: true
  }));
}

await main();
