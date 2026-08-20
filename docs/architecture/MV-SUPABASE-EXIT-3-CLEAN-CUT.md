# MV-SUPABASE-EXIT-3 — 0.1.3 Clean Cut

Status: IN PROGRESS
Architecture authority: MV-ARCH-001
Target release: 0.1.3 Clean Cut
Starting authority: f797060a938fd0f5bfccd4866164f282674d510f

## Target Architecture completion criteria

0.1.3 removes Supabase Auth, URL, publishable key, Edge Function, Storage, DB, updater, runtime contract, and Supabase-specific CI dependencies.

Final proof must establish:

- `*.supabase.co` runtime network requests = 0
- Supabase runtime env vars = 0
- Supabase runtime keys = 0
- Supabase DB access = 0
- Supabase Storage access = 0
- `SUPABASE_RUNTIME_DEPENDENCY = ZERO`

## Execution plan

1. Remove the 0.1.2 migration UI and Desktop legacy adapters/config.
2. Remove native migration bridge exposure and Supabase CSP/network allowance.
3. Remove web Supabase Auth/Reference Library persistence code.
4. Remove Supabase Edge Functions, DB migrations, updater artifacts, and Supabase-specific tests/workflows.
5. Add a clean-cut zero-dependency contract and preserve CI + EXIT-3 as the only automatic PR workflows.
6. Re-run Linux/Windows native build, installed-runtime lifecycle, local SQLite, Gateway/Polar, and updater regressions at the exact final SHA.

No production deployment, hosted migration, secret mutation, signing activation, release publication, or PR merge is part of this stage.