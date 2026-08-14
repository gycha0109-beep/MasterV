# MV-ARCH-1H-B — Guarded Live Gemini Batch Smoke

Status: **STATIC_VERIFIED_PENDING_CI / LIVE_BATCH_NOT_VERIFIED / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Verify exactly one real Gemini Batch job against one public YouTube video without activating background enrichment or falling back to interactive generation.

This checkpoint separates Batch creation from later checking because Batch creation is not idempotent.

## Default live target

The smoke defaults to one short public YouTube video already returned by the verified MV-ARCH-1E discovery runtime smoke:

```text
source_id: yt:dr7rrnD_4jI
url: https://www.youtube.com/watch?v=dr7rrnD_4jI
model: gemini-3.6-flash
```

The source is normalized again through the canonical YouTube identity authority before submission.

## Runtime modes

`scripts/background-batch-smoke.ts` supports exactly two modes.

### submit

```text
BACKGROUND_BATCH_MODE=submit
```

Behavior:

1. requires `GEMINI_API_KEY`;
2. rejects a supplied existing job name;
3. performs at most one `ai.batches.create(...)` attempt;
4. submits exactly one `GenerateContentRequest` containing one public YouTube URL;
5. requests an exact canonical source ID echo in the response;
6. polls only the created job with `ai.batches.get(...)` for a short bounded window;
7. never automatically performs a second Batch create;
8. never falls back to interactive `generateContent` or Interactions API;
9. writes `artifacts/background-batch-smoke.json`.

Artifact counters distinguish:

```text
batch_create_attempts
interactive_generate_requests = 0
```

A create attempt is not described as a confirmed inference request if the API call fails before a job is created.

### check

```text
BACKGROUND_BATCH_MODE=check
BACKGROUND_BATCH_JOB_NAME=batches/...
```

Behavior:

1. requires an existing job name;
2. performs only `ai.batches.get(...)` polling;
3. performs zero Batch create attempts;
4. performs zero interactive generation requests;
5. writes the same normalized artifact format.

The check path therefore cannot accidentally duplicate the original Batch job.

## Terminal handling

The smoke accepts both documented state surfaces at the integration boundary:

```text
JOB_STATE_SUCCEEDED / FAILED / CANCELLED / EXPIRED
BATCH_STATE_SUCCEEDED / FAILED / CANCELLED / EXPIRED
```

Pending/running states are not failures.

If the bounded submit/check window ends while the job remains non-terminal, the script records:

```text
status: PENDING
job_name: batches/...
```

and exits without creating another job.

## Success gate

`LIVE_BATCH_VERIFIED` requires all of the following from the real job:

1. Batch create returns a persistent job name;
2. the job can be retrieved with that name;
3. the job reaches a successful terminal state;
4. exactly one inline response exists;
5. the item itself has no error;
6. response text includes the exact canonical `source_id` bound in the request;
7. the artifact records one Batch create attempt for submit mode;
8. the artifact records zero interactive generate requests.

A successful create followed by a pending state is not enough for runtime verification.

## Failure evidence

Terminal failed/cancelled/expired states are persisted with the available job error.

Per-item inline errors are treated separately from whole-job terminal state.

A submission failure is not retried automatically because a caller cannot safely assume a Batch creation attempt was not accepted when the response path is ambiguous.

## GitHub Actions manual gate

The `Runtime Smoke` dispatcher exposes:

```text
gemini-batch-submit
gemini-batch-check
```

Inputs:

```text
batch_source_url
batch_model
batch_job_name   # check only
```

The default branch contains only the dispatcher definition needed to expose these manual choices. The actual smoke implementation remains on `feat/mvp-foundation`.

## Activation boundary

Even a successful 1H-B smoke does not activate background library processing.

It only proves that the current project/model can execute the exact Batch + public YouTube URL path and return a mappable result.

Production activation still requires a separate decision on:

- persistent job storage;
- scheduling/worker ownership;
- deduplication/idempotency around submit intent;
- Batch quota budgeting;
- result persistence and replay;
- retry policy for per-item failures;
- user-facing background status;
- operational monitoring.

MV-ARCH-1C remains `NOT QUALITY_VALIDATED`; this Batch spike does not enable interactive live coarse analysis.
