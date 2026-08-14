# MV-ARCH-1G-B — Discovery Runtime Smoke Gate

Status: **STATIC_VERIFIED / DISCOVERY_BACKEND_RUNTIME_VERIFIED / BROWSER_INTERACTION_NOT_VERIFIED / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Verify the real YouTube discovery path before promoting the discovery backend, while keeping browser interaction and Gemini analysis as separate gates.

The live smoke is deliberately one-shot and independent from Gemini.

## One-shot smoke contract

`npm run smoke:youtube-discovery` uses `YOUTUBE_DATA_API_KEY` and performs one populated discovery query with:

- `search.list`: 1 request;
- `videos.list`: 1 request;
- Gemini: 0 requests;
- maximum discovery results requested: 10;
- final shortlist limit: 5.

The smoke fails unless:

- at least one candidate is returned;
- exactly two YouTube API requests were used for a populated result;
- diagnostics report `gemini_requests = 0`;
- every candidate has canonical `yt:<id>` identity;
- every candidate has canonical YouTube watch URL;
- native `search_rank` is present.

A successful run writes `artifacts/youtube-discovery-smoke.json` without storing the API key.

## Manual GitHub Actions path

The manual-only `Runtime Smoke` workflow has a target selector:

- `gemini`: existing Gemini runtime smoke;
- `youtube-discovery`: YouTube discovery smoke only.

When `youtube-discovery` is selected, the Gemini job is skipped and no `GEMINI_API_KEY` is exported to the YouTube job.

Required repository secret:

```text
YOUTUBE_DATA_API_KEY
```

## Live evidence

Successful manual run:

```text
run_id: 31760373402
workflow: Runtime Smoke
branch: feat/mvp-foundation
head_sha: 62f2347cd3d7d9bc409c49d4c41ecb6d57bb4a33
query: sunscreen review shorts
```

Observed job state:

- `youtube-discovery-smoke`: success;
- `Verify YouTube secret exists`: success;
- `Run one-shot YouTube discovery smoke`: success;
- `Upload YouTube discovery smoke artifact`: success;
- `gemini-smoke`: skipped.

Smoke output:

```json
{
  "status": "YOUTUBE_DISCOVERY_SMOKE_PASS",
  "query": "sunscreen review shorts",
  "candidate_count": 5,
  "youtube_api_requests": 2,
  "gemini_requests": 0
}
```

Artifact `youtube-discovery-smoke` / ID `9204360552` was downloaded and inspected.

Artifact diagnostics:

```text
discovered_count: 10
deduped_count: 10
filtered_count: 10
shortlisted_count: 5
youtube_api_requests: 2
gemini_requests: 0
```

All five candidates contained canonical source IDs and watch URLs, real YouTube metadata, parsed durations, and native search ranks. Native view/like/comment metrics were also present for these results.

Therefore:

- MV-ARCH-1E metadata discovery backend is `RUNTIME_VERIFIED`;
- this evidence does not prove the React/browser interaction path;
- no Gemini Deep or coarse analysis was executed by this smoke.

## UX refinement frozen in this checkpoint

- a failed new discovery request no longer erases previously loaded candidate results;
- candidate-triggered Deep analysis records the selected `source_id`;
- only the selected card shows `이 영상 분석 중...`;
- other cards show that another analysis is running;
- successful Deep analysis scrolls to the result;
- failed Deep analysis scrolls to the direct-analysis error surface.

## Remaining interaction gate

A browser interaction smoke still requires a reachable MasterV runtime with `YOUTUBE_DATA_API_KEY` configured.

It must verify:

1. keyword submission returns real metadata cards;
2. the search path does not automatically call Deep;
3. current blocked 1C gate renders unresolved candidates as `분석 제한됨` rather than falsely implying execution;
4. direct URL analysis remains usable after discovery errors;
5. explicit candidate selection is the only action that may enter Deep;
6. no live coarse activation occurs while MV-ARCH-1C is not `QUALITY_VALIDATED`.

The connected Vercel account currently has no MasterV project, so hosted browser interaction has not yet been observed.

## Activation boundary

Do not mark MV-ARCH-1G as fully `RUNTIME_VERIFIED` or `ACTIVATED` from the backend smoke alone.

MV-ARCH-1C remains `NOT QUALITY_VALIDATED`; automatic live coarse remains disabled.
