# MV-ARCH-3C — Windows Native Build + Desktop Runtime Smoke

Status: **IMPLEMENTED_UNVERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Verify MasterV as an actual Windows desktop application rather than only a compilable Tauri project.

Target proof:

```text
Windows runner
  -> native MasterV Tauri executable
  -> real WebView2 renderer
  -> test driver types GitHub-secret credentials into UI
  -> Supabase Auth
  -> authenticated masterv-api-boundary
  -> visible desktop capability state
  -> logout
  -> unsigned NSIS installer smoke
```

No Gemini or YouTube provider credential is provided to this job.

## Native automation approach

The Windows runtime gate uses WebdriverIO with `@wdio/tauri-service` and the external Tauri WebDriver provider.

Test-only dependencies are pinned at this checkpoint:

```text
@wdio/cli = 9.29.1
@wdio/local-runner = 9.29.1
@wdio/mocha-framework = 9.29.1
@wdio/spec-reporter = 9.29.1
@wdio/tauri-service = 1.2.0
```

The CI runner installs `tauri-driver --locked`. The WebdriverIO Tauri service manages the Windows Edge WebDriver needed to control the WebView2 surface.

No WebDriver plugin is compiled into the production Tauri application because the Windows/Linux external driver path is sufficient for basic element interaction.

## Test files

```text
desktop-e2e/wdio.conf.mjs
desktop-e2e/specs/runtime.spec.mjs
```

The test operates on:

```text
src-tauri/target/release/masterv-desktop.exe
```

It verifies through the actual application UI:

```text
surface = desktop
auth status = AUTHENTICATED
hosted API status = CONNECTED
boundary probe = READY
analyze = PENDING
youtube discovery = PENDING
product truth = PENDING
```

The test then clears credential input fields before taking a screenshot, records a JSON evidence file with no secret values, and verifies in-memory logout returns the UI to `SIGNED OUT`.

## Secret boundary

Repository Secrets used only by the test driver:

```text
SUPABASE_TEST_EMAIL
SUPABASE_TEST_PASSWORD
```

Public desktop build configuration:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_MASTERV_API_BASE_URL
```

The job explicitly fails if `GEMINI_API_KEY` or `YOUTUBE_DATA_API_KEY` is present.

Credentials are typed into the running desktop UI by automation and are not compiled into `desktop-dist`, Rust code, or installer artifacts.

## Windows installer smoke

After the native runtime test passes, CI generates platform icon derivatives from the deterministic PNG and runs a separate Tauri bundle step for NSIS.

Smoke-only override:

```text
src-tauri/tauri.windows-smoke.conf.json
```

It enables bundling and uses the standard `downloadBootstrapper` WebView2 installation mode.

The produced NSIS artifact is intentionally unsigned. This checkpoint proves installer generation only; it does not claim trusted public distribution. Windows code signing, release identity, updater signing, and production download delivery remain later release work.

## CI gate

PR CI job:

```text
desktop-windows-runtime
```

Sequence:

1. checkout exact PR head;
2. Node 24 + Rust stable;
3. install npm dependencies;
4. verify test secrets and provider-key absence;
5. compile native Windows Tauri executable;
6. install official `tauri-driver`;
7. run actual WebView2 login/hosted-boundary E2E;
8. generate Windows icon set;
9. build unsigned NSIS installer;
10. upload runtime JSON/screenshot and installer artifact.

## Promotion gate

3C becomes `RUNTIME_VERIFIED` only when a single exact-head CI run proves:

- existing regression suite remains green;
- Linux Tauri compile remains green;
- Windows Tauri executable builds;
- actual native WebView2 UI reaches authenticated hosted API state;
- capability flags remain truthful (`analyze/discovery/product_truth=false`);
- logout succeeds;
- provider credentials are absent from the job;
- unsigned NSIS installer smoke succeeds;
- evidence artifact uploads successfully.

`ACTIVATED` remains separate. A CI-built unsigned installer is not a production release.

## After 3C

The next product-facing migration should move real MasterV functionality into the desktop surface without weakening the hosted secret boundary. The natural next candidate is the already-runtime-verified Reference Library because it requires no Gemini/YouTube server workload migration.
