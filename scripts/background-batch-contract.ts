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

const success = parseBackgroundBatchResultLine(JSON.stringify({ key: "yt:ABCDEFGHIJK", response: { candidates: [] } }));
assert(success.ok && success.key === "yt:ABCDEFGHIJK", "success result mapping mismatch");

const failure = parseBackgroundBatchResultLine(JSON.stringify({ key: "yt:LMNOPQRSTUV", error: { code: 429 } }));
assert(!failure.ok && failure.key === "yt:LMNOPQRSTUV", "error result mapping mismatch");

assert(isBackgroundBatchTerminalState("JOB_STATE_SUCCEEDED"), "succeeded must be terminal");
assert(isBackgroundBatchTerminalState("JOB_STATE_EXPIRED"), "expired must be terminal");
assert(!isBackgroundBatchTerminalState("JOB_STATE_RUNNING"), "running must not be terminal");

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

let malformedRejected = false;
try {
  parseBackgroundBatchResultLine(JSON.stringify({ key: "yt:bad", response: {}, error: {} }));
} catch {
  malformedRejected = true;
}
assert(malformedRejected, "ambiguous response/error result must be rejected");

console.log(JSON.stringify({
  status: "BACKGROUND_BATCH_CONTRACT_PASS",
  entries: entries.length,
  gemini_requests_executed: 0
}));
