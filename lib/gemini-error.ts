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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null;
}

function parseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function collectValues(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown[] {
  if (depth > 8 || value === null || value === undefined) return [];

  const values: unknown[] = [value];

  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    return parsed === null ? values : [...values, ...collectValues(parsed, depth + 1, seen)];
  }

  if (typeof value !== "object") return values;
  if (seen.has(value)) return values;
  seen.add(value);

  if (value instanceof Error) {
    values.push(value.name, value.message);
    const cause = (value as Error & { cause?: unknown }).cause;
    if (cause !== undefined) values.push(...collectValues(cause, depth + 1, seen));
  }

  for (const [key, child] of Object.entries(value as UnknownRecord)) {
    values.push(key);
    values.push(...collectValues(child, depth + 1, seen));
  }

  return values;
}

function collectStrings(value: unknown) {
  return collectValues(value)
    .filter((item): item is string | number | boolean =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    )
    .map(String);
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

function findNamedValue(root: unknown, names: string[]): unknown | null {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const queue = [root];
  const seen = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === "string") {
      const parsed = parseJsonString(current);
      if (parsed !== null) queue.push(parsed);
      continue;
    }

    if (typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (current instanceof Error) {
      const cause = (current as Error & { cause?: unknown }).cause;
      if (cause !== undefined) queue.push(cause);
    }

    for (const [key, child] of Object.entries(current as UnknownRecord)) {
      if (wanted.has(key.toLowerCase()) && child !== null && child !== undefined) return child;
      queue.push(child);
    }
  }

  return null;
}

function findModel(root: unknown, text: string) {
  const direct = findNamedValue(root, ["model"]);
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const dimensions = findNamedValue(root, ["quotaDimensions", "quota_dimensions"]);
  const record = asRecord(dimensions);
  const model = record?.model;
  if (typeof model === "string" && model.trim()) return model.trim();

  return firstMatch(text, [
    /\bmodel:\s*([^,\s\n]+)/i,
    /model["'\s:=]+([\w.:-]+)/i
  ]);
}

function classifyRateLimit(metric: string | null, quotaId: string | null, text: string): GeminiRateLimitKind {
  const source = `${quotaId ?? ""} ${metric ?? ""} ${text}`.toLowerCase();

  if (/per.?day|daily|requests?.?per.?day|generate.?requests?.?per.?day|rpd\b/.test(source)) return "RPD";
  if (/token[^\n]{0,80}(per.?minute|minute)|tokens?.?per.?minute|tpm\b/.test(source)) return "TPM";
  if (/(requests?|generate)[^\n]{0,80}(per.?minute|minute)|requests?.?per.?minute|rpm\b/.test(source)) return "RPM";
  return "UNKNOWN";
}

function extractStatus(error: unknown, text: string) {
  const direct = findNamedValue(error, ["status", "statusCode", "httpStatus", "code"]);
  if (typeof direct === "number" && direct >= 100 && direct <= 599) return direct;
  if (typeof direct === "string" && /^\d{3}$/.test(direct)) return Number(direct);

  const matched = firstMatch(text, [/(?:^|\D)(429)(?:\D|$)/]);
  return parseNumber(matched);
}

function normalizeScalarString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function extractMetric(error: unknown, text: string) {
  const structured = normalizeScalarString(findNamedValue(error, ["quotaMetric", "quota_metric"]));
  return structured ?? firstMatch(text, [
    /quota exceeded for metric:\s*([^,\n]+)/i,
    /(?:quotaMetric|metric)["'\s:=]+([\w./-]+)/i
  ]);
}

function extractQuotaId(error: unknown, text: string) {
  const structured = normalizeScalarString(findNamedValue(error, ["quotaId", "quota_id"]));
  return structured ?? firstMatch(text, [
    /(?:quotaId|quota_id)["'\s:=]+([\w./-]+)/i,
    /quota\s+id["'\s:=]+([\w./-]+)/i
  ]);
}

function extractLimit(error: unknown, text: string) {
  const structured = normalizeScalarString(findNamedValue(error, ["quotaValue", "quotaLimit", "quota_value", "quota_limit"]));
  return parseNumber(structured ?? firstMatch(text, [
    /\blimit:\s*([\d.]+)/i,
    /(?:quotaValue|quotaLimit|limit)["'\s:=]+([\d.]+)/i
  ]));
}

function extractRetryAfter(error: unknown, text: string) {
  const structured = normalizeScalarString(findNamedValue(error, ["retryDelay", "retryAfter", "retry_after"]));
  const structuredNumber = structured
    ? parseNumber(firstMatch(structured, [/^([\d.]+)s?$/i]))
    : null;
  if (structuredNumber !== null) return structuredNumber;

  return parseNumber(firstMatch(text, [
    /retry\s+in\s+([\d.]+)s/i,
    /retryDelay["'\s:=]+([\d.]+)s/i,
    /retry.?after["'\s:=]+([\d.]+)/i
  ]));
}

function rateLimitMessage(kind: GeminiRateLimitKind, retryAfter: number | null) {
  if (kind === "RPD") {
    return "오늘의 Gemini 요청 한도를 모두 사용했습니다. 일일 한도는 Pacific Time 자정에 초기화됩니다.";
  }

  if (kind === "RPM") {
    return retryAfter !== null
      ? `Gemini 분당 요청 한도에 도달했습니다. 약 ${Math.ceil(retryAfter)}초 후 다시 시도해주세요.`
      : "Gemini 분당 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (kind === "TPM") {
    return retryAfter !== null
      ? `Gemini 분당 토큰 한도에 도달했습니다. 약 ${Math.ceil(retryAfter)}초 후 다시 시도해주세요.`
      : "Gemini 분당 토큰 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  }

  return retryAfter !== null
    ? `Gemini 요청 한도에 도달했습니다. 응답에 ${Math.ceil(retryAfter)}초 재시도 힌트가 포함됐지만 제한 종류를 확인할 수 없습니다. 제한 상세를 확인해주세요.`
    : "Gemini 요청 한도에 도달했습니다. 제한 종류를 확인할 수 없어 제한 상세 확인이 필요합니다.";
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

  const metric = extractMetric(error, text);
  const quotaId = extractQuotaId(error, text);
  const limit = extractLimit(error, text);
  const retryAfter = extractRetryAfter(error, text);
  const model = findModel(error, text);
  const kind = classifyRateLimit(metric, quotaId, text);

  return {
    is_rate_limit: true,
    message: rateLimitMessage(kind, retryAfter),
    diagnostic: {
      kind,
      metric,
      quota_id: quotaId,
      limit,
      retry_after_seconds: retryAfter === null ? null : Math.ceil(retryAfter),
      model,
      upstream_status: upstreamStatus ?? 429
    }
  };
}
