# MV-ARCH-1D-B — Durable Dev Replay + Shared Runtime State

## Status

- Overall: `STATIC_VERIFIED`
- Production persistence: **not activated**
- Runtime storage default: in-memory
- Optional local/dev persistence: file-backed cache + budget state
- Replay mode: file-backed `analysis-replay-v1`
- Live Gemini workflows: manual-only

## Scope

1D-B extends the 1D-A execution boundary without changing the analyzer semantics.

```text
canonical source identity
  -> cache lookup or bypass
  -> replay lookup when configured
  -> budget preflight
  -> live analyzer only when required
  -> cache write
  -> budget update
  -> execution observability
```

## Replay fixture contract

Successful model outputs can be stored in an `analysis-replay-v1` envelope.

Each entry contains:

- exact analysis cache key
- canonical source ID
- analyzer tier
- schema version
- prompt version
- model
- media resolution
- raw validated analyzer value

The replay store looks up by the same cache key used by the live runtime. Schema, prompt, model, tier, or media-resolution changes therefore produce a replay miss instead of silently reusing stale output.

`ANALYSIS_RUN_MODE=replay` plus `ANALYSIS_REPLAY_FILE=<path>` enables the zero-Gemini path.

## Durable dev state

`ANALYSIS_RUNTIME_STATE_DIR=<directory>` switches the default managed runtime from process-memory stores to:

- `analysis-cache.json`
- `analysis-budget.json`

The file adapters preserve cache and model budget state across adapter recreation and local server restarts.

This is a **development/local persistence adapter**, not a production multi-instance database. Writes are serialized inside one Node process and use temp-file rename, but cross-host/process distributed locking is not provided.

Production persistence must implement the same `AnalysisCacheStore` / `AnalysisBudgetStore` contracts using an external durable store before multi-instance deployment.

## Cache behavior

Runtime observability now records:

- requested count
- cache hit count
- cache miss count
- cache bypass count
- replay hit count
- live source count
- live request count

`force_refresh=true` bypasses cache lookup and executes the selected run mode. In live mode a successful result replaces the existing cache entry. Explicit cache invalidation is supported by the default in-memory and file-backed adapters.

## Pilot replay generation

`real-product-pilot.ts` now emits two artifacts from the same run:

- `artifacts/real-product-pilot.json`
- `artifacts/analysis-replay-deep.json`

Successful Deep outputs are written with their exact runtime cache keys, so they can be replayed later without a Gemini call.

No synthetic Deep output is committed as if it were real provider evidence. If the live pilot has zero successful analyses, the replay artifact contains zero entries.

## Quota safety correction

A repository audit found two live Gemini workflows that could run from branch pushes:

- Real Product Shorts Pilot
- Gemini Runtime Smoke

Both are now `workflow_dispatch` only. Coarse Bundle Calibration was already manual-only.

The pilot retry policy was also corrected:

- explicit RPM/TPM + provider retry delay: bounded retry allowed
- RPD: stop
- UNKNOWN: stop
- no retry delay: stop

During the corrective commit, the legacy push trigger launched Real Product Shorts Pilot Run #27 once before the workflow was changed. The run made one Gemini request, received an UNKNOWN quota response, and the corrected pilot stopped immediately. It did not retry or continue to the remaining selected videos.

## Verification

Static contracts cover:

- cache hit uses zero live requests
- replay uses zero live requests and zero budget
- force refresh bypasses cache and replaces it on success
- file cache survives adapter recreation
- explicit file cache invalidation
- file replay envelope loading
- file budget state survives adapter recreation
- RPD block prevents a second live call
- Pacific-day reset releases the prior RPD block
- full TypeScript/build regression

## Remaining boundary

1D-B does not claim:

- production distributed persistence
- cross-process file locking
- paid-tier quota authority
- bundle-size quality validation
- 1C completion

MV-ARCH-1C remains a separate open quality gate.

## Next

After exact-head CI is green, the next implementation stage is `MV-ARCH-1E — YouTube Discovery MVP`:

```text
keyword
  -> YouTube discovery
  -> SearchCandidate normalization
  -> deterministic dedupe/filter/diversity
  -> metadata result set
```

Discovery must remain usable even when Gemini analysis is unavailable.
