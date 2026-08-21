# MV-ARCH-1G-C — Search UX Browser E2E Smoke

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-14

## Goal

Close the remaining browser-runtime gap after MV-ARCH-1E proved the YouTube discovery backend with a real API call.

```text
keyword input
  -> browser POST /api/discover/youtube
  -> real YouTube Data API metadata
  -> result cards render
  -> blocked coarse quality gate is represented honestly
  -> no /api/analyze request occurs automatically
```

## Execution environment

Manual-only `Runtime Smoke` target:

```text
search-ux-browser
```

The dispatcher has an explicit `execution_ref` authority. Its default is `feat/mvp-foundation`, and each runtime job passes that ref to `actions/checkout`, so the code under test is not inferred from the workflow-definition branch.

The browser job verifies `YOUTUBE_DATA_API_KEY`, verifies that `GEMINI_API_KEY` is absent, ensures Chrome and Korean-capable fonts, builds and starts the production Next.js app, drives Chrome through CDP, and uploads JSON/screenshots/logs.

No Playwright/Puppeteer dependency is added.

## Browser contract

Before search:

- discovery input exists;
- direct URL analyzer exists and is empty;
- no result grid exists.

After entering the query and clicking the actual search button:

```text
/api/discover/youtube requests = 1
/api/discover/youtube response = HTTP 200
/api/analyze requests = 0
```

With MV-ARCH-1C still not quality validated, results must show:

- at least one candidate;
- plan-level `자동 빠른 분석 제한`;
- pending candidates labeled `분석 제한됨`;
- metadata-only explanation;
- one explicit Deep action per candidate;
- direct URL analyzer still unpopulated before explicit selection.

The smoke never clicks Deep.

Responsive verification requires:

- exact `window.innerWidth === 390`;
- no document-level horizontal overflow;
- first result card fits within the viewport;
- `/api/analyze` remains zero.

## Live run 1 — behavioral PASS

```text
run_id: 31763089540
head: 12f9d1ac7785a31394f811be4009794f8437256a
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

This proved the real production Next server + browser + YouTube Data API search path and the zero-auto-Deep boundary.

The first harness had no Korean font and its mobile emulation reported 494 CSS pixels instead of the intended 390, so its mobile visual result was not accepted as final evidence.

## Harness correction

After run 1:

- install `fonts-noto-cjk` only when no Korean-capable font exists;
- use a fixed 390px CSS viewport;
- fail unless `window.innerWidth === 390`;
- retain no-overflow/card-fit/zero-Deep assertions.

## Live run 2 — real mobile overflow discovered

```text
run_id: 31763430735
head: b42076353a1cfae1788152011dd4d69047d5b341
result: FAILURE
viewport_width: 390
document_width: 494
discovery_requests: 1
discovery_status: 200
analyze_requests: 0
```

The corrected harness proved that the 494px width was not only an emulation artifact. The page actually overflowed by 104px at a 390px viewport.

Root cause was the mobile sidebar navigation intrinsic width:

```text
5 * 86px minimum nav item width
+ 4 * 7px grid gap
+ 36px sidebar horizontal padding
= 494px
```

`overflow-x: auto` existed on the nav, but the flex/grid intrinsic minimum width still expanded the document.

## Product fix

Commit `83d5c5c758e935d239d7a12286b2d376d16b07a1` adds a mobile containment rule:

```css
@media (max-width: 640px) {
  .sidebar { min-width: 0; }
  .sidebar nav { width: 100%; min-width: 0; max-width: 100%; }
}
```

The sidebar remains viewport-bound while the five navigation items scroll inside the nav container instead of expanding the document.

This is a product CSS fix, not a smoke bypass.

## Dispatcher hardening incidents

Two later manual attempts did not produce valid post-fix browser evidence:

- run `31763705848` checked out `main`, which only contained the dispatcher and therefore failed before browser execution because `package.json` was absent;
- run `31766221748` accidentally used the old default `target=gemini`, so `search-ux-browser-smoke` was skipped and one live Gemini smoke executed successfully.

The dispatcher was hardened after these incidents:

- explicit `execution_ref`, default `feat/mvp-foundation`;
- `target` default changed to `search-ux-browser`;
- live Gemini requires explicit `gemini_live_confirm=RUN_GEMINI`;
- without that confirmation, the live Gemini job is not eligible to run.

## Final live run — full PASS

```text
run_id: 31766510601
head: 6874924373187ccde1ed9d91ffdb140c153287e0
result: SUCCESS
status: SEARCH_UX_BROWSER_SMOKE_PASS
query: sunscreen review shorts
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
mobile_viewport_width: 390
mobile_document_width: 375
mobile_no_horizontal_overflow: true
mobile_first_card_width: 335
mobile_first_card_fits_viewport: true
```

Artifact inspection also confirmed:

- Korean text renders normally in both desktop and mobile screenshots;
- desktop candidate layout renders 12 cards and preserves the explicit Deep action boundary;
- mobile content remains inside the viewport after the sidebar containment fix.

Therefore MV-ARCH-1G-C is **RUNTIME_VERIFIED**.

## Evidence artifact

Final run artifact:

```text
artifact_id: 9206523380
sha256: acb9e4733acddf87a69a05e2ff2f4beaf6b91688a75ee5363cc9ccaebc34c089
```

Contents:

```text
artifacts/search-ux-browser/
  search-ux-browser-smoke.json
  desktop-search-results.png
  mobile-search-results.png
  chrome.log
  server.log
```

No API key value is written to artifacts.

## CI boundary

Normal CI does not execute Chrome or call YouTube. It performs `node --check` through:

```text
npm run test:search-ux-browser-script
```

and then runs the existing regression suite and production build.

## Activation boundary

`RUNTIME_VERIFIED` does not imply production activation.

Live coarse remains disabled because MV-ARCH-1C is still `NOT QUALITY_VALIDATED`. Search remains Gemini-free and Deep still requires an explicit candidate or URL action.

## Batch safety

`gemini-batch-submit` and `gemini-batch-check` remain hidden from dispatcher choices while MV-ARCH-1H-B is blocked on an unverified paid-tier precondition.
