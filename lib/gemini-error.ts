export type GeminiRateLimitKind = "RPM" | "TPM" | "RPD" | "UNKNOWN";

export type GeminiRateLimitDiagnostic = {
  kind: GeminiRateLimitKind;
  metric: string | null;
  quota_id: string | null;
  limit: number | null;
  retry_after_seconds: number | null;
  model: string | null;
  upstream_status: number | null;
};

export type NormalizedGeminiError = {
  is_rate_limit: boolean;
  message: string;
  diagnostic: GeminiRateLimitDiagnostic | null;
};

function collectStrings(value: unknown, depth = 0, seen = new WeakSet<object>()): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const strings: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    strings.push(key);
    strings.push(...collectStrings(child, depth + 1, seen));
  }
  return strings;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyRateLimit(metric: string | null, quotaId: string | null, text: string): GeminiRateLimitKind {
  const source = `${metric ?? ""} ${quotaId ?? ""} ${text}`.toLowerCase();

  if (/token[^\n]{0,40}(per.?minute|minute)|tokens?.?per.?minute|tpm\b/.test(source)) return "TPM";
  if (/(requests?|generate)[^\n]{0,50}(per.?day|daily)|requests?.?per.?day|rpd\b/.test(source)) return "RPD";
  if (/(requests?|generate)[^\n]{0,50}(per.?minute|minute)|requests?.?per.?minute|rpm\b/.test(source)) return "RPM";
  return "UNKNOWN";
}

function extractStatus(error: unknown, text: string) {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    for (const key of ["status", "statusCode", "httpStatus", "code"]) {
      const value = record[key];
      if (typeof value === "number" && value >= 100 && value <= 599) return value;
      if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
    }
  }
  const matched = firstMatch(text, [/(?:^|\D)(429)(?:\D|$)/]);
  return parseNumber(matched);
}

export function normalizeGeminiError(error: unknown): NormalizedGeminiError {
  const strings = collectStrings(error);
  const directMessage = error instanceof Error ? error.message : "";
  const text = [directMessage, ...strings].filter(Boolean).join("\n");
  const upstreamStatus = extractStatus(error, text);
  const isRateLimit = upstreamStatus === 429 || /quota|rate.?limit|resource_exhausted|too many requests/i.test(text);

  if (!isRateLimit) {
    return {
      is_rate_limit: false,
      message: directMessage || "영상 분석에 실패했습니다.",
      diagnostic: null
    };
  }

  const metric = firstMatch(text, [
    /quota exceeded for metric:\s*([^,\n]+)/i,
    /(?:quotaMetric|metric)["'\s:=]+([\w./-]+)/i
  ]);
  const quotaId = firstMatch(text, [
    /(?:quotaId|quota_id)["'\s:=]+([\w./-]+)/i,
    /quota\s+id["'\s:=]+([\w./-]+)/i
  ]);
  const limit = parseNumber(firstMatch(text, [
    /\blimit:\s*([\d.]+)/i,
    /(?:quotaLimit|limit)["'\s:=]+([\d.]+)/i
  ]));
  const retryAfter = parseNumber(firstMatch(text, [
    /retry\s+in\s+([\d.]+)s/i,
    /retryDelay["'\s:=]+([\d.]+)s/i,
    /retry.?after["'\s:=]+([\d.]+)/i
  ]));
  const model = firstMatch(text, [
    /\bmodel:\s*([^,\s\n]+)/i,
    /model["'\s:=]+([\w.:-]+)/i
  ]);

  return {
    is_rate_limit: true,
    message: retryAfter !== null
      ? `AI 분석 요청이 잠시 제한되었습니다. 약 ${Math.ceil(retryAfter)}초 후 다시 시도해주세요.`
      : "AI 분석 요청 한도에 도달했습니다. 제한 상세를 확인해주세요.",
    diagnostic: {
      kind: classifyRateLimit(metric, quotaId, text),
      metric,
      quota_id: quotaId,
      limit,
      retry_after_seconds: retryAfter === null ? null : Math.ceil(retryAfter),
      model,
      upstream_status: upstreamStatus ?? 429
    }
  };
}
