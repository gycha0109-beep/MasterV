# MV-ARCH-2C — Auth + Workspace Bootstrap + Live Persistence

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Connect the MV-ARCH-2A Reference Library domain and MV-ARCH-2B Supabase adapter to an authenticated user session without weakening RLS or exposing service-role credentials.

Verified runtime flow:

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

## Live database authority

Dedicated project:

```text
project: MasterV
ref: euqkjrmrhhvnyzasppnd
region: ap-northeast-1
status: ACTIVE_HEALTHY
```

The 2B schema and 2C personal-workspace bootstrap policy are live.

Security hardening already applied:

- membership helper runs as `SECURITY INVOKER`;
- anon execute is revoked;
- membership foreign key has a covering index;
- auth UID policy uses `(select auth.uid())` initialization-plan form;
- security advisor reports zero lints after the hardening migrations.

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

`lib/supabase-auth.ts` implements the minimal public-client Auth surface using native fetch semantics:

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

## Browser fetch binding correction

The first authenticated browser smoke, Run `31833736668`, proved the server-side Auth/RLS CRUD path but exposed a browser-only failure:

```text
Failed to execute 'fetch' on 'Window': Illegal invocation
```

Cause: raw browser `fetch` function references were passed/stored unbound. Node runtime did not expose the same failure.

Correction:

- shared platform fetch wrapper invokes `globalThis.fetch(input, init)`;
- Auth, workspace bootstrap, and Reference Library store no longer retain an unbound browser `window.fetch` reference;
- fake-fetch injection remains available for deterministic contracts.

The correction was statically verified by CI before the final runtime rerun.

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

`app/page.tsx` has two modes:

```text
Supabase unconfigured / signed out
  -> existing browser-session comparison tray

Supabase authenticated and ready
  -> Supabase Reference Library is the comparison authority
```

Existing discovery and Deep analysis UX therefore remain usable before production persistence activation.

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

## Final live runtime evidence

Final successful Runtime Smoke:

```text
run_id: 31834335727
execution_ref: feat/mvp-foundation
checkout_sha: 10ac63448ce74b5cf37c10eaabf27db2649a01d6
target: reference-library
job: reference-library-smoke
conclusion: success
```

Server-side authenticated RLS/CRUD evidence:

```text
status: REFERENCE_LIBRARY_LIVE_SMOKE_PASS
source_id: yt:MVpersist01
revision: 2
first_saved_at_preserved: true
cross_workspace_write_denied: true
gemini_requests_executed: 0
youtube_requests_executed: 0
```

This verifies:

1. real password Auth sign-in;
2. personal workspace bootstrap under RLS;
3. synthetic Deep snapshot insert -> revision 1;
4. same natural-key upsert -> revision 2;
5. `first_saved_at` preservation;
6. unauthorized cross-workspace write denial.

Browser evidence:

```text
status: REFERENCE_LIBRARY_BROWSER_SMOKE_PASS
reference_rest_requests: 6
analyze_requests: 0
restored_after_reload: true
```

This verifies through the production Next app and headless Chrome:

1. real UI login succeeds;
2. authenticated Reference Library requests reach Supabase;
3. the seeded reference appears in the comparison tray;
4. a full page reload restores the saved Auth session;
5. the DB-backed reference is restored after reload;
6. no `/api/analyze` request is triggered by persistence restoration.

Other Runtime Smoke jobs, including Gemini and YouTube discovery, were skipped for this target.

## Cleanup state

The workflow cleanup step succeeded:

```text
status: REFERENCE_LIBRARY_LIVE_CLEANUP
removed: true
source_id: yt:MVpersist01
```

A subsequent direct live DB check confirmed:

```text
workspace_members = 1
reference_entries = 0
```

The personal workspace membership is intentionally durable. The synthetic smoke reference is removed.

## Runtime verdict

MV-ARCH-2C satisfies the runtime promotion gate:

- authenticated test user exists;
- real Auth login passes;
- personal workspace bootstrap passes;
- RLS CRUD and natural-key revision semantics pass;
- cross-workspace denial passes;
- browser login and reload restoration pass;
- Gemini/YouTube request counts remain zero;
- synthetic smoke row cleanup passes.

Therefore:

```text
MV-ARCH-2C = RUNTIME_VERIFIED / NOT ACTIVATED
```

`ACTIVATED` remains separate. Production deployment environment variables, deployment/runtime configuration, and intended real-user onboarding must be configured and verified before persistence is considered active for end users.
