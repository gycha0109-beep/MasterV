# MV-ARCH-1H-A — Background Batch Capability + Mapping Contract

Status: **STATIC_VERIFIED_PENDING_CI / LIVE_BATCH_NOT_VERIFIED / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Establish the safe contract for non-interactive library enrichment before any live Gemini Batch job is submitted.

This stage does not activate background analysis and does not execute Gemini.

## Current official capability findings

Current Gemini documentation establishes that:

- Batch API is currently available through the `generateContent` API;
- a batch contains normal `GenerateContentRequest` objects;
- supported Batch modalities are the same as the equivalent interactive API;
- `generateContent` supports public YouTube URLs as video input;
- Batch API has rate limits separate from non-batch calls;
- Batch is asynchronous, priced at 50% of equivalent standard interactive usage, and targets completion within 24 hours;
- inline requests are intended for smaller jobs under the documented request-size limit;
- JSONL input is the recommended path for larger jobs;
- JSONL entries can carry a user-defined key that is returned with the corresponding result;
- a Batch creation request is not idempotent;
- terminal states include succeeded, failed, cancelled, and expired;
- an expired job is one that remained pending/running beyond the documented expiry window.

These facts make `Batch + YouTube video` structurally plausible, but they do not prove that the exact MasterV `Batch + public YouTube URL` combination succeeds in the current project/model. That remains a live spike.

Official references checked 2026-08-14:

- https://ai.google.dev/gemini-api/docs/batch-api
- https://ai.google.dev/gemini-api/docs/generate-content/video-understanding
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods

## MasterV background mapping contract

`lib/background-batch.ts` defines `background-batch-v1`.

### Canonical targets

Every batch target is normalized through the existing YouTube source identity authority.

```text
raw URL
  -> canonicalizeYouTubeSource
  -> source_id = yt:<videoId>
  -> canonical watch URL
```

Duplicate canonical source IDs are rejected before a batch request is built.

### Production mapping authority

For library enrichment, JSONL entry keys are:

```text
key = canonical source_id
```

Example:

```json
{
  "key": "yt:ABCDEFGHIJK",
  "request": {
    "contents": [
      {
        "role": "user",
        "parts": [
          { "file_data": { "file_uri": "https://www.youtube.com/watch?v=ABCDEFGHIJK" } },
          { "text": "SOURCE_ID: yt:ABCDEFGHIJK ..." }
        ]
      }
    ]
  }
}
```

The key is the external result-mapping authority. The prompt also binds the same source ID as a defense-in-depth check, but prompt echo is not the primary mapping authority.

### Result contract

Every JSONL result line must contain:

- a non-empty `key`;
- exactly one of `response` or `error`.

Malformed or ambiguous lines are rejected.

### Job state contract

Terminal states:

```text
JOB_STATE_SUCCEEDED
JOB_STATE_FAILED
JOB_STATE_CANCELLED
JOB_STATE_EXPIRED
```

`PENDING` and `RUNNING` are not terminal and must not be interpreted as failed enrichment.

## Static contract coverage

`npm run test:background-batch` verifies:

- canonical YouTube normalization;
- duplicate canonical target rejection;
- key/source identity equality;
- canonical video URI placement;
- source ID prompt binding;
- valid JSONL serialization;
- success/error result separation;
- malformed result rejection;
- terminal-state classification;
- zero Gemini requests.

The contract is wired into normal CI before `next build`.

## Safety boundary

This stage intentionally does not:

- submit a Batch job;
- poll a real Batch job;
- claim current project/model Batch quota availability;
- claim that public YouTube URL input succeeds inside Batch;
- activate background library enrichment;
- alter the interactive analysis queue;
- bypass MV-ARCH-1C quality validation;
- convert Batch results into Product Truth.

## MV-ARCH-1H-B live spike gate

The next step is a single-video, single-request manual Batch smoke.

It must verify:

1. Batch creation succeeds for the chosen current model;
2. a public YouTube URL is accepted inside the Batch `GenerateContentRequest`;
3. a job name is returned and can be polled;
4. final state and turnaround are recorded;
5. the returned item maps to the original canonical source ID;
6. per-item failure remains distinguishable from whole-job failure;
7. Batch quota/rate-limit failures are recorded without falling back to interactive Gemini;
8. no automatic retry creates a duplicate Batch job, because Batch creation is not idempotent.

Only after this live evidence may background library enrichment be considered for activation.
