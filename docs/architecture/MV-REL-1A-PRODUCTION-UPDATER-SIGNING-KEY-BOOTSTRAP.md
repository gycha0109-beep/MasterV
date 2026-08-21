# MV-REL-1A — Production Updater Signing Key Bootstrap

Status: PUBLIC KEY INTEGRATION PENDING  
Parent stage: `MV-REL-1`  
Base main SHA: `36003f3815e08e5f8762fa9f24b478869bff579a`  
Target release: `0.1.3 — Clean Cut`  
Production updater key ID: `D72C34948864513E`

## Trigger

The first production signing attempt (`Desktop Production Release Activation`, run `32436976013`) failed before build/signing because the protected environment did not contain `TAURI_SIGNING_PRIVATE_KEY`.

The failure occurred at the exact-main authority step after checking out `36003f3815e08e5f8762fa9f24b478869bff579a`. No updater signature, release artifact, GitHub Release, or stable-channel mutation was created.

The previously configured updater public key had no confirmed recoverable private-key authority and had never been used for a published MasterV stable release. Therefore MV-REL-1A establishes the first recoverable production updater signing authority before public release.

## Key generation authority

The new keypair uses the format expected by the repository-pinned `@tauri-apps/cli 2.11.4` signing path:

```text
minisign Ed25519 keypair
secret key encrypted with password
Tauri Base64 wrapper around minisign key boxes
```

The generated production updater public-key ID is:

```text
D72C34948864513E
```

Only the public key is allowed in source control.

The private key and password must remain outside the repository and must be supplied to GitHub only through the protected environment `masterv-production-release` as:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

## Public-key integration scope

All updater-aware build/runtime authorities must use the same public key:

```text
src-tauri/src/updater.rs
src-tauri/tauri.windows-updater-bootstrap.conf.json
src-tauri/tauri.windows-updater-rc.conf.json
src-tauri/tauri.windows-independent-updater-release.conf.json
```

The 0.1.2 baseline config is intentionally rotated before the first public release so the controlled 0.1.2 → 0.1.3 production updater acceptance smoke verifies the same production key that 0.1.3 ships with.

## Secret handling invariants

The following are prohibited:

- commit the private key
- commit the private-key password
- print either secret in CI logs
- upload either secret as a GitHub Actions artifact
- embed the private key in the application binary
- run production signing against a source tree carrying a different updater public key

The private key is encrypted at rest and is not required for unsigned RC or upgrade-survival validation.

## Validation gates

Before merging this key bootstrap into `main`:

```text
[ ] native updater public key uses key ID D72C34948864513E
[ ] 0.1.2 baseline config uses the same public key
[ ] 0.1.3 unsigned RC config uses the same public key
[ ] 0.1.3 signed release config uses the same public key
[ ] desktop independent updater contract passes
[ ] MV-REL-1 contract decodes and verifies the production key ID
[ ] EXIT-3 clean-cut contract remains valid
[ ] POST-EXIT-1 contract remains valid
[ ] PR CI passes on the exact bootstrap head SHA
```

After merge, the new exact `main` SHA becomes the only valid source for the next production signing attempt.

## Activation boundary

MV-REL-1A does not publish a release.

After this bootstrap is merged and the protected environment secrets are registered, rerun:

```text
Desktop Production Release Activation
source_sha = <new exact main SHA>
allow_production_signing = true
allow_release_publication = false
```

A successful run must create `masterv-0.1.3-signed-release-candidate` evidence with a non-empty `.sig` while publication remains false.

Only after that evidence is verified may the separate stable-publication gate be considered.
