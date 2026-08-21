# MV-ARCH-3A — Desktop Surface + Hosted API Boundary

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Prepare MasterV for a desktop-first client without embedding server-only Next.js API routes or provider secrets inside the desktop executable.

Target architecture:

```text
MasterV Desktop (Tauri)
  -> static frontend bundle
  -> Supabase Auth session
  -> authenticated hosted API
       -> Gemini / YouTube / future subscription authority
  -> Supabase Postgres + RLS
```

The existing web/Next.js surface remains valid during migration.

## Why a hosted boundary is required

Tauri hosts static frontend assets and does not provide a Next.js server runtime. The desktop build therefore cannot depend on local `/api/*` route handlers being present in the packaged executable.

The migration rule is:

```text
web surface
  relative /api/* allowed during transition

desktop surface
  remote API base URL required
```

`lib/runtime-api.ts` encodes this boundary.

Environment:

```text
NEXT_PUBLIC_MASTERV_SURFACE=web | desktop
NEXT_PUBLIC_MASTERV_API_BASE_URL=https://...
```

Desktop mode without a hosted API base URL fails configuration validation instead of silently falling back to a nonexistent local server.

## Hosted canary

A first Supabase Edge Function is deployed to the dedicated MasterV project:

```text
project_ref: euqkjrmrhhvnyzasppnd
function: masterv-api-boundary
version: 1
status: ACTIVE
verify_jwt: true
```

Contract:

```json
{
  "service": "masterv-hosted-api",
  "contract_version": "mv-hosted-api-v1",
  "authenticated": true,
  "capabilities": {
    "boundary_probe": true,
    "analyze": false,
    "youtube_discovery": false,
    "product_truth": false
  }
}
```

This endpoint intentionally does not claim that production workloads have been migrated.

The source is tracked at:

```text
supabase/functions/masterv-api-boundary/index.ts
```

## Security boundary

The function requires a valid JWT at the Supabase gateway.

Desktop clients are expected to send:

```text
Authorization: Bearer <Supabase user JWT>
apikey: <publishable key>
```

No service-role key, Gemini key, or YouTube key belongs in the desktop bundle.

## Runtime API contract

`lib/runtime-api.ts` provides:

- web/desktop surface normalization;
- hosted API base URL validation;
- relative URL preservation for the current web surface;
- mandatory remote origin for desktop mode;
- authenticated API header construction.

`npm run test:runtime-api` verifies these semantics without making a network request.

## Live authenticated verification

Runtime Smoke run:

```text
run_id: 31842641313
execution_ref: feat/mvp-foundation
head: b186efb775fa6bc30df8e112824d8501586deb2d
result: SUCCESS
```

The live authenticated result proved:

```text
hosted_api_boundary_verified = true
hosted_api_contract_version = mv-hosted-api-v1
hosted_api_analyze_migrated = false
hosted_api_youtube_discovery_migrated = false
revision = 2
first_saved_at_preserved = true
cross_workspace_write_denied = true
Gemini requests = 0
YouTube requests = 0
```

The browser persistence leg also passed:

```text
reference_rest_requests = 6
analyze_requests = 0
restored_after_reload = true
```

Cleanup removed the synthetic smoke reference successfully.

Therefore the hosted boundary has been invoked with a real authenticated Supabase user session without exposing Gemini or YouTube credentials.

## Workload placement decision

Supabase Edge Functions are suitable for authenticated short-lived orchestration, but hosted limits must be respected.

Therefore 3A does not automatically move the current Deep analysis runtime.

Migration candidates are separated:

```text
youtube discovery
  likely Edge-suitable; external I/O dominated

product-truth interpretation
  candidate for Edge after runtime/secret contract review

deep Gemini video analysis
  requires explicit duration/CPU/SDK compatibility validation before migration
```

If Deep analysis exceeds Edge constraints, the desktop architecture still remains valid; only the hosted compute provider for that route changes.

## Tauri boundary

No Tauri shell is created in 3A.

The current Next.js application still contains server route handlers, so the desktop build must not pretend those handlers exist inside a packaged Tauri executable. 3B creates a separate static desktop surface first and keeps backend migration independent.

## Status boundary

3A is now `RUNTIME_VERIFIED`.

It is not `ACTIVATED` because no distributed desktop application consumes this boundary yet, and production analyze/discovery workloads have not migrated.

## Next

```text
MV-ARCH-3B — Tauri Desktop Shell + Static Client Build
```

Then migrate hosted workloads one route at a time rather than coupling desktop packaging to a wholesale backend rewrite.
