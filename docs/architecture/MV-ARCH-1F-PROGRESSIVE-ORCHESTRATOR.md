# MV-ARCH-1F — Progressive Orchestrator Runtime

Status: **STATIC_VERIFIED / LIVE_ANALYSIS_NOT_ACTIVATED**

Date: 2026-08-14

## 1. Goal

MV-ARCH-1F connects discovery metadata to already-available coarse evidence without making search depend on Gemini.

```text
YouTube discovery
  -> metadata shortlist
  -> read coarse cache
  -> read coarse replay for cache misses
  -> build orchestration plan
  -> cluster available coarse results
  -> select Deep representatives from available evidence
```

The current runtime does not execute live coarse analysis.

## 2. Progressive response contract

`POST /api/discover/youtube` now returns the original discovery payload plus `orchestration`.

The response can be useful at metadata phase even when no coarse evidence exists.

Orchestration phases:

- `empty`
- `metadata_ready`
- `coarse_partial`
- `coarse_ready`

Unresolved candidates remain `pending_live` or `deferred`; they do not make the discovery response fail.

## 3. Read-only coarse availability

`lib/analysis-service.ts` exposes:

- `buildYouTubeCoarseCacheKey`
- `readAvailableYouTubeCoarseAnalyses`

Availability inspection:

1. verifies canonical YouTube source identity;
2. reads exact current coarse cache key;
3. uses replay only when cache does not resolve the candidate;
4. records cache/replay provenance;
5. leaves unresolved items missing;
6. records optional enrichment errors instead of falling through to live analysis;
7. executes zero Gemini requests and does not touch the analysis budget.

## 4. Quality gate

The default coarse runtime gate remains:

```text
blocked_quality_gate
reason = MV-ARCH-1C is not QUALITY_VALIDATED
```

Therefore the current progressive runtime may plan unresolved candidates but produces zero `coarse_live_batches`.

No request field can enable the calibrated gate from the public discovery route.

Live coarse activation requires a separate server-authoritative change after MV-ARCH-1C quality validation.

## 5. Representative selection

Deep representative planning uses only candidates with available coarse evidence.

Current deterministic priority:

1. delivery-mode cluster coverage;
2. coarse confidence;
3. same-platform native search rank as a tie-breaker;
4. original candidate order;
5. creator concentration cap.

No universal performance score is created.

## 6. Failure isolation

Optional analysis state must not turn a successful discovery into a Gemini failure.

- cache miss: candidate remains unresolved;
- replay miss: candidate remains unresolved;
- cache/replay read error: recorded as enrichment error;
- Gemini unavailable: irrelevant to this read-only path;
- coarse quality gate blocked: metadata still returned.

YouTube discovery provider failures remain discovery failures and are handled by the existing YouTube API route error contract.

## 7. Verification

Normal CI verifies:

- orchestration planning remains Gemini 0-call;
- default 1C gate creates zero live coarse batches;
- cache hit and replay hit are both visible to the planner;
- unresolved candidates remain unresolved;
- metadata-only progressive composition remains usable;
- all existing analysis/cache/budget/discovery contracts still pass;
- Next build passes.

No live YouTube Data API or Gemini request is triggered by CI.

## 8. Limitations

1. MV-ARCH-1E live YouTube discovery smoke is still not completed.
2. MV-ARCH-1C is still not QUALITY_VALIDATED.
3. Live coarse execution is intentionally not connected.
4. Deep execution is not started automatically; only representative source IDs are planned.
5. Search UX remains MV-ARCH-1G scope.
6. Dependency determinism remains unresolved because the repository still has no committed package lock and CI uses `npm install`.

## 9. Next work

Next orchestration work should add a server-authoritative execution boundary that can consume the existing plan only after the relevant gates are satisfied.

Before live coarse activation:

```text
MV-ARCH-1C QUALITY_VALIDATED
  -> calibrated bundle size frozen
  -> server-only gate activation
  -> managed coarse runtime
  -> partial success preservation
```

Search metadata must remain independently usable throughout that transition.
