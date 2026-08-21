import {
  BACKGROUND_BATCH_CONTRACT_VERSION,
  buildBackgroundBatchJsonlEntries,
  isBackgroundBatchTerminalState,
  normalizeBackgroundBatchTargets,
  parseBackgroundBatchResultLine,
  serializeBackgroundBatchJsonl
} from "../lib/background-batch";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const targets = normalizeBackgroundBatchTargets([
  "https://youtu.be/ABCDEFGHIJK",
  "https://www.youtube.com/shorts/LMNOPQRSTUV"
]);

assert(BACKGROUND_BATCH_CONTRACT_VERSION === "background-batch-v1", "version mismatch");
assert(targets[0].source_id === "yt:ABCDEFGHIJK", "first source identity mismatch");
assert(targets[1].canonical_url === "https://www.youtube.com/watch?v=LMNOPQRSTUV", "canonical URL mismatch");

const entries = buildBackgroundBatchJsonlEntries(targets);
assert(entries.length === 2, "entry count mismatch");
for (let i = 0; i < entries.length; i += 1) {
  const entry = entries[i];
  const target = targets[i];
  assert(entry.key === target.source_id, "batch key must equal canonical source_id");
  const parts = entry.request.contents[0].parts;
  assert(parts.length === 2, "batch request must contain video + prompt");
  assert("file_data" in parts[0], "first part must be file_data");
  if ("file_data" in parts[0]) {
    assert(parts[0].file_data.file_uri === target.canonical_url, "batch video URI mismatch");
  }
  assert("text" in parts[1] && parts[1].text.includes(target.source_id), "prompt must bind source_id");
}

const jsonl = serializeBackgroundBatchJsonl(entries);
assert(jsonl.endsWith("\n"), "JSONL must end with newline");
assert(jsonl.trim().split("\n").length === 2, "JSONL line count mismatch");

const fileSuccess = parseBackgroundBatchResultLine(JSON.stringify({
  key: "yt:ABCDEFGHIJK",
  response: { candidates: [] }
}));
assert(fileSuccess.ok && fileSuccess.key === "yt:ABCDEFGHIJK", "file result mapping mismatch");

const inlineSuccess = parseBackgroundBatchResultLine(JSON.stringify({
  metadata: { key: "yt:LMNOPQRSTUV" },
  response: { candidates: [] }
}));
assert(inlineSuccess.ok && inlineSuccess.key === "yt:LMNOPQRSTUV", "inline metadata mapping mismatch");

const agreeingKeys = parseBackgroundBatchResultLine(JSON.stringify({
  key: "yt:ABCDEFGHIJK",
  metadata: { key: "yt:ABCDEFGHIJK" },
  error: { code: 429 }
}));
assert(!agreeingKeys.ok && agreeingKeys.key === "yt:ABCDEFGHIJK", "agreeing dual key mapping mismatch");

assert(isBackgroundBatchTerminalState("JOB_STATE_SUCCEEDED"), "SDK succeeded must be terminal");
assert(isBackgroundBatchTerminalState("JOB_STATE_EXPIRED"), "SDK expired must be terminal");
assert(isBackgroundBatchTerminalState("BATCH_STATE_SUCCEEDED"), "REST succeeded must be terminal");
assert(isBackgroundBatchTerminalState("BATCH_STATE_EXPIRED"), "REST expired must be terminal");
assert(!isBackgroundBatchTerminalState("JOB_STATE_RUNNING"), "SDK running must not be terminal");
assert(!isBackgroundBatchTerminalState("BATCH_STATE_RUNNING"), "REST running must not be terminal");

let duplicateRejected = false;
try {
  normalizeBackgroundBatchTargets([
    "https://youtu.be/ABCDEFGHIJK",
    "https://www.youtube.com/watch?v=ABCDEFGHIJK"
  ]);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "duplicate canonical source IDs must be rejected");

let ambiguousRejected = false;
try {
  parseBackgroundBatchResultLine(JSON.stringify({ key: "yt:bad", response: {}, error: {} }));
} catch {
  ambiguousRejected = true;
}
assert(ambiguousRejected, "ambiguous response/error result must be rejected");

let mismatchedKeyRejected = false;
try {
  parseBackgroundBatchResultLine(JSON.stringify({
    key: "yt:ABCDEFGHIJK",
    metadata: { key: "yt:LMNOPQRSTUV" },
    response: {}
  }));
} catch {
  mismatchedKeyRejected = true;
}
assert(mismatchedKeyRejected, "conflicting result keys must be rejected");

let missingKeyRejected = false;
try {
  parseBackgroundBatchResultLine(JSON.stringify({ response: {} }));
} catch {
  missingKeyRejected = true;
}
assert(missingKeyRejected, "result without mapping key must be rejected");

console.log(JSON.stringify({
  status: "BACKGROUND_BATCH_CONTRACT_PASS",
  entries: entries.length,
  sdk_and_rest_state_aliases: true,
  file_and_inline_result_mapping: true,
  gemini_requests_executed: 0
}));
