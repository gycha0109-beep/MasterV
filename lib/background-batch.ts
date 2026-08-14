import { canonicalizeYouTubeSource } from "@/lib/source-identity";

export const BACKGROUND_BATCH_CONTRACT_VERSION = "background-batch-v1";

export type BackgroundBatchTarget = {
  source_id: string;
  canonical_url: string;
};

export type BackgroundBatchJsonlEntry = {
  key: string;
  request: {
    contents: Array<{
      role: "user";
      parts: Array<
        | { file_data: { file_uri: string } }
        | { text: string }
      >;
    }>;
  };
};

export type BackgroundBatchTerminalState =
  | "JOB_STATE_SUCCEEDED"
  | "JOB_STATE_FAILED"
  | "JOB_STATE_CANCELLED"
  | "JOB_STATE_EXPIRED";

export type BackgroundBatchResult = {
  key: string;
  ok: boolean;
  response?: unknown;
  error?: unknown;
};

const TERMINAL_STATES = new Set<BackgroundBatchTerminalState>([
  "JOB_STATE_SUCCEEDED",
  "JOB_STATE_FAILED",
  "JOB_STATE_CANCELLED",
  "JOB_STATE_EXPIRED"
]);

function assertUniqueTargets(targets: BackgroundBatchTarget[]) {
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.source_id)) throw new Error(`duplicate batch source_id: ${target.source_id}`);
    seen.add(target.source_id);
  }
}

export function normalizeBackgroundBatchTargets(rawUrls: string[]): BackgroundBatchTarget[] {
  const targets = rawUrls.map((rawUrl) => {
    const source = canonicalizeYouTubeSource(rawUrl);
    return {
      source_id: source.source_id,
      canonical_url: source.canonical_url
    };
  });
  assertUniqueTargets(targets);
  return targets;
}

export function buildBackgroundBatchPrompt(sourceId: string) {
  return [
    `SOURCE_ID: ${sourceId}`,
    "Analyze only this source.",
    "Return a concise background-enrichment result for later library use.",
    "Do not treat claims as verified product facts without evidence.",
    `Echo source_id exactly as ${sourceId} in the response payload.`
  ].join("\n");
}

export function buildBackgroundBatchJsonlEntries(
  targets: BackgroundBatchTarget[]
): BackgroundBatchJsonlEntry[] {
  assertUniqueTargets(targets);
  return targets.map((target) => ({
    key: target.source_id,
    request: {
      contents: [
        {
          role: "user",
          parts: [
            { file_data: { file_uri: target.canonical_url } },
            { text: buildBackgroundBatchPrompt(target.source_id) }
          ]
        }
      ]
    }
  }));
}

export function serializeBackgroundBatchJsonl(entries: BackgroundBatchJsonlEntry[]) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

export function isBackgroundBatchTerminalState(state: string): state is BackgroundBatchTerminalState {
  return TERMINAL_STATES.has(state as BackgroundBatchTerminalState);
}

export function parseBackgroundBatchResultLine(line: string): BackgroundBatchResult {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const key = parsed.key;
  if (typeof key !== "string" || !key.trim()) throw new Error("batch result missing key");

  const hasResponse = parsed.response !== undefined && parsed.response !== null;
  const hasError = parsed.error !== undefined && parsed.error !== null;
  if (hasResponse === hasError) {
    throw new Error(`batch result ${key} must contain exactly one of response/error`);
  }

  return hasResponse
    ? { key, ok: true, response: parsed.response }
    : { key, ok: false, error: parsed.error };
}
