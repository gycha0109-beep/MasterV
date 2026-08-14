# MV-ARCH-3B — Tauri Desktop Shell + Static Client Build

Status: **STATIC_VERIFIED / NATIVE_RUNTIME_NOT_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Create the first desktop-client foundation for MasterV without packaging the existing Next.js server routes into the desktop executable.

```text
Tauri native shell
  -> local static HTML/CSS/JS
  -> Supabase Auth over HTTPS
  -> authenticated MasterV hosted API
```

Search, Deep Analysis, and Product Truth are not claimed as migrated in this stage.

## Static surface

Sources:

```text
desktop/index.html
desktop/styles.css
desktop/app.js
scripts/build-desktop-static.mjs
```

Generated output:

```text
desktop-dist/
```

Only public configuration is injected:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_MASTERV_API_BASE_URL
```

No service-role, Gemini, or YouTube credential is embedded.

The shell logs in to Supabase Auth in memory and probes the JWT-protected `masterv-api-boundary`. It requires `mv-hosted-api-v1`, `authenticated=true`, and `boundary_probe=true` while displaying unmigrated capabilities as pending.

## Tauri scaffold

```text
src-tauri/Cargo.toml
src-tauri/build.rs
src-tauri/src/main.rs
src-tauri/tauri.conf.json
```

Pinned direct versions:

```text
@tauri-apps/cli = 2.11.4
tauri = 2.11.5
tauri-build = 2.6.3
```

`frontendDist` is `../desktop-dist` and installer bundling remains disabled in the base config.

The shell has an explicit CSP allowing network connections only to the dedicated MasterV Supabase origin. No custom Rust commands or Tauri plugins are exposed.

## Deterministic icon preparation

The first native compile attempt reached `tauri::generate_context!()` but failed because Tauri expects `src-tauri/icons/icon.png` even when installer bundling is disabled.

Instead of committing an opaque binary asset through the repository write path, `scripts/build-desktop-static.mjs` deterministically emits a 128×128 RGBA PNG before Cargo compilation. The generated icon is ignored by Git and validated by `test:desktop-shell` for PNG signature and dimensions.

## Executable contract

`npm run test:desktop-shell` verifies:

- deterministic static output;
- desktop surface marker and hosted contract version;
- no provider/service-role credentials;
- no local Next `/api/*` dependency;
- hosted boundary usage;
- Tauri `frontendDist` and CSP;
- installer bundling remains disabled;
- required 128×128 PNG icon generation.

## Native compile verification

Exact-head PR CI:

```text
head: 8e2990617ef3f2337f7bd418eab895d8875664ad
run_id: 31843534347
run_number: 645
```

Results:

```text
validate        SUCCESS
desktop-shell   SUCCESS
npm run desktop:build   SUCCESS
```

The `desktop-shell` job installed Tauri Linux/WebKitGTK prerequisites, Rust stable, npm dependencies, passed the static shell contract, and compiled the release Tauri application successfully.

Therefore MV-ARCH-3B is `STATIC_VERIFIED`.

It is not `RUNTIME_VERIFIED` because this checkpoint compiles the native application but does not launch the actual Tauri executable and observe its authenticated WebView flow.

## Remaining boundary

Secure persistent desktop session storage is intentionally not introduced here. The current first shell keeps the Auth session in process memory and clears it on logout/process exit.

Overall repository dependency determinism is also still unresolved; direct Tauri dependencies are pinned, but the pre-existing npm graph still contains ranges and no committed lockfile.

## Next

```text
MV-ARCH-3C — Windows Native Build + Desktop Runtime Smoke
```

3C launches the real Windows executable in WebView2, performs the authenticated hosted-boundary flow with GitHub Secrets injected only into the test driver, captures non-secret runtime evidence, and then attempts an unsigned NSIS installer smoke build.
