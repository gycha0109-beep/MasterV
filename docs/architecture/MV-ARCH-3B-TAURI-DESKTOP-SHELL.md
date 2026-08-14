# MV-ARCH-3B — Tauri Desktop Shell + Static Client Build

Status: **IMPLEMENTED_UNVERIFIED / NOT ACTIVATED**

Date: 2026-08-15

## Goal

Create the first installable-client foundation for MasterV without packaging the existing Next.js server routes into the desktop executable.

3B proves this boundary:

```text
Tauri native shell
  -> local static HTML/CSS/JS
  -> Supabase Auth over HTTPS
  -> authenticated MasterV hosted API
```

It does not claim that Search, Deep Analysis, or Product Truth have migrated to the desktop runtime.

## Why a separate static desktop surface

The existing web application currently contains server-only POST route handlers:

```text
/api/analyze
/api/discover/youtube
/api/interpret-product-truth
```

Tauri does not provide a Next.js server runtime in the packaged app. The Tauri Next.js integration guidance requires static export for a Next-based frontend.

Rather than force the current mixed server/client Next tree into a misleading desktop build, 3B starts with a standalone static surface under `desktop/` and migrates product UI into that surface incrementally.

## Static shell

Source:

```text
desktop/index.html
desktop/styles.css
desktop/app.js
```

Generated output:

```text
desktop-dist/
```

`desktop-dist` is ignored by Git because it is build output.

Builder:

```text
scripts/build-desktop-static.mjs
```

The builder injects only public client configuration:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_MASTERV_API_BASE_URL
```

It never requires or embeds:

```text
service-role credentials
GEMINI_API_KEY
YOUTUBE_DATA_API_KEY
```

When `MASTERV_DESKTOP_REQUIRE_CONFIG=1`, missing public runtime configuration fails the build instead of producing a falsely connected client.

## Desktop auth boundary

The first shell supports an in-memory password login flow against Supabase Auth and then probes:

```text
/functions/v1/masterv-api-boundary
```

with the authenticated user's bearer token.

The shell requires:

```text
contract_version = mv-hosted-api-v1
authenticated = true
capabilities.boundary_probe = true
```

The shell deliberately displays non-migrated capabilities as pending.

3B does not persist the refresh token to disk. Production-grade secure desktop session persistence is a later auth-hardening step.

## Tauri scaffold

Rust/Tauri files:

```text
src-tauri/Cargo.toml
src-tauri/build.rs
src-tauri/src/main.rs
src-tauri/tauri.conf.json
```

Pinned versions at this checkpoint:

```text
@tauri-apps/cli = 2.11.4
tauri = 2.11.5
tauri-build = 2.6.3
```

`frontendDist` points to:

```text
../desktop-dist
```

Installer bundling is intentionally disabled in 3B:

```text
bundle.active = false
```

Windows/Linux/macOS installer packaging belongs to MV-ARCH-3C.

## Desktop security defaults

The Tauri shell enables an explicit CSP and only permits network connection to the dedicated MasterV Supabase origin.

No remote scripts or CDN assets are used.

The Windows production webview is configured with `useHttpsScheme = true` so the local application origin remains HTTPS-based.

The Rust shell exposes no custom commands and adds no Tauri plugin capabilities at this checkpoint.

## Executable contract

`scripts/desktop-shell-contract.mjs` verifies:

- deterministic `desktop-dist` generation;
- desktop surface marker;
- hosted API contract version;
- no embedded provider/service-role credentials;
- no local `fetch('/api/...')` dependency;
- hosted boundary usage;
- Tauri `frontendDist` correctness;
- installer bundling remains disabled;
- CSP explicitly allows only the required MasterV Supabase network origin.

CI command:

```text
npm run test:desktop-shell
```

## Tauri compile gate

PR CI includes a separate `desktop-shell` job on Ubuntu 22.04.

It installs the Linux system dependencies required by Tauri/WebKitGTK, installs Rust stable, prepares the static client, and executes:

```text
npm run desktop:build
```

This is a native Tauri compile gate, not merely a JavaScript syntax check.

## Promotion gate

3B becomes `STATIC_VERIFIED` when:

- the existing application regression suite remains green;
- `test:desktop-shell` passes;
- the Tauri Rust/native shell compiles successfully in PR CI;
- the resulting code still has no local Next API dependency or provider secrets in the desktop bundle.

3B is not `RUNTIME_VERIFIED` until the native desktop executable itself is launched and its authenticated hosted-boundary flow is observed.

## Next

```text
MV-ARCH-3C — Windows Native Build + Desktop Runtime Smoke
```

3C should build on Windows, launch the actual Tauri executable, verify the local static surface and authenticated boundary in a desktop WebView2 runtime, and only then enable Windows installer bundling.
