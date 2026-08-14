# MV-ARCH-1G-C — Search UX Browser E2E Smoke

Status: **RUNTIME_VERIFIED_BEHAVIOR / VISUAL_HARNESS_RETRY_REQUIRED / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Close the remaining browser-runtime gap after MV-ARCH-1E proved the YouTube discovery backend with a real API call.

The smoke verifies the real product UI flow in a production Next.js server without activating live coarse analysis or automatic Deep analysis.

```text
keyword input
  -> browser POST /api/discover/youtube
  -> real YouTube Data API metadata
  -> result cards render
  -> blocked coarse quality gate is represented honestly
  -> no /api/analyze request occurs automatically
```

## Execution environment

The smoke is manual-only through the existing `Runtime Smoke` workflow target:

```text
search-ux-browser
```

The GitHub Actions job:

1. checks out the selected branch;
2. installs the existing repository dependencies;
3. verifies `YOUTUBE_DATA_API_KEY` exists;
4. explicitly verifies `GEMINI_API_KEY` is absent from the browser-smoke job;
5. verifies a Chrome/Chromium executable exists on the runner;
6. ensures a Korean-capable font is available for screenshot evidence;
7. builds the production Next.js app;
8. starts `next start` on `127.0.0.1:3000`;
9. drives headless Chrome through the Chrome DevTools Protocol;
10. uploads JSON evidence, desktop/mobile screenshots, Chrome log, and Next server log.

No Playwright/Puppeteer dependency is added. This avoids increasing the existing unresolved npm dependency-determinism surface.

## Browser contract

`scripts/search-ux-browser-smoke.mjs` performs these checks against the actual rendered DOM.

### Before search

- discovery search input exists;
- existing direct URL analyzer input exists;
- direct URL input is empty;
- no result grid is rendered yet.

### Search interaction

The smoke enters a real query using the native input setter + bubbling input event and clicks the actual `참고영상 찾기` button.

It waits for real result cards rather than calling the discovery library directly.

### Network observations

Browser CDP network events must prove:

```text
/api/discover/youtube requests = 1
/api/discover/youtube response = HTTP 200
/api/analyze requests = 0
```

The browser job has no Gemini credential, providing a second boundary against accidental Deep execution.

### Result-state checks

With MV-ARCH-1C still not quality validated and no server-authoritative calibrated coarse gate enabled, the rendered result must show:

- at least one candidate card;
- plan-level `자동 빠른 분석 제한` indication;
- at least one candidate labeled `분석 제한됨`;
- metadata-only explanation while coarse auto-analysis is blocked;
- one explicit `정밀 분석` action per candidate;
- direct URL analyzer remains unpopulated because no candidate was selected.

The smoke intentionally does **not** click a Deep-analysis candidate action.

### Responsive check

After the desktop evidence is captured, Chrome is switched to an exact 390×844 responsive CSS viewport.

The smoke verifies:

- `window.innerWidth === 390`;
- no document-level horizontal overflow;
- the first result card fits within the viewport;
- no `/api/analyze` request appears after responsive layout changes.

## First live browser run — behavioral evidence

GitHub Actions Runtime Smoke:

```text
run_id: 31763089540
branch: feat/mvp-foundation
head: 12f9d1ac7785a31394f811be4009794f8437256a
query: sunscreen review shorts
result: SUCCESS
candidate_cards: 12
discovery_requests: 1
discovery_status: 200
analyze_requests: 0
gemini_api_key_present: false
automatic_deep_analysis_observed: false
plan_limited_badge: true
limited_card_count: 8
precise_action_count: 12
thumbnail_count: 12
metadata_only_copy: true
```

This is sufficient to mark the **behavioral browser path runtime verified**: a real production Next server, a real browser interaction, and a real YouTube Data API discovery response all completed without any automatic Deep request.

The first artifact also reported no horizontal overflow and a fitting first card, but the visual harness itself had two limitations:

1. the GitHub Ubuntu image had no Korean-capable font, so Korean screenshot glyphs rendered as tofu boxes;
2. CDP mobile device emulation produced `window.innerWidth = 494` instead of the intended 390 CSS pixels after switching from the already-loaded desktop page.

Those are test-harness limitations, not evidence of product failure. They prevent claiming the original screenshot as final mobile visual evidence.

## Harness correction after first run

The smoke was tightened without changing product code:

- the workflow installs `fonts-noto-cjk` only when the runner has no Korean-capable font;
- responsive verification now uses a fixed 390px CSS viewport rather than mobile device scaling;
- the script fails unless `window.innerWidth === 390`;
- no-overflow and card-fit assertions remain mandatory;
- Gemini remains absent and `/api/analyze` must remain zero.

One corrected manual browser run is required before the full stage is closed as `RUNTIME_VERIFIED`.

## Evidence artifact

Manual run uploads:

```text
artifacts/search-ux-browser/
  search-ux-browser-smoke.json
  desktop-search-results.png
  mobile-search-results.png
  chrome.log
  server.log
```

The JSON artifact records:

- query;
- candidate count;
- discovery request count/status;
- `/api/analyze` request count;
- blocked-gate UI checks;
- mobile viewport/overflow checks;
- whether a Gemini key was present;
- whether automatic Deep analysis was observed.

No API key value is written to artifacts.

## CI boundary

Normal CI does not execute Chrome or call YouTube.

It only runs:

```text
npm run test:search-ux-browser-script
```

which performs `node --check` on the browser smoke script, then the existing full regression suite and production build continue as normal.

## Runtime verification gate

The behavioral half of MV-ARCH-1G-C is already runtime verified by run `31763089540`.

Full `RUNTIME_VERIFIED` additionally requires one corrected `search-ux-browser` run that produces a PASS artifact with:

- Korean-capable screenshot rendering;
- exact 390px mobile CSS viewport;
- no horizontal overflow;
- the same zero-auto-Deep boundary.

A successful backend-only YouTube discovery smoke is not enough for this stage; that evidence belongs to MV-ARCH-1E.

## Activation boundary

Even a successful browser smoke does not activate live coarse analysis.

MV-ARCH-1C remains `NOT QUALITY_VALIDATED`, so:

- automatic live coarse remains disabled;
- no calibrated coarse gate is injected from the client;
- search itself remains Gemini-free;
- Deep analysis still requires an explicit candidate or URL action.

## Batch safety follow-up

The `Runtime Smoke` UI no longer exposes `gemini-batch-submit` or `gemini-batch-check` as selectable targets while MV-ARCH-1H-B is blocked on an unverified paid-tier precondition.

The guarded Batch implementation remains in the branch for future reopening, but accidental manual submission is removed from the normal dispatcher choices.
