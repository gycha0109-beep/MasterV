# MV-ARCH-1E — YouTube Discovery MVP

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-14

## 1. Scope

MV-ARCH-1E adds metadata-only YouTube discovery before any Gemini analysis.

```text
keyword
  -> YouTube search.list
  -> videos.list metadata hydrate
  -> canonical source identity
  -> exact duplicate removal
  -> duration/date metadata filter
  -> creator + duration diversity sampling
  -> SearchCandidate[]
```

Gemini requests in this stage: **0**.

## 2. Implemented contracts

### Discovery provider

`lib/discovery.ts`

- `DiscoveryProvider`
- `SearchOptions`
- deterministic option normalization
- exact `source_id` / canonical URL dedupe
- duration / published date filter
- creator concentration cap
- duration-bucket round-robin sampling
- discovery diagnostics

DEV_FREE-aligned defaults:

```text
max_results           50
shortlist_limit       12
min_duration_seconds   1
max_duration_seconds 180
max_per_creator        2
```

These defaults are discovery defaults, not a permanent PRODUCT_INTERACTIVE profile. MV-ARCH-1F may override them by runtime profile.

### YouTube provider

`lib/youtube-discovery.ts`

- public YouTube Data API key, server-side only
- `search.list` with `type=video`, relevance ordering, `videoDuration=short`
- one `videos.list` hydrate request for unique IDs
- ISO 8601 duration parsing
- shared canonical identity authority from `lib/source-identity.ts`
- normalized `SearchCandidate`
- native YouTube metrics preserved independently
  - search rank
  - view count
  - like count
  - comment count
- source metadata preserved separately
- upstream/quota errors represented as `YouTubeDiscoveryError`
- exact YouTube API request count recorded
- explicit `gemini_requests: 0`

No universal performance score is created.

### API route

`POST /api/discover/youtube`

Body:

```json
{
  "query": "sunscreen",
  "options": {
    "max_results": 50,
    "shortlist_limit": 12,
    "region_code": "KR",
    "relevance_language": "ko"
  }
}
```

The route requires `YOUTUBE_DATA_API_KEY` and does not depend on `GEMINI_API_KEY`.

## 3. Request budget

Normal non-empty discovery:

```text
YouTube search.list   1 request
YouTube videos.list   1 request
Gemini                0 requests
```

If search returns no video IDs, `videos.list` is skipped.

## 4. Static verification

`npm run test:youtube-discovery` verifies with deterministic fake YouTube responses:

- exactly one `search.list` + one `videos.list`
- `type=video`
- `videoDuration=short`
- region/language forwarding
- duplicate search IDs hydrate only once
- canonical `yt:<videoId>` identities
- exact duplicate removal
- creator cap
- duration diversity sampling
- native metric preservation
- ISO duration conversion
- zero Gemini requests

The contract is part of normal CI together with all pre-existing regression tests and `next build`.

## 5. Runtime verification

Manual GitHub Actions Runtime Smoke run:

```text
run_id: 31760373402
branch: feat/mvp-foundation
head: 62f2347cd3d7d9bc409c49d4c41ecb6d57bb4a33
query: sunscreen review shorts
```

Observed result:

```text
status: YOUTUBE_DISCOVERY_SMOKE_PASS
discovered_count: 10
deduped_count: 10
filtered_count: 10
shortlisted_count: 5
youtube_api_requests: 2
gemini_requests: 0
```

The uploaded `youtube-discovery-smoke` artifact was inspected. All five returned candidates had:

- canonical `yt:<videoId>` source IDs;
- canonical `https://www.youtube.com/watch?v=<videoId>` URLs;
- real titles and creator metadata;
- parsed durations;
- native search rank;
- native view/like/comment metrics when supplied by YouTube.

The workflow separately showed:

- `Verify YouTube secret exists`: success;
- `Run one-shot YouTube discovery smoke`: success;
- artifact upload: success;
- `gemini-smoke`: skipped.

This is sufficient to promote the metadata discovery backend to `RUNTIME_VERIFIED`.

## 6. Deliberate limitations

1. One search page only. MV-ARCH-1E caps discovery at 50 candidates; PRODUCT_INTERACTIVE pagination belongs to a later profile/orchestration decision.
2. Duplicate detection is exact identity/canonical URL only. Reuploads with different YouTube video IDs are not claimed to be detected without a media fingerprint or stronger evidence.
3. YouTube relevance ordering remains the platform-native search signal. MasterV does not invent a cross-platform performance score.
4. No coarse/deep analysis is triggered by discovery.
5. Runtime verification above proves the discovery backend/provider path, not browser interaction UX.
6. This stage is still `NOT ACTIVATED`; no production deployment/runtime activation has been established.

## 7. Next stage

MV-ARCH-1F/1G may compose the verified discovery backend as:

```text
search
  -> metadata shortlist
  -> cache-aware coarse target selection
  -> cluster / representative pick
  -> deep few
```

Discovery remains independently usable when Gemini analysis is blocked.
