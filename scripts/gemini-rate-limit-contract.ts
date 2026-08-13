import { normalizeGeminiError } from "../lib/gemini-error";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const observed = normalizeGeminiError(new Error(
  "429 You exceeded your current quota, please check your plan and billing details. " +
  "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, " +
  "limit: 20, model: gemini-3.6-flash Please retry in 47.790263013s."
));

assert(observed.is_rate_limit, "observed Gemini 429 must be recognized as rate limit");
assert(observed.diagnostic?.kind === "UNKNOWN", "generic free tier requests metric must not be guessed as RPM/RPD");
assert(observed.diagnostic?.metric === "generativelanguage.googleapis.com/generate_content_free_tier_requests", "quota metric must be preserved");
assert(observed.diagnostic?.limit === 20, "quota limit must be parsed");
assert(observed.diagnostic?.model === "gemini-3.6-flash", "model must be parsed");
assert(observed.diagnostic?.retry_after_seconds === 48, "retry delay must be rounded up for display");
assert(observed.diagnostic?.upstream_status === 429, "upstream 429 must be preserved");

const rpm = normalizeGeminiError({
  status: 429,
  message: "RESOURCE_EXHAUSTED",
  details: [{
    quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
    quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
    quotaLimit: "20"
  }, { retryDelay: "12.2s" }]
});
assert(rpm.diagnostic?.kind === "RPM", "per-minute request quota must classify as RPM");
assert(rpm.diagnostic?.quota_id === "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "quota id must be preserved");
assert(rpm.diagnostic?.retry_after_seconds === 13, "structured retry delay must be parsed");

const rpd = normalizeGeminiError({
  status: 429,
  details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }]
});
assert(rpd.diagnostic?.kind === "RPD", "per-day request quota must classify as RPD");

const tpm = normalizeGeminiError({
  status: 429,
  details: [{ quotaId: "GenerateContentInputTokensPerModelPerMinute-FreeTier" }]
});
assert(tpm.diagnostic?.kind === "TPM", "per-minute token quota must classify as TPM");

const ordinary = normalizeGeminiError(new Error("Gemini가 분석 결과를 반환하지 않았습니다."));
assert(!ordinary.is_rate_limit, "ordinary Gemini errors must not be mislabeled as rate limits");
assert(ordinary.diagnostic === null, "ordinary errors must not carry rate limit diagnostics");

console.log("GEMINI_RATE_LIMIT_CONTRACT_PASS");
