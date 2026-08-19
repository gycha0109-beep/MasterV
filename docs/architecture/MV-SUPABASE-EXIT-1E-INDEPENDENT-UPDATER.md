# MV-SUPABASE-EXIT-1E — Independent Updater

Status: IMPLEMENTED / STATIC CHANNEL READY / LIVE 0.1.2 RELEASE NOT PUBLISHED

## Purpose

Remove the final updater-specific Supabase dependency before the 0.1.2 migration bridge.

The updater authority is intentionally independent from:

- Supabase Auth
- Supabase Edge Functions
- Supabase publishable keys
- Product Key activation
- Polar subscription state
- MasterV Gateway sessions
- MasterV user work-data storage

A user whose subscription is expired must still be able to receive and install a valid MasterV update.

## Target Flow

```text
MasterV Desktop
  -> static latest.json
  -> version comparison
  -> installer URL + Tauri signature
  -> installer download
  -> Tauri signature verification
  -> install
```

Static channel endpoint:

```text
https://github.com/gycha0109-beep/MasterV/releases/latest/download/latest.json
```

This endpoint is public and does not require an application session or subscription credential.

## Authority

### Update metadata authority

The static `latest.json` release asset.

### Update artifact authenticity authority

The Tauri updater public key embedded in the Desktop application.

The matching private signing key must exist only as protected release infrastructure material. It must not be committed, bundled, logged, or included in a public artifact.

### Subscription authority

None.

The updater does not consult Polar or the MasterV Gateway before checking or installing an update.

## Desktop Runtime Boundary

`desktop/updater.js` now:

- performs an automatic update check without login
- allows manual update checks without login
- invokes only native Tauri updater commands
- carries no access token
- carries no publishable client key
- does not call `window.MASTERV_BACKEND`
- does not subscribe to the backend session lifecycle
- does not download installers directly with browser `fetch`

Neutral runtime config:

```text
MASTERV_UPDATER_CONFIG
  enabled = true
  channel = stable
  transport = tauri-static-signed
  subscription_independent = true
```

## Native Tauri Boundary

`src-tauri/src/updater.rs` now has no application credential parameters and no application-auth request headers.

Removed updater dependencies:

```text
Supabase function URL
Authorization header
apikey header
access token
publishable key
```

The Tauri updater plugin receives its static endpoint from the dedicated updater build configuration and verifies the downloaded artifact using the embedded public key.

## Static Manifest Contract

Tauri v2 static metadata requires the update version and a platform entry containing the installer URL and signature contents.

MasterV uses the custom target:

```text
windows-x86_64
```

Shape:

```json
{
  "version": "0.1.2",
  "platforms": {
    "windows-x86_64": {
      "url": "https://.../MasterV_0.1.2_x64-setup.exe",
      "signature": "<contents of .sig>"
    }
  }
}
```

`scripts/desktop-independent-update-manifest.mjs` validates:

- SemVer version
- HTTPS installer URL
- non-empty signature file
- signature contents embedded in JSON rather than a path
- one explicit `windows-x86_64` target

## Build Configurations

### Bootstrap verification config

`src-tauri/tauri.windows-updater-bootstrap.conf.json`

```text
version                = 0.1.1
updater enabled        = true
createUpdaterArtifacts = false
channel                = static GitHub release latest.json
```

This exists to verify that an already-installed MasterV build can load the independent updater plugin without requiring updater signing secrets in PR CI.

### 0.1.2 release config

`src-tauri/tauri.windows-independent-updater-release.conf.json`

```text
version                = 0.1.2
updater enabled        = true
createUpdaterArtifacts = true
channel                = static GitHub release latest.json
```

A real release build must provide Tauri's signing private-key environment variables. The 1E PR does not publish or activate a 0.1.2 release.

## Security Invariants

```text
Updater requires login                    NO
Updater requires active subscription      NO
Updater requires Product Key              NO
Updater requires Polar                    NO
Updater requires Gateway                  NO
Updater requires Supabase                 NO
Updater sends application bearer token    NO
Updater sends publishable API key          NO
Installer browser-direct download         NO
Tauri signature verification              REQUIRED
Updater signing private key in repo        NO
Updater signing private key in Desktop     NO
Central updater DB                         NO
```

## Migration Interaction

EXIT-1E does not switch the rest of the Desktop application away from the existing migration-era Supabase authority.

Therefore after 1E:

```text
Updater Supabase dependency       = removed
General Desktop Supabase bridge   = retained temporarily
Local SQLite product authority    = not yet activated
Product-Key Desktop wiring        = not yet activated
Gateway Desktop transport         = not yet activated
```

Those transitions belong to `0.1.2 — Migration Bridge`.

## Verification

Dedicated workflow:

```text
MV Supabase Exit 1E Independent Updater
```

It verifies:

- EXIT-1B closeout regression
- EXIT-1C stateless Gateway regression
- EXIT-1D Product-Key / Polar regression
- EXIT-1B-4 session cleanup regression
- EXIT-1B-5 build/config regression
- independent updater source contract
- static latest.json generation contract
- TypeScript
- locked Cargo graph
- zero Supabase / application-auth dependency in updater source

Windows native workflow:

```text
Desktop Independent Updater Bootstrap
```

It verifies:

- independent updater Cargo feature compilation
- native Tauri updater plugin configuration
- installable 0.1.1 bootstrap candidate
- installed WebView2 launch
- silent uninstall
- no updater release artifacts generated in bootstrap CI
- no signing private key required for bootstrap verification

## Exit State

```text
migration_track                     = MV-SUPABASE-EXIT-1E
updater_transport                    = tauri-static-signed
updater_metadata_authority           = independent-static-channel
updater_artifact_authority           = tauri-signature
updater_session_required             = false
updater_subscription_required        = false
updater_supabase_dependency          = false
updater_gateway_dependency           = false
updater_polar_dependency             = false
updater_product_key_dependency       = false
central_updater_db                   = false
live_0_1_2_release_published         = false
general_desktop_supabase_authority   = unchanged
local_sqlite_product_authority       = false
```

## Next Phase

`MV-SUPABASE-EXIT-2 — 0.1.2 Migration Bridge`

The migration bridge can now wire:

1. Desktop Product-Key activation
2. OS-secure device/session credential storage
3. Desktop -> Stateless Gateway transport
4. Local SQLite as product work-data authority
5. existing Supabase data migration/fallback
6. first signed 0.1.2 update release through the independent channel

without using Supabase as the updater transport or updater authorization authority.
