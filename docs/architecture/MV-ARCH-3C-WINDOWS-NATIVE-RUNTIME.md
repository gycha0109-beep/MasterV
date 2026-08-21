# MV-ARCH-3C — Windows Native Build + Desktop Runtime Smoke

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Verify MasterV as an actual Windows desktop application rather than only a compilable Tauri project.

Verified path:

```text
Windows runner
  -> native MasterV Tauri executable
  -> real WebView2 renderer
  -> test harness types GitHub-secret credentials into UI
  -> Supabase Auth
  -> authenticated masterv-api-boundary
  -> visible desktop capability state
  -> logout
  -> unsigned NSIS installer smoke
```

No Gemini or YouTube provider credential is provided to this job.

## Windows automation decision

The initial Windows attempts used `tauri-driver` launch mode. The native executable itself built successfully, but EdgeDriver session creation failed with:

```text
session not created: DevToolsActivePort file doesn't exist
```

A custom WebView2 user-data folder did not resolve the launch-mode mismatch.

The final runtime path uses WebView2 attach mode instead:

1. MasterV creates its WebView through Tauri `WebviewWindowBuilder`;
2. only when CI test environment variables are present, the builder applies an isolated data directory and `--remote-debugging-port=<port>`;
3. the harness waits for the real WebView2 CDP endpoint;
4. an exact-version Microsoft EdgeDriver attaches through `ms:edgeOptions.debuggerAddress`;
5. W3C WebDriver commands operate the actual MasterV WebView.

Normal application execution does not expose the remote-debugging port.

Test-only environment boundary:

```text
MASTERV_DESKTOP_TEST_REMOTE_DEBUGGING_PORT
MASTERV_DESKTOP_TEST_WEBVIEW_DATA_DIR
```

## Native runtime harness

Script:

```text
scripts/desktop-windows-runtime-smoke.mjs
```

Sequence:

1. detect the installed WebView2 runtime version from the EdgeUpdate registry keys;
2. download the exact matching `msedgedriver.exe` from Microsoft's driver CDN into runner temp storage;
3. allocate isolated localhost ports and an isolated WebView2 data directory;
4. launch the already-built MasterV `.exe` with the CI-only Tauri test variables;
5. wait for WebView2 `/json/version`;
6. launch the matching EdgeDriver;
7. attach to the running WebView2 via `debuggerAddress`;
8. fill the actual desktop login form through WebDriver;
9. authenticate with the test Supabase user;
10. verify the hosted API boundary and truthful capability flags;
11. clear credential fields before screenshot capture;
12. save non-secret JSON/screenshot/process logs;
13. log out and verify `SIGNED OUT`;
14. close the driver and application processes.

No WebdriverIO/Tauri-service dependency is required by the final gate. The harness uses Node built-ins and the Microsoft EdgeDriver W3C endpoint directly.

## Exact runtime verification

Exact tested code head:

```text
516498438765a38d43251b46692eb6c1561c2252
```

GitHub Actions:

```text
run_id: 31848316668
job: desktop-windows-runtime
result: SUCCESS
```

Native binary build:

```text
src-tauri/target/release/masterv-desktop.exe
```

Observed runtime evidence:

```json
{
  "status": "MASTERV_WINDOWS_NATIVE_RUNTIME_PASS",
  "webview2_runtime_version": "151.0.4129.72",
  "cdp_browser": "Edg/151.0.4129.72",
  "attach_mode": true,
  "surface": "desktop",
  "auth_status": "AUTHENTICATED",
  "hosted_api_status": "CONNECTED",
  "boundary_probe": true,
  "analyze_migrated": false,
  "youtube_discovery_migrated": false,
  "product_truth_migrated": false,
  "local_next_api_required": false,
  "provider_credentials_in_desktop_job": false,
  "screenshot": "native-connected.png"
}
```

The native UI therefore proved:

```text
surface             desktop
Auth                AUTHENTICATED
Hosted API          CONNECTED
Boundary probe      READY
Analyze             PENDING
YouTube discovery   PENDING
Product Truth       PENDING
logout              PASS
```

The PENDING capability state is intentional and prevents 3C from falsely claiming that the existing Gemini/YouTube server workloads have migrated.

## Evidence artifact

GitHub Actions artifact:

```text
name: masterv-windows-desktop-smoke
artifact_id: 9236779479
```

Evidence includes:

```text
artifacts/desktop-windows-runtime/runtime-evidence.json
artifacts/desktop-windows-runtime/native-connected.png
artifacts/desktop-windows-runtime/msedgedriver.log
artifacts/desktop-windows-runtime/masterv-process.log
src-tauri/target/release/bundle/nsis/MasterV_0.1.0_x64-setup.exe
```

The screenshot was captured only after the login fields had been cleared. No test email or password is written to the evidence JSON.

## Secret boundary

Repository Secrets used only by the runtime harness:

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

The Windows job fails if `GEMINI_API_KEY` or `YOUTUBE_DATA_API_KEY` is present.

Credentials are injected into the running UI at test time. They are not compiled into the desktop static bundle, Rust binary, or installer artifact.

## Windows installer smoke

After the actual native runtime verification passed, CI generated platform icon derivatives and bundled NSIS using:

```text
src-tauri/tauri.windows-smoke.conf.json
```

Produced artifact:

```text
MasterV_0.1.0_x64-setup.exe
```

The installer is intentionally **unsigned**. It proves Windows installer generation only and is not a trusted public release.

Production distribution still requires a deliberate release policy for code signing, updater signing, release identity, download delivery, and versioning.

## Regression/security gate

The same exact code head also passed:

```text
validate                 SUCCESS
desktop-shell            SUCCESS
desktop-windows-runtime  SUCCESS
```

The general validation job includes the existing regression suite, Next production build, desktop static contract, and:

```text
npm audit --omit=dev --audit-level=high
```

which succeeded.

Overall dependency determinism is still unresolved because the repository has no committed npm lockfile and Cargo resolves its dependency lock graph during CI.

## Status boundary

MV-ARCH-3C is `RUNTIME_VERIFIED`.

It is **not `ACTIVATED`**. The installer is unsigned CI evidence; no signed public desktop release, production updater, subscription entitlement gate, or public download channel has been activated.

## Next

```text
MV-ARCH-3D — Desktop Reference Library Surface
```

The next desktop feature should migrate the already-runtime-verified Reference Library first. That gives the native client real product utility without prematurely moving Gemini or YouTube workloads into a hosted compute environment that has not yet been validated for them.
