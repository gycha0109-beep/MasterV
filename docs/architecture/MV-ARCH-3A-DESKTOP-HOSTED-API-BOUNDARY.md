# MV-ARCH-3A — Desktop Surface + Hosted API Boundary

Status: **STATIC_VERIFIED / HOSTED_BOUNDARY_DEPLOYED / AUTHENTICATED_RUNTIME_NOT_VERIFIED / NOT ACTIVATED**

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

Tauri hosts static frontend assets and does not natively provide a Next.js server runtime. The desktop build therefore cannot depend on local `/api/*` route handlers being present in the packaged executable.

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

## Live authenticated smoke

`scripts/hosted-api-boundary-smoke.ts` is prepared to:

1. sign in using the existing Supabase Auth test user;
2. call `masterv-api-boundary` with the real user JWT;
3. require HTTP 200 and `mv-hosted-api-v1`;
4. prove the endpoint is authenticated;
5. assert `analyze` and `youtube_discovery` are still not migrated;
6. execute with no Gemini or YouTube credentials.

This smoke is not yet executed at this checkpoint.

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

Before MV-ARCH-3B, the client frontend must become compatible with static export or be separated into a desktop SPA surface. Existing Next.js route handlers must not be treated as part of the packaged desktop runtime.

## Promotion gate

3A becomes `RUNTIME_VERIFIED` when:

- the authenticated hosted boundary smoke passes using a real Supabase user JWT;
- unauthenticated access remains gateway-protected;
- Gemini/YouTube request count remains zero;
- exact-head CI passes.

`ACTIVATED` remains separate.

## Next

After the hosted boundary is runtime verified:

```text
MV-ARCH-3B — Tauri Desktop Shell + Static Client Build
```

Then migrate hosted workloads one route at a time rather than coupling desktop packaging to a wholesale backend rewrite.
