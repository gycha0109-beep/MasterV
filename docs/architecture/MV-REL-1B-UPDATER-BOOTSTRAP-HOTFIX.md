# MV-REL-1B — Updater Bootstrap Hotfix

## Status

Implementation stage for the forward-only MasterV `0.1.4` updater bootstrap hotfix.

This stage exists because production publication run `32446923550` successfully signed and published `v0.1.3`, but the post-publication Windows updater smoke did not reach the Tauri updater command. The published Desktop UI contains `header.hero`, while `desktop/updater.js` queried `section.hero` and returned before constructing the updater panel.

## Frozen incident evidence

Run `32446923550` established all of the following:

- signed release candidate: PASS
- `v0.1.3` GitHub Release publication: PASS
- public `latest.json`: readable
- public installer: readable
- post-publication verification: FAIL
- failure: updater UI state remained absent until timeout
- last observed state: empty status/notes with hidden/disabled install control
- root cause: `section.hero` selector did not match the real `header.hero` element
- no evidence established a production signature mismatch
- Tauri signature acceptance was not reached by the failed UI-driven smoke

## Remediation authority

MV-REL-1B is a forward fix only.

The published `v0.1.3` tag, installer, `.sig`, and release assets MUST NOT be replaced, edited in place, or republished under the same version.

The hotfix release authority is:

- version: `0.1.4`
- tag: `v0.1.4`
- installer: `MasterV_0.1.4_x64-setup.exe`
- signature: `MasterV_0.1.4_x64-setup.exe.sig`
- stable manifest: `releases/latest/download/latest.json`
- production updater key ID: `D72C34948864513E`

## Product fix

`desktop/updater.js` must bind to the actual Desktop hero element:

- required selector: `header.hero`
- forbidden selector: `section.hero`

The hotfix build receives a release-only static version rewrite from `0.1.3` to `0.1.4`; historical 0.1.3 architecture and release-plane files remain intact.

## Pre-publication gates

PR validation must prove:

1. the DOM selector contract matches `header.hero`;
2. the updater panel is created in an updater-enabled unsigned 0.1.4 Windows hotfix RC;
3. updater status is observable instead of remaining absent;
4. the same native updater public key authority is used;
5. no production signing credential is available to PR CI;
6. existing EXIT-3, POST-EXIT-1, and REL-1 contracts remain green.

## Production activation contract

Production activation is handled by a dedicated MV-REL-1B workflow rather than mutating the historical `v0.1.3` release workflow.

The workflow requires:

- exact current `main` SHA;
- explicit `allow_production_signing=true` before production private-key use;
- explicit `allow_release_publication=true` before stable-channel mutation;
- environment `masterv-production-release`;
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only in the signing job;
- tag/release nonexistence checks for `v0.1.4`;
- canonical installer/signature/manifest generation;
- immutable `v0.1.3` assets.

## Live signature acceptance gate

After `v0.1.4` publication, verification must use the exact already-published `v0.1.3` installer as the baseline.

Because the `v0.1.3` UI bootstrap is the known defect, the smoke must not fabricate a corrected 0.1.3 baseline. It must:

1. download and install the public `v0.1.3` installer;
2. reproduce the missing updater panel as frozen incident evidence;
3. invoke the already-compiled native `desktop_update_check` command directly through Tauri;
4. require discovery of public `0.1.4`;
5. invoke native `desktop_update_install` directly;
6. require the installed Windows version to become `0.1.4`;
7. launch the installed `0.1.4` binary;
8. require the repaired updater panel to exist and resolve the stable channel as `최신 버전`.

A successful `download_and_install` through the native Tauri updater, followed by an installed-version transition to `0.1.4`, is the production signature-acceptance evidence.

## Existing v0.1.3 installations

The native updater engine is present in the published `v0.1.3`, but the user-facing updater panel is not constructed because of the selector defect. Therefore an existing `v0.1.3` user cannot be assumed to discover the hotfix through the broken UI. Any real `v0.1.3` user must receive the `v0.1.4` installer through a manual repair/update path unless another already-exposed invocation path is verified separately.

This limitation does not permit mutation of the published `v0.1.3` assets.

## Closure criteria

MV-REL-1B can close only after all of the following are true:

- exact-head PR CI: PASS
- unsigned Windows 0.1.4 hotfix RC updater-panel smoke: PASS
- production signing: PASS
- signed 0.1.4 candidate artifact: PASS
- `v0.1.4` publication: PASS
- public `latest.json` points to `0.1.4`: PASS
- exact published `0.1.3` native updater installs signed `0.1.4`: PASS
- installed `0.1.4` updater panel bootstrap: PASS
- stable post-update check: `LATEST`

Until the live acceptance gate passes:

```text
MV_REL_1B = IMPLEMENTATION / VALIDATION_PENDING
MV_REL_1 = RELEASE_PUBLISHED / REMEDIATION_REQUIRED
INV_12 = OPEN
```
