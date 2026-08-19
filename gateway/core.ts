import type {
  GatewayCapability,
  GatewayDependencies,
  GatewayEntitlement,
  GatewayPrincipal
} from "./contracts";
import { asGatewayError, GatewayError } from "./errors";
import { normalizeAnalyzeInput, normalizeDiscoveryInput, normalizeGuidanceInput } from "./input";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
});

const GATEWAY_CONTRACT_VERSION = "mv-gateway-v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function bodyObject(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new GatewayError(400, "GATEWAY_INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function bearerCredential(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]?.trim()) throw new GatewayError(401, "GATEWAY_SESSION_REQUIRED", "A session credential is required.");
  return match[1].trim();
}

async function authorize(
  request: Request,
  dependencies: GatewayDependencies,
  capability: GatewayCapability
): Promise<{ principal: GatewayPrincipal; entitlement: GatewayEntitlement }> {
  if (!dependencies.credential) throw new GatewayError(503, "GATEWAY_SESSION_PROVIDER_NOT_ACTIVE", "Session validation is not active yet.");
  if (!dependencies.entitlement) throw new GatewayError(503, "GATEWAY_ENTITLEMENT_PROVIDER_NOT_ACTIVE", "Entitlement validation is not active yet.");

  const principal = await dependencies.credential.verifySession(bearerCredential(request));
  const entitlement = await dependencies.entitlement.getEntitlement(principal);
  if (entitlement.license_status !== "active") throw new GatewayError(403, "GATEWAY_LICENSE_INACTIVE", "The license is not active.");
  if (!entitlement.capabilities[capability]) throw new GatewayError(403, "GATEWAY_CAPABILITY_DENIED", `Capability is not available: ${capability}`);

  if (capability !== "discovery") {
    if (!dependencies.usage) throw new GatewayError(503, "GATEWAY_USAGE_PROVIDER_NOT_ACTIVE", "Usage enforcement is not active yet.");
    const decision = await dependencies.usage.authorize({ principal, entitlement, capability });
    if (!decision.allowed) throw new GatewayError(402, "GATEWAY_USAGE_DENIED", decision.reason || "Usage allowance is exhausted.");
  }

  return { principal, entitlement };
}

async function recordUsage(dependencies: GatewayDependencies, principal: GatewayPrincipal, capability: GatewayCapability, chargedUnits: number) {
  if (capability === "discovery" || chargedUnits <= 0) return null;
  if (!dependencies.usage) throw new GatewayError(503, "GATEWAY_USAGE_PROVIDER_NOT_ACTIVE", "Usage accounting is not active yet.");
  return await dependencies.usage.record({ principal, capability, charged_units: chargedUnits });
}

export function createGateway(dependencies: GatewayDependencies = {}) {
  const frozenDependencies = Object.freeze({ ...dependencies });

  async function handle(request: Request): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
      const url = new URL(request.url);

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/v1/health")) {
        return json({
          service: "masterv-gateway",
          contract_version: GATEWAY_CONTRACT_VERSION,
          architecture: { stateless: true, db_less: true, user_work_data_storage: false },
          routes: {
            license_activate: "/v1/license/activate",
            session: "/v1/session",
            entitlement: "/v1/entitlement",
            discovery: "/v1/discovery",
            analyze: "/v1/analyze",
            guidance: "/v1/guidance"
          },
          providers: {
            license: Boolean(frozenDependencies.license),
            credential: Boolean(frozenDependencies.credential),
            entitlement: Boolean(frozenDependencies.entitlement),
            usage: Boolean(frozenDependencies.usage),
            ai: Boolean(frozenDependencies.ai),
            discovery: Boolean(frozenDependencies.discovery)
          }
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/license/activate") {
        if (!frozenDependencies.license) throw new GatewayError(501, "GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE", "License activation is reserved for EXIT-1D.");
        return json({ service: "masterv-gateway", contract_version: GATEWAY_CONTRACT_VERSION, result: await frozenDependencies.license.activate(await bodyObject(request)) });
      }

      if (request.method === "POST" && url.pathname === "/v1/session") {
        if (!frozenDependencies.license) throw new GatewayError(501, "GATEWAY_LICENSE_PROVIDER_NOT_ACTIVE", "Session issuance is reserved for EXIT-1D.");
        return json({ service: "masterv-gateway", contract_version: GATEWAY_CONTRACT_VERSION, result: await frozenDependencies.license.createSession(await bodyObject(request)) });
      }

      if (request.method === "GET" && url.pathname === "/v1/entitlement") {
        if (!frozenDependencies.credential || !frozenDependencies.entitlement) throw new GatewayError(503, "GATEWAY_ENTITLEMENT_PROVIDER_NOT_ACTIVE", "Entitlement validation is reserved for EXIT-1D activation.");
        const principal = await frozenDependencies.credential.verifySession(bearerCredential(request));
        return json({ service: "masterv-gateway", contract_version: GATEWAY_CONTRACT_VERSION, entitlement: await frozenDependencies.entitlement.getEntitlement(principal) });
      }

      if (request.method === "POST" && url.pathname === "/v1/discovery") {
        if (!frozenDependencies.discovery) throw new GatewayError(503, "GATEWAY_DISCOVERY_PROVIDER_NOT_CONFIGURED", "Discovery provider is not configured.");
        const { principal } = await authorize(request, frozenDependencies, "discovery");
        const input = normalizeDiscoveryInput(await bodyObject(request));
        const result = await frozenDependencies.discovery.discoverYouTube(input.query, input.options);
        return json({
          service: "masterv-gateway",
          contract_version: GATEWAY_CONTRACT_VERSION,
          operation: "discovery",
          provider: result.provider,
          provider_authority: "gateway-secret",
          persistence_authority: "none",
          subject: principal.subject,
          query: result.query,
          candidates: result.candidates,
          diagnostics: result.diagnostics
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/analyze") {
        if (!frozenDependencies.ai) throw new GatewayError(503, "GATEWAY_AI_PROVIDER_NOT_CONFIGURED", "AI provider is not configured.");
        const { principal } = await authorize(request, frozenDependencies, "analyze");
        const input = normalizeAnalyzeInput(await bodyObject(request));
        const result = await frozenDependencies.ai.analyzeYouTube(input.source.canonical_url);
        const usage = await recordUsage(frozenDependencies, principal, "analyze", 1);
        return json({
          service: "masterv-gateway",
          contract_version: GATEWAY_CONTRACT_VERSION,
          operation: "analyze",
          provider: result.provider,
          provider_authority: "gateway-secret",
          compute_authority: "gateway",
          persistence_authority: "none",
          model: result.model,
          source: {
            platform: input.source.platform,
            source_id: input.source.source_id,
            url: input.source.canonical_url,
            requested_url: input.requested_url
          },
          analysis: result.analysis,
          derived_metrics: result.derived_metrics,
          usage
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/guidance") {
        if (!frozenDependencies.ai) throw new GatewayError(503, "GATEWAY_AI_PROVIDER_NOT_CONFIGURED", "AI provider is not configured.");
        const { principal } = await authorize(request, frozenDependencies, "guidance");
        const input = normalizeGuidanceInput(await bodyObject(request));
        const result = await frozenDependencies.ai.generateProductionGuidance(input);
        const usage = await recordUsage(frozenDependencies, principal, "guidance", result.gemini_requests > 0 ? 1 : 0);
        return json({
          service: "masterv-gateway",
          contract_version: GATEWAY_CONTRACT_VERSION,
          operation: "guidance",
          provider: result.provider,
          provider_authority: result.provider === "gemini" ? "gateway-secret" : "none",
          compute_authority: "gateway",
          product_truth_authority: "user-input-raw",
          reference_analysis_authority: "request-transit-only",
          persistence_authority: "none",
          model: result.model,
          guide: result.guide,
          diagnostics: { gemini_requests: result.gemini_requests, persistence_writes: 0 },
          usage
        });
      }

      throw new GatewayError(404, "GATEWAY_ROUTE_NOT_FOUND", "Gateway route not found.");
    } catch (error) {
      const normalized = asGatewayError(error);
      return json({
        service: "masterv-gateway",
        contract_version: GATEWAY_CONTRACT_VERSION,
        error: normalized.message,
        code: normalized.code
      }, normalized.status);
    }
  }

  return Object.freeze({
    contract_version: GATEWAY_CONTRACT_VERSION,
    architecture: Object.freeze({ stateless: true, db_less: true, user_work_data_storage: false }),
    handle
  });
}
