import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SearchOptions } from "@/lib/discovery";
import { validateVideoAnalysis } from "@/lib/analysis-validation";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import { deriveVideoMetrics } from "@/lib/derived-metrics";
import { normalizeGeminiError } from "@/lib/gemini-error";
import { canonicalizeYouTubeSource } from "@/lib/source-identity";
import type { ProductTruthInput } from "@masterv/single-video-production";
import { compileSingleVideoProductionGuide } from "@masterv/single-video-production";
import {
  DEFAULT_PRODUCT_TRUTH_MODEL,
  interpretProductTruthAgainstReferenceWithKey
} from "@masterv/product-truth-interpreter-core";
import { compareVideoAnalyses } from "@masterv/reference-compare";
import { compileEvidenceRules } from "@masterv/evidence-rules";
import {
  analyzeYouTubeVideoWithKey,
  DEFAULT_DEEP_GEMINI_MODEL
} from "@masterv/gemini-deep-core";
import {
  discoverYouTubeCandidatesWithKey,
  YouTubeDiscoveryError
} from "@masterv/youtube-discovery-core";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const MAX_REFERENCE_SELECTION = 8;
const MAX_DISCOVERY_QUERY_LENGTH = 200;
const MAX_DEEP_ANALYSIS_URL_LENGTH = 500;
const PRODUCT_TRUTH_KEYS = new Set(["product_name", "verified_facts", "target_customer", "price_offer"]);
const PRODUCT_TRUTH_LIMITS = {
  product_name: 160,
  verified_facts: 4000,
  target_customer: 500,
  price_offer: 500
} as const;
const DISCOVERY_OPTION_KEYS = new Set([
  "max_results",
  "shortlist_limit",
  "min_duration_seconds",
  "max_duration_seconds",
  "published_after",
  "region_code",
  "relevance_language",
  "max_per_creator"
]);
const DISCOVERY_NUMBER_KEYS = new Set([
  "max_results",
  "shortlist_limit",
  "min_duration_seconds",
  "max_duration_seconds",
  "max_per_creator"
]);
const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"]);
const CONFIG_REASONS = new Set(["keyInvalid", "accessNotConfigured", "ipRefererBlocked"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authenticatedUserId(req: Request) {
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payloadPart = token.split(".")[1];
  if (!payloadPart) throw new Error("Authenticated JWT payload is missing");
  const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const payload = JSON.parse(atob(padded)) as { sub?: unknown };
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("Authenticated JWT subject is missing");
  }
  return payload.sub.trim();
}

function normalizedSourceIds(value: unknown) {
  if (!Array.isArray(value)) throw new Error("source_ids must be an array");
  const sourceIds = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (sourceIds.some((item) => !item)) throw new Error("source_ids must contain non-empty strings");
  if (sourceIds.length < 2) throw new Error("reference workflow requires at least 2 source_ids");
  if (sourceIds.length > MAX_REFERENCE_SELECTION) throw new Error(`reference workflow supports at most ${MAX_REFERENCE_SELECTION} source_ids`);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("source_ids must be unique");
  return sourceIds;
}

function normalizedDiscoveryInput(body: { query?: unknown; options?: unknown }) {
  if (typeof body.query !== "string") throw new Error("query must be a string");
  const query = body.query.trim();
  if (!query) throw new Error("query must not be empty");
  if (query.length > MAX_DISCOVERY_QUERY_LENGTH) throw new Error(`query must be at most ${MAX_DISCOVERY_QUERY_LENGTH} characters`);

  if (body.options === undefined) return { query, options: {} as SearchOptions };
  if (!body.options || typeof body.options !== "object" || Array.isArray(body.options)) {
    throw new Error("options must be an object");
  }

  const options = body.options as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (!DISCOVERY_OPTION_KEYS.has(key)) throw new Error(`unsupported discovery option: ${key}`);
  }

  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    if (DISCOVERY_NUMBER_KEYS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
      normalized[key] = value;
      continue;
    }
    if (typeof value !== "string") throw new Error(`${key} must be a string`);
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (key === "region_code" && !/^[A-Za-z]{2}$/.test(trimmed)) throw new Error("region_code must be a 2-letter code");
    if (key === "relevance_language" && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(trimmed)) throw new Error("relevance_language is invalid");
    if (key === "published_after" && Number.isNaN(Date.parse(trimmed))) throw new Error("published_after must be a valid date-time");
    normalized[key] = trimmed;
  }
  return { query, options: normalized as SearchOptions };
}

function normalizedDeepAnalysisInput(body: { url?: unknown }) {
  if (typeof body.url !== "string") throw new Error("url must be a string");
  const requestedUrl = body.url.trim();
  if (!requestedUrl) throw new Error("url must not be empty");
  if (requestedUrl.length > MAX_DEEP_ANALYSIS_URL_LENGTH) throw new Error(`url must be at most ${MAX_DEEP_ANALYSIS_URL_LENGTH} characters`);
  const source = canonicalizeYouTubeSource(requestedUrl);
  return { requestedUrl, source };
}

function normalizedProductionGuidanceInput(body: { analysis?: unknown; product_truth?: unknown }) {
  if (!body.analysis || typeof body.analysis !== "object" || Array.isArray(body.analysis)) {
    throw new Error("analysis must be an object");
  }
  const analysis = validateVideoAnalysis(body.analysis as VideoAnalysis);

  if (!body.product_truth || typeof body.product_truth !== "object" || Array.isArray(body.product_truth)) {
    throw new Error("product_truth must be an object");
  }
  const raw = body.product_truth as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!PRODUCT_TRUTH_KEYS.has(key)) throw new Error(`unsupported product_truth field: ${key}`);
  }

  const productTruth = {} as ProductTruthInput;
  for (const key of PRODUCT_TRUTH_KEYS) {
    const value = raw[key] ?? "";
    if (typeof value !== "string") throw new Error(`product_truth.${key} must be a string`);
    const limit = PRODUCT_TRUTH_LIMITS[key as keyof typeof PRODUCT_TRUTH_LIMITS];
    if (value.length > limit) throw new Error(`product_truth.${key} must be at most ${limit} characters`);
    productTruth[key as keyof Omit<ProductTruthInput, "interpretation">] = value;
  }
  return { analysis, productTruth };
}

async function loadReference(req: Request, workspaceId: string, sourceId: string) {
  const authorization = req.headers.get("authorization")?.trim();
  const apikey = req.headers.get("apikey")?.trim();
  if (!authorization || !apikey) throw new Error("Authenticated Supabase headers are required");

  const params = new URLSearchParams();
  params.set("select", "source_id,canonical_url,label,analysis");
  params.set("workspace_id", `eq.${workspaceId}`);
  params.set("source_id", `eq.${sourceId}`);
  params.set("limit", "1");

  const projectOrigin = new URL(req.url).origin;
  const response = await fetch(`${projectOrigin}/rest/v1/reference_library_entries?${params.toString()}`, {
    method: "GET",
    headers: { authorization, apikey, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Reference Library read failed (${response.status})`);
  const rows = await response.json() as Array<{
    source_id?: string;
    canonical_url?: string;
    label?: string;
    analysis?: unknown;
  }>;
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.analysis) {
    throw new Error(`Reference not found or missing analysis: ${sourceId}`);
  }
  return rows[0];
}

async function compileReferenceWorkflow(req: Request, body: { source_ids?: unknown }) {
  let userId: string;
  let sourceIds: string[];
  try {
    userId = authenticatedUserId(req);
    sourceIds = normalizedSourceIds(body.source_ids);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  const workspaceId = `user:${userId}`;
  try {
    const rows = await Promise.all(sourceIds.map((sourceId) => loadReference(req, workspaceId, sourceId)));
    const comparison = compareVideoAnalyses(rows.map((row) => ({
      id: row.source_id!,
      label: row.label,
      url: row.canonical_url,
      analysis: row.analysis as never
    })));
    const evidenceRules = compileEvidenceRules(comparison);

    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      operation: "reference_workflow",
      source_ids: sourceIds,
      compiler: { comparison: "canonical", evidence: "canonical", generated_at: "deterministic" },
      authority: { workspace: "jwt-derived", persistence: "user-jwt-rls" },
      comparison,
      evidence_rules: evidenceRules
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 422);
  }
}

async function discoverYouTube(body: { query?: unknown; options?: unknown }) {
  let input: ReturnType<typeof normalizedDiscoveryInput>;
  try {
    input = normalizedDiscoveryInput(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "YOUTUBE_DISCOVERY_INVALID_REQUEST" }, 400);
  }

  const apiKey = Deno.env.get("YOUTUBE_DATA_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    return json({ error: "YouTube Discovery API is not configured in hosted runtime.", code: "YOUTUBE_DISCOVERY_NOT_CONFIGURED" }, 503);
  }

  try {
    const result = await discoverYouTubeCandidatesWithKey(input.query, input.options, { api_key: apiKey });
    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      operation: "youtube_discovery",
      provider: result.provider,
      provider_authority: "hosted-secret",
      analysis_authority: "metadata-only",
      query: result.query,
      candidates: result.candidates,
      diagnostics: result.diagnostics
    });
  } catch (error) {
    if (error instanceof YouTubeDiscoveryError) {
      const status = error.reason && QUOTA_REASONS.has(error.reason)
        ? 429
        : error.reason && CONFIG_REASONS.has(error.reason)
          ? 503
          : 502;
      return json({
        error: error.message,
        code: status === 429 ? "YOUTUBE_DISCOVERY_QUOTA" : "YOUTUBE_DISCOVERY_UPSTREAM",
        reason: error.reason
      }, status);
    }
    return json({ error: error instanceof Error ? error.message : String(error), code: "YOUTUBE_DISCOVERY_FAILED" }, 500);
  }
}

async function analyzeYouTubeDeep(req: Request, body: { url?: unknown }) {
  try {
    authenticatedUserId(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "DEEP_ANALYSIS_UNAUTHENTICATED" }, 401);
  }

  let input: ReturnType<typeof normalizedDeepAnalysisInput>;
  try {
    input = normalizedDeepAnalysisInput(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "DEEP_ANALYSIS_INVALID_REQUEST" }, 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    return json({ error: "Deep Analysis is not configured in hosted runtime.", code: "DEEP_ANALYSIS_NOT_CONFIGURED" }, 503);
  }
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_DEEP_GEMINI_MODEL;

  try {
    const analysis = await analyzeYouTubeVideoWithKey(input.source.canonical_url, { api_key: apiKey, model });
    const derivedMetrics = deriveVideoMetrics(analysis);
    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      operation: "youtube_deep_analysis",
      provider: "gemini",
      provider_authority: "hosted-secret",
      compute_authority: "hosted-deep-analysis",
      analysis_tier: "deep",
      persistence_authority: "none",
      model,
      source: {
        platform: input.source.platform,
        source_id: input.source.source_id,
        url: input.source.canonical_url,
        requested_url: input.requestedUrl
      },
      analysis,
      derived_metrics: derivedMetrics,
      diagnostics: { gemini_requests: 1, persistence_writes: 0 }
    });
  } catch (error) {
    const normalized = normalizeGeminiError(error);
    if (normalized.is_rate_limit) {
      return json({
        error: normalized.message,
        code: "GEMINI_RATE_LIMIT",
        rate_limit: normalized.diagnostic
      }, 429);
    }
    return json({ error: normalized.message, code: "DEEP_ANALYSIS_UPSTREAM" }, 502);
  }
}

async function compileProductionGuidance(req: Request, body: { analysis?: unknown; product_truth?: unknown }) {
  try {
    authenticatedUserId(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "PRODUCTION_GUIDANCE_UNAUTHENTICATED" }, 401);
  }

  let input: ReturnType<typeof normalizedProductionGuidanceInput>;
  try {
    input = normalizedProductionGuidanceInput(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "PRODUCTION_GUIDANCE_INVALID_REQUEST" }, 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    return json({ error: "Product Truth semantic matcher is not configured in hosted runtime.", code: "PRODUCTION_GUIDANCE_NOT_CONFIGURED" }, 503);
  }
  const model = Deno.env.get("GEMINI_PRODUCT_TRUTH_MODEL")?.trim() || Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_PRODUCT_TRUTH_MODEL;

  try {
    const derivedMetrics = deriveVideoMetrics(input.analysis);
    const initialGuide = compileSingleVideoProductionGuide(input.analysis, derivedMetrics, input.productTruth);
    let guide = initialGuide;
    let geminiRequests = 0;

    if (initialGuide.interpretation_required) {
      const interpretation = await interpretProductTruthAgainstReferenceWithKey({
        verified_facts: input.productTruth.verified_facts,
        reference_mechanisms: initialGuide.reference_mechanisms
      }, { api_key: apiKey, model });
      guide = compileSingleVideoProductionGuide(input.analysis, derivedMetrics, {
        ...input.productTruth,
        interpretation
      });
      geminiRequests = 1;
    }

    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      operation: "production_guidance",
      provider: geminiRequests === 1 ? "gemini" : "none",
      provider_authority: "hosted-secret",
      compute_authority: "hosted-production-guidance",
      product_truth_authority: "user-input-raw",
      reference_analysis_authority: "validated-hosted-result-transit",
      metrics_authority: "server-derived",
      persistence_authority: "none",
      model: geminiRequests === 1 ? model : null,
      guide,
      diagnostics: {
        gemini_requests: geminiRequests,
        persistence_writes: 0,
        background_batch_requests: 0
      }
    });
  } catch (error) {
    const normalized = normalizeGeminiError(error);
    if (normalized.is_rate_limit) {
      return json({
        error: normalized.message,
        code: "GEMINI_RATE_LIMIT",
        rate_limit: normalized.diagnostic
      }, 429);
    }
    return json({ error: normalized.message, code: "PRODUCTION_GUIDANCE_UPSTREAM" }, 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (req.method === "GET") {
    const youtubeDiscoveryReady = Boolean(Deno.env.get("YOUTUBE_DATA_API_KEY")?.trim());
    const deepAnalysisReady = Boolean(Deno.env.get("GEMINI_API_KEY")?.trim());
    return json({
      service: "masterv-hosted-api",
      contract_version: "mv-hosted-api-v1",
      authenticated: true,
      capabilities: {
        boundary_probe: true,
        reference_compiler: true,
        analyze: false,
        deep_analysis_route: true,
        deep_analysis: deepAnalysisReady,
        youtube_discovery_route: true,
        youtube_discovery: youtubeDiscoveryReady,
        product_truth_route: true,
        product_truth: deepAnalysisReady,
        production_guidance_route: true,
        production_guidance: deepAnalysisReady
      }
    });
  }

  if (req.method === "POST") {
    let body: {
      operation?: unknown;
      source_ids?: unknown;
      query?: unknown;
      options?: unknown;
      url?: unknown;
      analysis?: unknown;
      product_truth?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }
    if (body.operation === "reference_workflow") return await compileReferenceWorkflow(req, body);
    if (body.operation === "youtube_discovery") return await discoverYouTube(body);
    if (body.operation === "youtube_deep_analysis") return await analyzeYouTubeDeep(req, body);
    if (body.operation === "production_guidance") return await compileProductionGuidance(req, body);
    return json({ error: "Unsupported operation" }, 400);
  }
  return json({ error: "Method not allowed" }, 405);
});
