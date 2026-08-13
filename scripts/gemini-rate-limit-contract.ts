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
assert(observed.diagnostic?.kind === "UNKNOWN", "generic free tier requests metric must not be guessed as RPM/RPD without quota id");
assert(observed.diagnostic?.metric === "generativelanguage.googleapis.com/generate_content_free_tier_requests", "quota metric must be preserved");
assert(observed.diagnostic?.limit === 20, "quota limit must be parsed");
assert(observed.diagnostic?.model === "gemini-3.6-flash", "model must be parsed");
assert(observed.diagnostic?.retry_after_seconds === 48, "retry hint must be preserved for diagnostics");
assert(observed.diagnostic?.upstream_status === 429, "upstream 429 must be preserved");
assert(observed.message.includes("재시도 힌트"), "unknown quota must describe retry delay only as a hint");

const rpm = normalizeGeminiError({
  status: 429,
  message: "RESOURCE_EXHAUSTED",
  details: [{
    quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
    quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
    quotaValue: "20"
  }, { retryDelay: "12.2s" }]
});
assert(rpm.diagnostic?.kind === "RPM", "per-minute request quota must classify as RPM");
assert(rpm.diagnostic?.quota_id === "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "quota id must be preserved");
assert(rpm.diagnostic?.retry_after_seconds === 13, "structured retry delay must be parsed");
assert(rpm.message.includes("13초 후"), "RPM may use retry delay as user retry guidance");

const rpd = normalizeGeminiError({
  status: 429,
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{
          quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
          quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
          quotaDimensions: {
            model: "gemini-3.6-flash",
            location: "global"
          },
          quotaValue: "20"
        }]
      },
      {
        "@type": "type.googleapis.com/google.rpc.RetryInfo",
        retryDelay: "30s"
      }
    ]
  }
});
assert(rpd.diagnostic?.kind === "RPD", "nested per-day request quota must classify as RPD");
assert(rpd.diagnostic?.quota_id === "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "nested daily quota id must be preserved");
assert(rpd.diagnostic?.limit === 20, "nested quotaValue must be parsed as daily limit");
assert(rpd.diagnostic?.model === "gemini-3.6-flash", "model must be read from quotaDimensions");
assert(rpd.diagnostic?.retry_after_seconds === 30, "RetryInfo should remain available as diagnostic metadata");
assert(rpd.message.includes("일일 한도"), "RPD user message must explain daily limit");
assert(!rpd.message.includes("30초"), "RPD must never present RetryInfo seconds as quota reset time");
assert(rpd.message.includes("Pacific Time 자정"), "RPD must explain the daily reset basis");

const serializedDaily = normalizeGeminiError(new Error(JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [{
      "@type": "type.googleapis.com/google.rpc.QuotaFailure",
      violations: [{
        quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
        quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
        quotaValue: "20"
      }]
    }]
  }
})));
assert(serializedDaily.diagnostic?.kind === "RPD", "JSON serialized SDK errors must still expose nested daily quota id");

const tpm = normalizeGeminiError({
  status: 429,
  details: [{ quotaId: "GenerateContentInputTokensPerModelPerMinute-FreeTier" }]
});
assert(tpm.diagnostic?.kind === "TPM", "per-minute token quota must classify as TPM");

const ordinary = normalizeGeminiError(new Error("Gemini가 분석 결과를 반환하지 않았습니다."));
assert(!ordinary.is_rate_limit, "ordinary Gemini errors must not be mislabeled as rate limits");
assert(ordinary.diagnostic === null, "ordinary errors must not carry rate limit diagnostics");

console.log("GEMINI_RATE_LIMIT_CONTRACT_PASS");
