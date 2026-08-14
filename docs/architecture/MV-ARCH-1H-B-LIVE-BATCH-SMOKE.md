# MV-ARCH-1H-B — Guarded Live Gemini Batch Smoke

Status: **RUNTIME_ATTEMPTED / BLOCKED_PRECONDITION / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Verify one real Gemini Batch job against one public YouTube video without activating background enrichment or falling back to interactive generation.

Batch creation and later checking are intentionally separated because Batch creation is not treated as safely idempotent.

## Target

```text
source_id: yt:dr7rrnD_4jI
url: https://www.youtube.com/watch?v=dr7rrnD_4jI
```

The source is normalized through the canonical YouTube identity authority before submission.

## Live evidence

### Attempt 1

```text
run_id: 31761461317
branch: feat/mvp-foundation
head: 56af8a871d7d666b13fce392624e9b1c88c0717e
mode: submit
model: gemini-3.6-flash
result: failure
api_status: 400 FAILED_PRECONDITION
job_name: null
batch_create_attempts: 1
interactive_generate_requests: 0
```

### Attempt 2

```text
run_id: 31761909252
branch: feat/mvp-foundation
head: 15f2a9dc40122c925d8170aa522d3da84e9c6932
mode: submit
model: gemini-3.5-flash-lite
result: failure
api_status: 400 FAILED_PRECONDITION
job_name: null
state: null
batch_create_attempts: 1
interactive_generate_requests: 0
artifact_id: 9204918780
artifact_digest: sha256:df9d5ecb1fd081ecd4fa7151eb326cace059a825b09c39c9c66ca9e520216b05
```

Both failures occurred synchronously at `ai.batches.create(...)` before a Batch resource name was returned. No check job exists for either attempt, and neither path fell back to interactive generation.

## Current capability interpretation

Current official Gemini documentation establishes that:

- `gemini-3.5-flash-lite` supports video input;
- `gemini-3.5-flash-lite` supports Batch API as a model capability;
- public YouTube URLs are supported by the generateContent video input path;
- Batch API is listed as a Paid tier feature;
- current Batch pricing tables show Free Tier as not available.

Therefore the two `FAILED_PRECONDITION` responses do **not** prove that Batch + public YouTube URL is unsupported. They prove only that the exact Batch create requests were rejected under the current project/request preconditions.

The connected tooling cannot inspect the Gemini project's billing tier. Paid-tier availability must be explicitly established before another live Batch submit is justified.

## Retry boundary

Do not submit another Batch smoke merely by changing models.

A future retry is permitted only after a materially changed precondition is established, such as:

```text
Gemini API Paid tier / billing confirmed for the same project
```

If a future create returns a `batches/...` resource name, all subsequent observation must use `gemini-batch-check`; do not create another job for polling.

## Runtime contract retained

`scripts/background-batch-smoke.ts` still enforces:

- one Batch create attempt maximum in `submit` mode;
- zero interactive generation fallback;
- `check` mode requires an existing Batch job name and performs zero creates;
- bounded polling only;
- explicit `PENDING`, `SUCCEEDED`, and `FAILED` artifacts;
- exact canonical source ID binding;
- whole-job and per-item failure separation.

`lib/background-batch.ts` retains the static Batch mapping contract:

- canonical `yt:<videoId>` target identity;
- duplicate target rejection;
- JSONL key/source binding;
- inline/JSONL result-key compatibility;
- response/error ambiguity rejection;
- SDK `JOB_STATE_*` and REST `BATCH_STATE_*` terminal-state compatibility.

## Activation decision

MV-ARCH-1H is **not activated**.

The architecture remains valid as an optional future background-enrichment path, but MasterV MVP does not depend on it. Interactive discovery, cache/replay, deterministic orchestration, and explicit single-video Deep analysis remain independent of Batch availability.

Production Batch activation would still require:

- paid-tier availability;
- successful Batch + public YouTube live evidence;
- persistent job storage;
- scheduling/worker ownership;
- submit idempotency/deduplication;
- quota budgeting;
- result persistence/replay;
- retry policy;
- user-facing background status;
- operational monitoring.

MV-ARCH-1C remains `NOT QUALITY_VALIDATED`; this spike does not enable interactive live coarse analysis.
