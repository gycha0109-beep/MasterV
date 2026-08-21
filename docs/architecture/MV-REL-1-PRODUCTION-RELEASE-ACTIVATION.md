# MV-REL-1 — Production Release Activation

Status: ACTIVATION PENDING  
Prerequisite: `MV-POST-EXIT-1 = CLOSED`  
Target version: `0.1.3 — Clean Cut`  
Stable tag: `v0.1.3`

## Purpose

MV-REL-1 is the production activation stage for the independent signed updater. It is intentionally separated from MV-POST-EXIT-1 because this stage is the first stage allowed to consume the production Tauri updater signing private key and publish the stable GitHub Release channel.

The target architecture requires:

```text
latest.json
MasterV_<version>_x64-setup.exe
MasterV_<version>_x64-setup.exe.sig
```

and requires updater artifacts to pass Tauri updater signature verification before installation.

For 0.1.3 the canonical public release assets are therefore:

```text
latest.json
MasterV_0.1.3_x64-setup.exe
MasterV_0.1.3_x64-setup.exe.sig
```

The Tauri build output may contain the product display name and spaces. MV-REL-1 copies the exact signed bytes to the canonical URL-stable public asset name before generating `latest.json`. The signature remains valid because the artifact bytes are unchanged.

## Authority

Production release source authority is the exact current `main` SHA.

The production workflow must reject:

- a branch-only SHA
- a stale historical `main` SHA
- a non-40-character SHA
- an already-existing `v0.1.3` release tag
- an already-existing `v0.1.3` GitHub Release

The release workflow exists as `workflow_dispatch` only. It must not activate from `pull_request` or `push`.

## Production signing boundary

Production updater signing requires an explicit `allow_production_signing=true` input and the protected GitHub environment `masterv-production-release`.

The only production signing secrets consumed by the signed-artifact job are:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # optional when the key is unencrypted
```

The private key must never be committed to the repository, embedded in the Desktop binary, uploaded as an artifact, or written to logs.

Tauri release authority:

```text
src-tauri/tauri.windows-independent-updater-release.conf.json
version = 0.1.3
bundle.createUpdaterArtifacts = true
```

The build must produce a non-empty updater signature before publication can continue.

## Publication boundary

Release publication is a second explicit opt-in:

```text
allow_release_publication=true
```

Signing and publication are deliberately separate gates. A signed release candidate may be generated as a protected Actions artifact without publishing the public stable channel.

When publication is explicitly enabled:

1. re-verify the exact current `main` SHA
2. ensure `v0.1.3` does not already exist
3. create a draft GitHub Release
4. upload the canonical installer, `.sig`, and `latest.json`
5. verify the draft contains the exact three updater assets
6. publish `v0.1.3` as the latest stable release
7. wait until the public `releases/latest/download/latest.json` endpoint is readable
8. run the published updater signature acceptance smoke

## Published signature acceptance gate

`INV-12` is not closed by the existence of a `.sig` file alone.

After stable publication, a Windows GitHub-hosted runner must:

```text
build unsigned updater-aware 0.1.2 baseline
→ install 0.1.2
→ launch without Product Key / Polar / Gemini / YouTube / Supabase credentials
→ query the real public GitHub latest.json channel
→ observe 0.1.3 available
→ invoke the native Tauri updater install command
→ allow Tauri to download and verify the production signature
→ install 0.1.3
→ verify Windows installed version = 0.1.3
→ relaunch 0.1.3
→ verify stable channel reports latest version
→ uninstall runner fixture
```

A successful install through `tauri-plugin-updater` is the production evidence that the published artifact signature was accepted by the updater implementation configured with the shipped public key.

Evidence marker:

```text
MASTERV_REL_1_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS
```

## Completion criteria

MV-REL-1 may be classified `CLOSED` only when all of the following are true for the same exact release SHA:

```text
[ ] source SHA equals current main
[ ] MV-POST-EXIT-1 remains valid
[ ] production updater signing key is supplied only through protected secret authority
[ ] production Tauri-signed 0.1.3 installer is generated
[ ] non-empty .sig is generated
[ ] latest.json embeds the exact signature contents
[ ] canonical installer URL uses HTTPS
[ ] v0.1.3 GitHub Release is published as latest stable
[ ] public latest.json is readable
[ ] 0.1.2 detects 0.1.3 without subscription/session authority
[ ] Tauri accepts the production signature and installs 0.1.3
[ ] installed version after updater execution is 0.1.3
[ ] updated app reports stable channel as current
[ ] Supabase is not reintroduced
```

Until real signing and publication are explicitly authorized and the published-updater smoke passes, the correct classification is:

```text
MV_REL_1 = ACTIVATION_PENDING
INV_12 = PRODUCTION_SIGNATURE_ACCEPTANCE_PENDING
```

## Current PR boundary

The release activation plane can be implemented and statically validated while PR #1 remains Draft/Open/Unmerged.

Actual production activation cannot occur from the feature branch because the workflow requires its `source_sha` to equal the current remote `main` SHA. Therefore implementing MV-REL-1 does not authorize or imply:

- PR merge
- Draft removal
- production signing-key creation or replacement
- production signing execution
- GitHub Release publication
- stable updater-channel mutation

Those actions remain explicit activation decisions after the release plane itself passes exact-head CI.
