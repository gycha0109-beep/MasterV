# MV-ARCH-1D-A — Analysis Runtime Foundation

## Status

- State: `STATIC_VERIFIED`
- Scope: canonical source identity + execution boundary + cache/replay abstraction + model budget state machine + Deep/Coarse managed adapters
- Persistent production storage: **not implemented**
- Live Gemini runtime validation for this layer: **not run**

## Runtime order

```text
canonical source identity
  -> cache lookup
  -> replay lookup when replay mode
  -> model budget preflight
  -> live analyzer only for unresolved items
  -> validate source mapping
  -> cache successful values
  -> update budget/queue state
```

Cache hit and replay mode execute zero live Gemini calls.

## Source identity

`lib/source-identity.ts` is the canonical YouTube identity authority. Watch, Shorts, youtu.be and mobile watch URLs collapse to `yt:<videoId>` and one canonical watch URL.

The product Deep route and calibration runner now use this shared authority.

## Cache / Replay

`lib/analysis-cache.ts` defines `AnalysisCacheStore`, `AnalysisReplayStore`, `InMemoryAnalysisCacheStore`, and `InMemoryAnalysisReplayStore`.

The in-memory implementations are development/runtime foundations only. They are not a production durability claim.

## Budget manager

`lib/analysis-budget.ts` stores queue state per model.

- `RPD` -> `blocked_rpd`
- `UNKNOWN` -> `blocked_unknown`
- `RPM` / `TPM` -> `paused_rate_limit`
- tracked request count increments once per managed live batch request
- Pacific calendar-day change resets the model budget window
- no fixed `RPD=20` constant is encoded

This state tracks MasterV-managed traffic only and is not authority for all Google project usage.

## Shared execution runtime

`lib/analysis-runtime.ts` supports partial cache hits and one live request for unresolved items. Per-source provenance is `cache`, `replay`, or `live`.

The runtime rejects duplicate input source IDs/cache keys and rejects missing or unknown live output source IDs.

## Analyzer adapters

`lib/analysis-service.ts` adds managed adapters for Deep single-video and Coarse multi-video analysis.

Deep product API traffic now passes through the managed runtime. The calibration harness intentionally continues to call the raw coarse analyzer so cache behavior cannot alter the requested calibration bundle grouping.

## Verification

CI contracts:

- `npm run test:source-identity`
- `npm run test:analysis-cache`
- `npm run test:analysis-budget`

Verified properties include canonical YouTube identity, cache/replay zero-call behavior, request-budget preservation on cache/replay, RPD no-hammer blocking, and Pacific budget-window reset.

## Current limitations

1. Cache and budget stores are process-local memory stores and do not survive restart or coordinate multiple instances.
2. Replay abstraction exists, but a durable real-Gemini fixture loader is not wired into the UI/API yet.
3. Deep schema/prompt cache versions are manually maintained alongside the analyzer.
4. Dependency lockfile is still absent; CI continues to use `npm install`.
5. MV-ARCH-1C bundle quality calibration remains open. No production coarse bundle size is activated.

## Next implementation

### MV-ARCH-1D-B — Durable Dev Replay + Shared Runtime State

1. persist real Deep/Coarse fixture envelopes with cache metadata
2. add file-backed dev replay loader with zero Gemini calls
3. define production persistence adapter boundary for shared reference cache and model budget state
4. add explicit cache hit/miss observability counters
5. add force-refresh/invalidation behavior
6. keep production bundle size unresolved until MV-ARCH-1C quality gate passes

After 1D-B, proceed to MV-ARCH-1E YouTube Discovery MVP.
