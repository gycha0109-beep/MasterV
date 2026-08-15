# MV-ARCH-3K — Desktop Build & Dependency Determinism

Status: **RUNTIME_VERIFIED / NOT ACTIVATED**

## 1. Scope

MV-ARCH-3K closes the remaining dependency/build determinism gap before any later quality-validation or activation work.

This stage does **not** sign, release, activate, publish, or add an updater. It does not change Desktop feature authority, provider-secret placement, Supabase persistence policy, or the MV-ARCH-3J Background Batch activation gate.

No prior repository document defined a separate 3K feature migration. After MV-ARCH-3A through 3J had established the Desktop runtime boundaries, the remaining architecture-level defect was that builds were still resolving dependencies dynamically.

## 2. Pre-3K defect

Before 3K, the repository had all of the following properties:

- no committed root `package-lock.json`
- no committed `src-tauri/Cargo.lock`
- CI used `npm install`
- CI selected floating Node `24`
- CI selected floating Rust `stable`
- GitHub Actions were referenced by moving major tags
- Cargo could freshly resolve compatible crates during a clean native build

This meant a later build of an unchanged MasterV source commit could resolve a materially different JavaScript/Rust dependency graph.

## 3. Authoritative locked graph

3K commits both package-manager lockfiles:

- `package-lock.json`
- `src-tauri/Cargo.lock`

The generated graph currently locks, among others:

| Component | Locked version |
|---|---:|
| `@google/genai` | `2.17.1` |
| `next` | `16.3.1` |
| `react` | `19.2.8` |
| `@tauri-apps/cli` | `2.11.4` |
| `typescript` | `7.0.2` |
| `tauri` | `2.11.5` |
| `tauri-build` | `2.6.3` |
| `tauri-runtime` | `2.11.3` |
| `tauri-runtime-wry` | `2.11.4` |
| `wry` | `0.55.1` |
| `webview2-com` | `0.38.2` |

Initial materialized lockfile SHA-256 values were:

- `package-lock.json`: `f786893c871f8c7e8f392c140734551479adbbe14527552c9f23770343409d7d`
- `src-tauri/Cargo.lock`: `978a2ddd6b03a8808daa2895c94604073fe2e585309acd6271ad612b7b55958c`

`package-lock.json` uses lockfile version 3.

## 4. Toolchain authority

3K pins the Desktop build toolchain to:

- Node.js `24.19.0`
- Rust `1.97.1`
- Rust profile `minimal`

Repository Rust authority is additionally recorded in `rust-toolchain.toml`:

```toml
[toolchain]
channel = "1.97.1"
profile = "minimal"
```

The CI workflows use immutable action commit SHAs rather than moving major tags:

- `actions/checkout`: `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node`: `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `dtolnay/rust-toolchain`: `4360b52568e2003a75bf9bc1d59f33a8e3fc893c`
- `actions/upload-artifact`: `ea165f8d65b6e75b540449e92b4886f43607fa02`

Affected workflows use `npm ci` rather than `npm install`.

## 5. Determinism contract

`scripts/desktop-build-determinism-contract.mjs` is the static 3K architecture guard.

It fails CI if the repository drifts from the required state, including:

- missing npm or Cargo lockfile
- temporary lock-bootstrap workflow left behind
- unexpected locked canonical dependency versions
- floating Node or Rust selectors
- moving GitHub Action major tags
- wrong action commit pins
- missing `npm ci`
- missing Cargo `--locked` verification
- missing post-build lockfile zero-delta checks
- installer verification occurring only after live Gemini smoke
- introduction of signing credentials or updater activation in this stage

Verified marker:

```text
MASTERV_DESKTOP_BUILD_DETERMINISM_CONTRACT_PASS
```

Verified contract payload included:

```json
{
  "node": "24.19.0",
  "rust": "1.97.1",
  "npm_lockfile_version": 3,
  "locked_google_genai": "2.17.1",
  "locked_next": "16.3.1",
  "locked_tauri_cli": "2.11.4",
  "locked_tauri": "2.11.5",
  "locked_wry": "0.55.1",
  "activation": false
}
```

## 6. Native build verification

CI run #778 (`31910306196`) was executed for implementation head:

`0e1fffc2a40ad02b2110b48caf85d465f17d062e`

The pull-request run metadata identified this exact head SHA. As with normal GitHub pull-request workflows, the jobs themselves checked out GitHub's synthetic merge ref:

`f71c18f3db2494959f8e442a3ae506e1b93efc21`

which represents the 3K head merged onto base main `f819da2a6568534360adbd4ee4282d22f495b923` for test execution. This distinction must not be collapsed into an exact raw-head checkout claim.

### Static / Linux

`validate` — **SUCCESS**

- Node `24.19.0`
- npm `11.17.0`
- `npm ci` success
- 3K determinism contract success
- Next.js production build success using locked Next `16.3.1`
- production dependency audit: zero reported vulnerabilities at configured threshold

`desktop-shell` — **SUCCESS**

- `npm ci` success
- 3K contract success
- `cargo metadata --locked` success
- native Tauri build success
- `git diff --exit-code -- package-lock.json src-tauri/Cargo.lock` success after build

### Windows native

The Windows native job verified, before any live Gemini regression smoke:

1. Node `24.19.0`
2. Rust `1.97.1`
3. `npm ci`
4. `cargo metadata --locked`
5. native release Tauri EXE build
6. lockfile zero-delta after native build
7. MV-ARCH-3D runtime regression
8. MV-ARCH-3E runtime regression
9. MV-ARCH-3F runtime regression
10. MV-ARCH-3G runtime regression
11. MV-ARCH-3J guarded Background Batch runtime regression
12. platform icon generation
13. unsigned NSIS installer build
14. lockfile zero-delta after installer build

The native application was built at:

`src-tauri/target/release/masterv-desktop.exe`

The unsigned installer was built at:

`src-tauri/target/release/bundle/nsis/MasterV_0.1.0_x64-setup.exe`

Both build paths preserved the committed lockfiles with zero diff.

The clean Windows build compiled the locked Tauri graph rather than producing the previous fresh `Locking ... packages to latest compatible versions` resolution event.

## 7. Provider-independent installer evidence

A key 3K CI change is ordering the unsigned installer verification before the provider-consuming 3H/3I live Gemini regressions.

This keeps build determinism proof independent of transient external model quota while preserving the existing live regressions as strict downstream checks.

Run #778 produced Windows evidence artifact:

- artifact ID: `9253564904`
- name: `masterv-windows-desktop-smoke`
- size: `1,494,023` bytes
- SHA-256: `69d30f22e603268077ffe02782a3a05d41cbc6479be3a3fe26170ab812067823`
- uploaded files: 23

The artifact includes the unsigned NSIS installer because installer generation completed before the downstream provider failure.

## 8. Existing runtime boundary regression

The locked build preserved prior Desktop runtime boundaries through 3J.

Notably, the 3J regression again returned:

```text
MASTERV_WINDOWS_BACKGROUND_BATCH_GUARD_RUNTIME_PASS
```

with:

- authenticated Desktop surface
- hosted boundary connected
- durable ledger present
- `provider_precondition_confirmed=false`
- `live_batch_verified=false`
- `desktop_submit_enabled=false`
- `batch_submit_requests=0`
- `batch_create_attempts=0`
- direct Desktop Gemini request delta `0`
- local Next API delta `0`
- Reference Library writes `0`

Thus 3K did not weaken the 3J provider/activation guard.

## 9. Downstream CI failure classification

The overall #778 workflow conclusion was **FAILURE**, but the failure occurred only after all 3K-relevant native build and installer gates had passed.

The existing 3H live Deep Analysis smoke received persistent Gemini HTTP 429 behavior over all bounded attempts:

- attempt 1: retry hint `31s`, waited `34s`
- attempt 2: retry hint `43s`, waited `46s`
- attempt 3: retry hint `44s`, then failed

This is an external provider-quota failure, not a dependency-resolution or native-build failure. It does not invalidate 3K runtime verification and does not retroactively downgrade the already established 3H lifecycle state.

## 10. Non-goals and remaining hardening

3K is dependency/toolchain determinism, not a fully hermetic or bit-for-bit reproducible build system.

Explicit non-goals:

- GitHub-hosted runner image revision pinning below the selected OS generation
- binary reproducibility across arbitrary machines
- artifact signing
- certificate management
- release publication
- updater introduction
- automatic activation

Observed but non-blocking follow-up candidates include npm's `allow-scripts` policy warnings for transitive package install scripts and GitHub Action runtime deprecation warnings. Those are not silently changed in 3K.

## 11. Lifecycle decision

3K is promoted to:

**RUNTIME_VERIFIED / NOT ACTIVATED**

because the locked dependency graph, exact toolchain selection, Linux native build, Windows native build, Windows unsigned installer generation, and post-build lockfile zero-delta guards were all actually executed successfully.

It is **not** promoted to `QUALITY_VALIDATED` or `ACTIVATED`.

No signing, release, updater, Ready-for-review transition, PR merge, or feature activation is authorized by this stage.

PR #1 remains required to stay Draft / Open / Unmerged unless separately authorized.

## 12. STOP boundary

MV-ARCH-3K stops after deterministic build/runtime verification.

Do not infer or begin an MV-ARCH-3L scope from this document alone. A subsequent architecture stage requires a separate instruction and a fresh authority read.
