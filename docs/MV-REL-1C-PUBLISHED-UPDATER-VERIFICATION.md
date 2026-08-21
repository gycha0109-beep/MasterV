# MV-REL-1C — Published Updater Verification Harness Repair

## Purpose

MV-REL-1C repairs only the post-publication verification harness after the v0.1.4 production hotfix was successfully signed and published.

It does not sign a new binary, mutate v0.1.3 or v0.1.4 assets, create or edit a GitHub Release, or change the stable updater channel.

## Trigger

Production run `32455797142` established:

- v0.1.4 production signing: PASS
- v0.1.4 GitHub Release publication: PASS
- public stable updater assets: PASS
- post-publication verification: FAIL before `desktop_update_check`

The failing REL-1B verifier attached to the first available WebView2 CDP target and immediately asserted the Desktop DOM. Both the initial run and a verification-job retry failed with an empty `heroTag`, before the Tauri updater bridge was invoked.

The already-passing Windows RC harness uses the repository's `windows-webview2-attach.mjs` helper, which waits for the MasterV application target, `https://tauri.localhost/`, a non-loading DOM, and the Desktop surface before assertions.

## Repair

REL-1C uses the same governed WebView2 attachment authority for the published-release path.

The verifier must:

1. read the public stable `latest.json` and require v0.1.4;
2. download the immutable published v0.1.3 installer;
3. install and attach specifically to the MasterV Desktop application target;
4. wait for the Desktop DOM and Tauri bridge before checking the frozen v0.1.3 UI bootstrap defect;
5. invoke the compiled v0.1.3 `desktop_update_check` bridge and require discovery of v0.1.4;
6. invoke `desktop_update_install` and require the installed Windows product version to become v0.1.4;
7. launch the installed v0.1.4 and require the repaired updater panel to report `최신 버전`;
8. write durable verification evidence showing that the successful install exercised Tauri production signature acceptance.

## Verification-only authority

`.github/workflows/desktop-rel-1c-published-updater-verification.yml` has `contents: read` only.

It must not receive:

- application API credentials;
- `TAURI_SIGNING_PRIVATE_KEY`;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
- release publication authority.

It is allowed to read public v0.1.3/v0.1.4 release assets and install them on an ephemeral Windows runner.

## Closure criterion

Only a successful verification-only run that produces:

```text
MASTERV_REL_1C_PUBLISHED_UPDATER_SIGNATURE_ACCEPTANCE_PASS
```

may close the remaining production updater acceptance gate.

Until then:

```text
MV_REL_1B = PRODUCTION_HOTFIX_SIGNED_AND_PUBLISHED / VERIFICATION_PENDING
MV_REL_1  = LIVE_ACCEPTANCE_PENDING
INV_12    = OPEN
```
