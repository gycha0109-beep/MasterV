# MV-ARCH-1H-A — Background Batch Capability + Mapping Contract

Status: **STATIC_VERIFIED / LIVE_BATCH_NOT_VERIFIED / NOT ACTIVATED**

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
- JSONL entries carry a user-defined top-level key that is returned with the corresponding file result;
- inline requests can carry request metadata, and the REST API response contract exposes that metadata on the corresponding inline response;
- a Batch creation request is not idempotent;
- terminal states include succeeded, failed, cancelled, and expired.

The current guide examples expose `JOB_STATE_*` names while the REST API reference defines the `BatchState` enum as `BATCH_STATE_*`. MasterV treats both documented surfaces as aliases at the integration boundary instead of assuming one naming layer.

These facts make `Batch + YouTube video` structurally plausible, but they do not prove that the exact MasterV `Batch + public YouTube URL` combination succeeds in the current project/model. That remains a live spike.

Official references checked 2026-08-14:

- https://ai.google.dev/gemini-api/docs/batch-api
- https://ai.google.dev/api/batch-api
- https://ai.google.dev/gemini-api/docs/generate-content/video-understanding
- https://ai.google.dev/gemini-api/docs/rate-limits

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

### JSONL mapping authority

For file-based library enrichment, JSONL entry keys are:

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

The top-level JSONL key is the external file-result mapping authority. The prompt also binds the same source ID as defense in depth, but prompt echo is not the primary mapping authority.

### Inline mapping compatibility

For a later single-item inline live spike, the request can associate:

```json
{
  "metadata": {
    "key": "yt:ABCDEFGHIJK"
  }
}
```

The parser accepts either:

- file result top-level `key`;
- inline result `metadata.key`.

If both are present, they must agree. A disagreement is rejected instead of silently choosing one.

### Result contract

Every parsed item must contain:

- a resolvable, non-empty mapping key;
- exactly one of `response` or `error`.

Malformed, ambiguous, unmapped, or conflicting-key results are rejected.

### Job state contract

Terminal aliases accepted at the integration boundary:

```text
JOB_STATE_SUCCEEDED
JOB_STATE_FAILED
JOB_STATE_CANCELLED
JOB_STATE_EXPIRED

BATCH_STATE_SUCCEEDED
BATCH_STATE_FAILED
BATCH_STATE_CANCELLED
BATCH_STATE_EXPIRED
```

`JOB_STATE_RUNNING` and `BATCH_STATE_RUNNING` are not terminal and must not be interpreted as failed enrichment.

## Static verification

`npm run test:background-batch` verifies:

- canonical YouTube normalization;
- duplicate canonical target rejection;
- JSONL key/source identity equality;
- canonical video URI placement;
- source ID prompt binding;
- valid JSONL serialization;
- top-level JSONL key result mapping;
- inline `metadata.key` result mapping;
- agreeing dual-key acceptance;
- conflicting-key rejection;
- missing-key rejection;
- success/error result separation;
- ambiguous response/error rejection;
- SDK-style `JOB_STATE_*` terminal classification;
- REST-style `BATCH_STATE_*` terminal classification;
- running-state non-terminal classification;
- zero Gemini requests.

The contract is wired into normal CI before `next build`.

Verification checkpoint before this documentation freeze:

```text
head: 32c5c21b854fdc884f2d051f28c5d290f3e0eee9
CI run: 31760839324 (#455)
conclusion: success
```

Typecheck, all previous regression contracts, `test:background-batch`, and production build passed.

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
3. the returned batch/job identity can be persisted and polled;
4. final state and turnaround are recorded;
5. the returned item maps to the original canonical source ID;
6. per-item failure remains distinguishable from whole-job failure;
7. Batch quota/rate-limit failures are recorded without falling back to interactive Gemini;
8. no automatic retry creates a duplicate Batch job, because Batch creation is not idempotent.

Only after this live evidence may background library enrichment be considered for activation.
