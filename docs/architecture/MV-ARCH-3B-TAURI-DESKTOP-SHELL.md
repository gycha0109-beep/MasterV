# MV-ARCH-3B — Tauri Desktop Shell + Static Client Build

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

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

The main WebView window is created explicitly in Rust through `WebviewWindowBuilder`. Normal application execution does not enable remote debugging. Windows runtime automation enables it only when the CI-only environment boundary is present:

```text
MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT
MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR
```

## Deterministic icon preparation

Tauri requires application icon resources even before production installer activation.

`scripts/build-desktop-static.mjs` deterministically emits:

```text
src-tauri/icons/icon.png
src-tauri/icons/icon.ico
```

The generated resources are ignored by Git. `test:desktop-shell` validates the PNG signature/dimensions and the Windows ICO container before native compilation.

## Executable contract

`npm run test:desktop-shell` verifies:

- deterministic static output;
- desktop surface marker and hosted contract version;
- no provider/service-role credentials;
- no local Next `/api/*` dependency;
- hosted boundary usage;
- Tauri `frontendDist` and CSP;
- installer bundling remains disabled in the base config;
- required PNG/ICO generation.

## Static/native compile verification

Earlier exact-head PR CI established the native compile gate:

```text
head: 8e2990617ef3f2337f7bd418eab895d8875664ad
run_id: 31843534347
result:
  validate       SUCCESS
  desktop-shell  SUCCESS
```

The Linux `desktop-shell` job installs Tauri/WebKitGTK prerequisites and Rust stable, runs the static desktop contract, and compiles the release Tauri application.

## Native runtime verification

The later Windows runtime checkpoint promoted the shell beyond compile-only verification:

```text
head: 516498438765a38d43251b46692eb6c1561c2252
run_id: 31848316668
job: desktop-windows-runtime
result: SUCCESS
```

The actual Windows Tauri executable was built and launched under WebView2. The native UI then authenticated a real Supabase test user and reached the live JWT-protected hosted boundary.

Observed runtime state:

```text
surface                desktop
Supabase Auth          AUTHENTICATED
Hosted API             CONNECTED
Boundary probe         READY
Analyze                PENDING
YouTube discovery      PENDING
Product Truth          PENDING
```

The runtime evidence also proved:

```text
local Next /api required       false
Gemini credential in job       false
YouTube credential in job      false
logout -> SIGNED OUT           PASS
```

The screenshot captured after connection had the email/password fields cleared before evidence collection.

Therefore MV-ARCH-3B is `RUNTIME_VERIFIED`.

## Remaining boundary

Secure persistent desktop session storage is intentionally not introduced here. The current first shell keeps the Auth session in process memory and clears it on logout/process exit.

Overall repository dependency determinism is also still unresolved: existing npm semver ranges remain, there is no committed npm lockfile, and Cargo resolves a fresh lock graph in CI.

`ACTIVATED` remains separate. Runtime verification of the shell does not mean MasterV has been publicly distributed as a signed desktop product.

## Next

```text
MV-ARCH-3D — Desktop Reference Library Surface
```

The next product-facing desktop migration should use the already-runtime-verified Reference Library first because it requires no Gemini or YouTube hosted workload migration.
