# MV-ARCH-1G-B — Discovery Runtime Smoke Gate

Status: **STATIC_VERIFIED / LIVE_SMOKE_READY / LIVE_NOT_EXECUTED**

Date: 2026-08-14

## Goal

Verify the real YouTube discovery path before promoting MV-ARCH-1E/1G to runtime-verified status.

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

The existing manual-only `Runtime Smoke` workflow now has a target selector:

- `gemini`: preserves the existing Gemini runtime smoke;
- `youtube-discovery`: runs only the YouTube discovery smoke job.

When `youtube-discovery` is selected, the Gemini job is skipped and no `GEMINI_API_KEY` is exported to the YouTube job.

Required repository secret:

```text
YOUTUBE_DATA_API_KEY
```

The connector cannot list repository secret names, so secret presence must be verified by the workflow or by the repository owner.

## UX refinement frozen in this checkpoint

- a failed new discovery request no longer erases previously loaded candidate results;
- candidate-triggered Deep analysis records the selected `source_id`;
- only the selected card shows `이 영상 분석 중...`;
- other cards show that another analysis is running;
- successful Deep analysis scrolls to the result;
- failed Deep analysis scrolls to the direct-analysis error surface.

## Promotion gate

Do not mark MV-ARCH-1E or MV-ARCH-1G as `RUNTIME_VERIFIED` until a real `youtube-discovery` smoke run succeeds and its artifact is inspected.

A browser interaction smoke remains desirable after a live runtime/deployment exists. Vercel currently has no MasterV project available through the connected account, so no hosted interaction smoke was performed in this checkpoint.
