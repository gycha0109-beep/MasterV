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
  -> test harness types GitHub-secret credentials into UI
  -> Supabase Auth
  -> authenticated masterv-api-boundary
  -> visible desktop capability state
  -> logout
  -> unsigned NSIS installer smoke
```

No Gemini or YouTube provider credential is provided to this job.

## Why Windows uses WebView2 attach mode

The first Windows attempts used the external `tauri-driver` launch path. The Tauri executable itself built successfully, the matching EdgeDriver was found, and `tauri-driver` started, but session creation failed with:

```text
session not created: DevToolsActivePort file doesn't exist
```

A custom WebView2 user-data folder did not change that failure.

Primary-source inspection explains the boundary:

- `tauri-driver` maps `tauri:options.application` to `ms:edgeOptions.binary` and therefore uses EdgeDriver's WebView2 launch mode on Windows;
- its public `tauri:options.webviewOptions` mapping does not expose EdgeOptions `debuggerAddress`;
- Microsoft recommends attach mode when a WebView2 host is not compatible with EdgeDriver launch mode;
- WebView2 officially supports `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`, `WEBVIEW2_USER_DATA_FOLDER`, and EdgeDriver `debuggerAddress` attachment.

3C therefore uses the WebView2 attach path directly instead of adding more launch-mode workarounds.

## Native attach smoke

Script:

```text
scripts/desktop-windows-runtime-smoke.mjs
```

Sequence:

1. detect the installed WebView2 runtime version from the official EdgeUpdate registry keys;
2. download the exact matching `msedgedriver.exe` from Microsoft's driver CDN into runner temp storage;
3. allocate isolated localhost ports and a writable WebView2 user-data folder;
4. launch the already-built MasterV `.exe` with:

```text
WEBVIEW2_USER_DATA_FOLDER=<runner temp>
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>
```

5. wait for the WebView2 CDP `/json/version` endpoint;
6. launch matching `msedgedriver` separately;
7. create a W3C WebDriver session with:

```text
browserName = webview2
ms:edgeOptions.debuggerAddress = 127.0.0.1:<remote-debugging-port>
```

8. execute DOM interaction through the real WebView2 session;
9. authenticate with the test Supabase user;
10. verify the hosted API boundary and truthful capability flags;
11. clear credential fields before screenshot capture;
12. save non-secret JSON/screenshot/process logs;
13. log out and verify `SIGNED OUT`;
14. close WebDriver and application processes.

No WebdriverIO/Tauri service package is required for this gate. The smoke uses Node built-ins plus the Microsoft EdgeDriver W3C endpoint directly.

## Runtime assertions

The actual application UI must reach:

```text
surface = desktop
auth status = AUTHENTICATED
hosted API status = CONNECTED
boundary probe = READY
analyze = PENDING
youtube discovery = PENDING
product truth = PENDING
```

This keeps 3C honest: the native program exists and reaches the authenticated hosted boundary, but server workloads that have not migrated remain visibly pending.

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

Credentials are injected into the running UI at test time. They are not compiled into the desktop bundle, Rust binary, or installer artifacts.

## Windows installer smoke

After runtime verification passes, CI generates the platform icon set and bundles NSIS using:

```text
src-tauri/tauri.windows-smoke.conf.json
```

The resulting installer is intentionally unsigned. Installer generation is not production release activation.

## CI gate

PR job:

```text
desktop-windows-runtime
```

Already proven by prior attempts:

```text
native Windows Tauri .exe build = SUCCESS
matching WebView2 runtime detection = SUCCESS
matching EdgeDriver acquisition = SUCCESS
```

Remaining promotion gate:

- attach-mode CDP endpoint opens;
- EdgeDriver attaches to that running WebView2;
- native Auth + hosted API UI assertions pass;
- logout passes;
- unsigned NSIS installer builds;
- evidence artifact uploads.

`ACTIVATED` remains separate. A CI-built unsigned installer is not a production release.

## Dependency/security boundary

The discarded WebdriverIO/Tauri-service stack introduced a large dev-only dependency graph and audit noise. 3C removes it entirely. CI now additionally runs:

```text
npm audit --omit=dev --audit-level=high
```

so production dependency security is evaluated separately from test tooling.
