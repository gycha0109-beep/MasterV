# MV-ARCH-1G-A — Search UX / Progressive State Wiring

Status: **STATIC_VERIFIED / LIVE_DISCOVERY_NOT_VERIFIED / NOT ACTIVATED**

Date: 2026-08-14

## 1. Goal

Expose the MV-ARCH-1F progressive discovery contract in the main UI without making search wait for Gemini.

```text
keyword search
  -> metadata candidates first
  -> show any existing coarse cache/replay evidence
  -> show per-candidate analysis state
  -> user explicitly selects one candidate
  -> existing single-video Deep analysis
```

The search UI never automatically starts Deep analysis.

## 2. UI state contract

`lib/search-ux.ts` defines the stable presentation states:

- `unanalyzed` -> `미분석`
- `quick_partial` -> `빠른 분석 일부`
- `quick_complete` -> `빠른 분석 완료`
- `queued` -> `분석 대기`
- `limited` -> `분석 제한됨`

Plan-level state is derived from the orchestrator phase. Candidate-level state is derived from `coarse_state` plus the server-authoritative coarse runtime gate.

A cached coarse result is still shown as `빠른 분석 완료` even when live coarse execution is blocked.

An unresolved `pending_live` candidate is shown as:

- `분석 대기` when the server runtime gate is enabled;
- `분석 제한됨` while MV-ARCH-1C remains behind the quality gate.

Deferred candidates remain `미분석`.

## 3. Main UX

The home screen now has two explicit paths.

### Keyword discovery

`DiscoverySearch` calls only:

```text
POST /api/discover/youtube
```

Results render as candidate cards with:

- thumbnail
- search rank
- title
- creator
- duration
- native YouTube view count
- progressive analysis status
- existing coarse delivery mode/confidence/hook/demo/CTA when available

### Explicit Deep analysis

Each candidate has `이 영상 정밀 분석`.

Only that explicit user action calls the existing:

```text
POST /api/analyze
```

The selected candidate URL is also copied into the existing direct-URL input so both entry paths converge on the same Deep analysis flow.

## 4. Failure isolation

- YouTube discovery configuration/quota errors stay inside the discovery UI.
- Discovery failure does not remove the direct URL analysis path.
- Gemini quota errors stay inside the existing Deep analysis error contract.
- Search metadata remains useful without coarse or Deep analysis.
- The client cannot activate live coarse execution.

## 5. Components

- `components/DiscoverySearch.tsx`: query state, discovery request, discovery error isolation.
- `components/DiscoveryResultGrid.tsx`: candidate cards and progressive state rendering.
- `components/DiscoverySearch.module.css`: search-only responsive presentation.
- `lib/search-ux.ts`: deterministic UI status mapping.

## 6. Verification

Normal CI now includes `npm run test:search-ux`.

Contract coverage verifies:

- metadata state -> `미분석`;
- partial coarse state -> `빠른 분석 일부`;
- complete coarse state -> `빠른 분석 완료`;
- cached candidate -> `빠른 분석 완료`;
- pending candidate + blocked gate -> `분석 제한됨`;
- pending candidate + enabled gate -> `분석 대기`;
- deferred candidate -> `미분석`.

The exact implementation checkpoint also passes:

- TypeScript typecheck;
- all pre-existing regression contracts;
- tiered analysis contract;
- YouTube discovery contract;
- search UX contract;
- Next production build.

No live YouTube Data API or Gemini call is triggered by these CI checks.

## 7. Limitations

1. MV-ARCH-1E live YouTube discovery smoke is still incomplete.
2. MV-ARCH-1C remains `NOT QUALITY_VALIDATED`, so automatic live coarse execution remains blocked.
3. Search UX has not been visually/runtime-verified against a real configured YouTube Data API response.
4. Deep candidate selection is explicit and synchronous; no background queue is activated.
5. Dependency determinism remains unresolved because there is no committed lockfile and CI still uses `npm install`.

## 8. Next work

The next safe step is MV-ARCH-1G-B: interaction/runtime verification and UX refinement around real discovery responses when a restricted YouTube Data API runtime is available.

Live coarse activation remains a separate later gate after MV-ARCH-1C quality validation.
