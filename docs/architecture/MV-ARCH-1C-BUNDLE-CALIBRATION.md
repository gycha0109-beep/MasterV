# MV-ARCH-1C — Bundle Calibration

## Status

- Overall: `RUNTIME_VERIFIED / NOT QUALITY_VALIDATED`
- Production bundle size: **not decided**
- Activation: **not allowed**
- Live run: GitHub Actions `Coarse Bundle Calibration` Run #2 (`31686069770`)
- Live run HEAD: `a6267db71dfad3827deb439b7ed6379692bc9177`
- Model: `gemini-3.6-flash`
- Checkpoint artifact: `artifacts/coarse-bundle-calibration.json`

## 2026-08-13 live checkpoint

The staged run selected the first 8 fixtures and requested bundle sizes `1,2,4`.
The runner was configured to stop the entire calibration immediately after a quota/rate-limit error.

Observed sequence:

1. `size=1`, fixture 0: Gemini returned a mutated source ID `yt:SxNmUxodRqo00:00`; strict source validation rejected it.
2. `size=1`, fixture 1: Gemini returned `yt:VI_zXC_olWE00:00`; rejected.
3. `size=1`, fixture 2: Gemini returned `yt:M7U5D3lURK800:00`; rejected.
4. `size=1`, fixture 3: Gemini returned `yt:7A7GuL6cnd800:00`; rejected.
5. `size=1`, fixture 4: Gemini returned HTTP 429. The error reported metric `generativelanguage.googleapis.com/generate_content_free_tier_requests`, limit `20`, model `gemini-3.6-flash`.
6. The runner stopped immediately and wrote/uploaded the checkpoint artifact. No size-2 or size-4 request was attempted after the 429.

Result summary:

- attempted runs: 5
- successful coarse outputs after validation: 0
- source-ID mutation failures: 4
- quota stop: 1
- bundle-size quality comparison available: no
- source-attribution bleed measurement available: no, because there is no successful single-video baseline yet

## Findings

### F1 — Prompt-only source identity is insufficient

The v1 response schema allowed any string for `source_id`. Although the prompt required the exact input ID, all four completed live responses appended `00:00` to the ID.

This is a runtime contract failure, not a bundle-quality result. It must be fixed before baseline-vs-bundle comparison is meaningful.

### F2 — Quota stop behavior works

The fifth request returned 429 and the calibration runner stopped the outer calibration loop. This validates the no-hammering requirement at runtime.

The returned quota payload did not expose a quota ID that proves the quota dimension. Given the observed request spacing, the daily project usage context, the metric, and the limit value, RPD exhaustion is the leading interpretation, but the stored artifact preserves the raw error instead of rewriting it as a definitive classification.

### F3 — 2/4/6/10 are still unvalidated

No successful single-video baseline exists from this run. Therefore:

- bundle size 2: not quality validated
- bundle size 4: not quality validated
- bundle size 6: not run
- bundle size 10: not run
- production bundle size: undecided

The architecture must continue to assume bundle size 1 as the safe fallback until calibration succeeds.

## Corrective implementation after the live run

The coarse response contract was upgraded to `coarse-v2`.

Changes:

- response `source_id` is dynamically constrained with a JSON Schema enum containing only the current input source IDs
- response `videos` uses `minItems` and `maxItems` equal to the input video count
- duplicate/blank input IDs are rejected before a live Gemini request
- post-response missing/unknown/duplicate source validation remains enabled
- timestamp-mutated IDs such as `yt:A00:00` remain rejected
- deterministic calibration evaluator added for baseline-vs-bundle comparison
- live calibration workflow changed to manual-only so ordinary pushes cannot consume Gemini quota

The schema constraint is a prevention layer; it still requires a live run after quota reset before the source-ID fix can be marked `RUNTIME_VERIFIED`.

## Evaluation metrics prepared

Once a valid baseline exists, `scripts/evaluate-coarse-bundle-calibration.ts` calculates per bundle size:

- primary delivery mode agreement
- CTA agreement
- direct-demo agreement
- multi-product agreement
- product-first-seen MAE
- product-first-seen null mismatch count
- hook exact agreement and token Jaccard
- rough-structure token Jaccard
- neighbor-match source-shift signals for bleed review

The neighbor-match signal is a review heuristic, not an automatic proof of bleed.

## Next live execution

Do not retry during the exhausted quota window.

At the next usable project quota window:

1. Run a **single fixture / bundle size 1** smoke first to verify `coarse-v2` source identity at runtime.
2. Only if that passes, complete the remaining single-video baselines.
3. Run size 2.
4. Run size 4.
5. Evaluate baseline-vs-2-vs-4 with the deterministic evaluator.
6. If size 4 shows material attribution bleed, stop and do not spend quota on 6/10.
7. If size 4 is stable, proceed to 6 and then 10 in later staged runs as quota permits.
8. Decide production bundle size only after the 12-fixture comparison has sufficient successful coverage.

Gemini RPD quotas reset at midnight Pacific time. The runner must still treat the observed project quota/error as the source of truth rather than hard-coding a fixed RPD value.
