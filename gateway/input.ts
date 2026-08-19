import type { SearchOptions } from "@/lib/discovery";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import { validateVideoAnalysis } from "@/lib/analysis-validation";
import { canonicalizeYouTubeSource } from "@/lib/source-identity";
import type { ProductTruthInput } from "@/lib/single-video-production";
import { GatewayError } from "./errors";

const MAX_DISCOVERY_QUERY_LENGTH = 200;
const MAX_ANALYZE_URL_LENGTH = 500;
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

function invalid(message: string): never {
  throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", message);
}

export function normalizeDiscoveryInput(body: Record<string, unknown>) {
  if (typeof body.query !== "string") invalid("query must be a string");
  const query = body.query.trim();
  if (!query) invalid("query must not be empty");
  if (query.length > MAX_DISCOVERY_QUERY_LENGTH) invalid(`query must be at most ${MAX_DISCOVERY_QUERY_LENGTH} characters`);

  if (body.options === undefined) return { query, options: {} as SearchOptions };
  if (!body.options || typeof body.options !== "object" || Array.isArray(body.options)) invalid("options must be an object");

  const options = body.options as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (!DISCOVERY_OPTION_KEYS.has(key)) invalid(`unsupported discovery option: ${key}`);
  }

  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    if (DISCOVERY_NUMBER_KEYS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${key} must be a finite number`);
      normalized[key] = value;
      continue;
    }
    if (typeof value !== "string") invalid(`${key} must be a string`);
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (key === "region_code" && !/^[A-Za-z]{2}$/.test(trimmed)) invalid("region_code must be a 2-letter code");
    if (key === "relevance_language" && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(trimmed)) invalid("relevance_language is invalid");
    if (key === "published_after" && Number.isNaN(Date.parse(trimmed))) invalid("published_after must be a valid date-time");
    normalized[key] = trimmed;
  }
  return { query, options: normalized as SearchOptions };
}

export function normalizeAnalyzeInput(body: Record<string, unknown>) {
  if (typeof body.url !== "string") invalid("url must be a string");
  const requestedUrl = body.url.trim();
  if (!requestedUrl) invalid("url must not be empty");
  if (requestedUrl.length > MAX_ANALYZE_URL_LENGTH) invalid(`url must be at most ${MAX_ANALYZE_URL_LENGTH} characters`);
  const source = canonicalizeYouTubeSource(requestedUrl);
  return { requested_url: requestedUrl, source };
}

export function normalizeGuidanceInput(body: Record<string, unknown>): {
  analysis: VideoAnalysis;
  product_truth: ProductTruthInput;
} {
  if (!body.analysis || typeof body.analysis !== "object" || Array.isArray(body.analysis)) invalid("analysis must be an object");
  let analysis: VideoAnalysis;
  try {
    analysis = validateVideoAnalysis(body.analysis as VideoAnalysis);
  } catch (error) {
    invalid(error instanceof Error ? error.message : "analysis is invalid");
  }

  if (!body.product_truth || typeof body.product_truth !== "object" || Array.isArray(body.product_truth)) invalid("product_truth must be an object");
  const raw = body.product_truth as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!PRODUCT_TRUTH_KEYS.has(key)) invalid(`unsupported product_truth field: ${key}`);
  }

  const productTruth = {} as ProductTruthInput;
  for (const key of PRODUCT_TRUTH_KEYS) {
    const value = raw[key] ?? "";
    if (typeof value !== "string") invalid(`product_truth.${key} must be a string`);
    const limit = PRODUCT_TRUTH_LIMITS[key as keyof typeof PRODUCT_TRUTH_LIMITS];
    if (value.length > limit) invalid(`product_truth.${key} must be at most ${limit} characters`);
    productTruth[key as keyof Omit<ProductTruthInput, "interpretation">] = value;
  }
  return { analysis, product_truth: productTruth };
}
