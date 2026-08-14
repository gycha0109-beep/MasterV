# MV-ARCH-2C — Auth + Workspace Bootstrap + Live Persistence

Status: **STATIC_VERIFIED / LIVE_AUTH_USER_REQUIRED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Connect the MV-ARCH-2A Reference Library domain and MV-ARCH-2B Supabase adapter to an authenticated user session without weakening RLS or exposing service-role credentials.

Target runtime flow:

```text
Supabase email/password auth
  -> authenticated user session
  -> personal workspace_id = user:<auth.uid()>
  -> self-bootstrap membership guarded by RLS
  -> Reference Library store
  -> save/list/update/delete
  -> browser reload
  -> session restore + DB list restore
```

## Live database state before 2C UI activation

Dedicated project:

```text
project: MasterV
ref: euqkjrmrhhvnyzasppnd
region: ap-northeast-1
status: ACTIVE_HEALTHY
```

The 2B schema is live.

Security hardening has already been applied:

- membership helper runs as `SECURITY INVOKER`;
- anon execute is revoked;
- membership foreign key has a covering index;
- auth UID policy uses `(select auth.uid())` initialization-plan form;
- security advisor currently reports zero lints.

## Personal workspace bootstrap

`supabase/migrations/202608150001_personal_workspace_bootstrap.sql` adds one narrowly scoped insert policy on `masterv_workspace_members`.

An authenticated user may insert only:

```text
user_id = auth.uid()
workspace_id = user:<auth.uid()>
role = owner
```

A client cannot choose another user ID or arbitrary workspace ID and gain access through this policy.

No update/delete membership grant is introduced by this stage.

## Auth client

`lib/supabase-auth.ts` implements the minimal public-client Auth surface using native `fetch`:

- password sign-in;
- password sign-up;
- refresh-token rotation;
- current-user validation;
- logout;
- one-minute early refresh threshold;
- deterministic personal workspace identity.

Public configuration is read from:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

No service-role key is used or expected in client code.

Browser session storage key:

```text
masterv.supabase.session.v1
```

The stored session is revalidated against Supabase Auth on reload before it is promoted back into application authority.

## Workspace session adapter

`lib/reference-library-session.ts`:

1. derives `user:<auth.uid()>`;
2. performs an idempotent membership bootstrap request;
3. constructs `SupabaseReferenceLibraryStore` with the authenticated user's bearer token.

RLS remains the authorization authority.

## React persistence hook

`lib/use-persistent-reference-library.ts` owns:

- restore from local browser session;
- refresh expired/nearly expired session;
- Auth user verification;
- personal workspace bootstrap;
- DB list restore;
- sign-in/sign-up/sign-out;
- persistent upsert/delete;
- reload of library state.

A failed persistent write is surfaced as an error. The application does not silently claim persistence by falling back to a local save after a DB failure.

## UX compatibility boundary

`app/page.tsx` now has two modes:

```text
Supabase unconfigured / signed out
  -> existing browser-session comparison tray

Supabase authenticated and ready
  -> Supabase Reference Library is the comparison authority
```

Existing discovery and Deep analysis UX therefore remain usable before persistence activation.

When persistent mode is ready:

- Deep response `execution.cache_key` and `execution.provenance` are saved with the analysis snapshot;
- URL/source/cache-key identity guard remains active;
- DB records drive comparison;
- refresh restoration comes from the Reference Library;
- derived metrics are still not persisted.

## Static contracts

`npm run test:supabase-auth` verifies with fake HTTP:

- sign-in endpoint and normalized email;
- sign-up response handling;
- refresh flow;
- current-user validation;
- one-minute early refresh rule;
- personal workspace ID derivation;
- bootstrap request body cannot accept arbitrary workspace identity;
- bearer token and publishable key usage.

`npm run test:reference-library-browser-script` checks the browser smoke harness syntax without making a live request.

All existing contracts remain in CI.

## Manual live smoke

Runtime Smoke target:

```text
reference-library
```

Required GitHub Secrets:

```text
SUPABASE_TEST_EMAIL
SUPABASE_TEST_PASSWORD
```

The project URL and publishable key are public frontend configuration in the manual workflow. The job deliberately receives neither `GEMINI_API_KEY` nor `YOUTUBE_DATA_API_KEY`.

Sequence:

1. sign in with the test user;
2. bootstrap the user's personal workspace;
3. delete any previous synthetic smoke row;
4. insert synthetic Deep snapshot -> revision 1;
5. upsert same canonical source -> revision 2;
6. verify `first_saved_at` preservation;
7. verify write to an unowned workspace is denied by RLS;
8. keep the synthetic row temporarily;
9. build/start Next with public Supabase config;
10. headless Chrome signs in through the real UI;
11. verify the synthetic DB reference appears;
12. reload the page;
13. verify Auth session and DB reference restore;
14. assert `/api/analyze` was never called;
15. collect screenshots/evidence;
16. cleanup the synthetic row.

The synthetic source is explicitly not a real analysis claim:

```text
yt:MVpersist01
```

## Current blocker

At the latest live DB check:

```text
auth.users count = 0
```

Therefore authenticated CRUD and refresh persistence cannot yet be runtime-verified.

No attempt is made to insert directly into `auth.users` through SQL. A legitimate Supabase Auth user must be created through the Auth surface or dashboard.

## Runtime promotion gate

2C can become `RUNTIME_VERIFIED` only after:

- a test Auth user exists;
- Runtime Smoke `reference-library` passes;
- DB artifact proves revision 1 -> 2 and cross-workspace write denial;
- browser artifact proves login + refresh restoration;
- Gemini/YouTube request counts remain zero;
- smoke row cleanup succeeds or is manually confirmed.

`ACTIVATED` remains separate. Production deployment environment variables and real user onboarding must be configured before persistence is considered active for end users.
