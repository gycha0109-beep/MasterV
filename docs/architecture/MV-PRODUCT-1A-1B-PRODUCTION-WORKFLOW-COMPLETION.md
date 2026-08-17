# MV-PRODUCT-1A/1B — Production Workflow Completion

Status: **PRODUCTION_WORKFLOW_VERIFIED / PROMPT_ACTIONS_READY / NOT ACTIVATED**

## 1. Goal

MV-PRODUCT-1A/1B closes the first real-user failure discovered while exercising the private Windows package and makes the single-video path usable as a production workflow rather than an architecture diagnostics console.

The verified user-facing path is:

```text
YouTube discovery
  -> hosted Deep Analysis
  -> user Product Truth
  -> hosted semantic matching
  -> canonical Production Guidance
  -> script / shooting / assets / editing prompts
```

This stage does not activate Background Batch, signing, updater, public release, PR merge, or Desktop production distribution.

## 2. Observed blocker

The external-use attempt reached Deep Analysis successfully but Production Guidance returned:

```text
unmatched/ambiguous match에 상품 사실이 연결되었습니다.
```

The original Product Truth interpreter correctly rejected semantic output that violated Product Truth authority, but a single malformed semantic match aborted the entire Production Guidance request and therefore hid all prompt actions.

The corrected contract keeps the safety invariant while changing failure granularity:

- invented facts still never enter a prompt,
- ambiguous/unmatched facts still cannot be promoted,
- malformed semantic relationships degrade only the affected mechanism instead of aborting the whole guide.

## 3. Canonical Product Truth safe degradation

Immutable safety implementation commit:

```text
4b34b3b51225c7ec6177b3dad45a2bb0d2efca1c
fix(product): sanitize Product Truth matcher output
```

The runtime-portable Product Truth core now sanitizes untrusted matcher output against two authorities:

1. the exact normalized user-provided source facts,
2. the canonical reference mechanism list produced by the production compiler.

Conservative sanitizer behavior:

- model-modified `source_facts` are discarded and replaced by user authority,
- facts absent from the user input are removed,
- `ambiguous` / `unmatched` matches cannot retain `matched_facts`,
- a fact-requiring `matched` mechanism with no valid user fact is downgraded,
- unknown mechanism ids are ignored,
- missing mechanisms receive a safe fallback,
- duplicate mechanisms are conservatively downgraded,
- structural mechanisms that do not require Product Truth may retain only a low-confidence structural fallback.

No sanitizer path creates a new product fact or strengthens a user claim.

Static semantic evidence:

```text
scripts/product-truth-safety-contract.ts
MASTERV_PRODUCT_TRUTH_SAFETY_CONTRACT_PASS
```

The contract exercises contradictory ambiguous/unmatched fact links, invented facts, source-authority repair, missing/unknown/duplicate mechanisms, and a clean non-degraded result.

## 4. Hosted immutable authority

The hosted Product Truth core import is pinned exactly to:

```text
4b34b3b51225c7ec6177b3dad45a2bb0d2efca1c/lib/product-truth-interpreter-core.ts
```

Unchanged Product Truth interpretation, reference adaptation, and single-video production compiler sources remain at the previous immutable source pin.

Live hosted poststate after deployment and verification:

```text
function     = masterv-api-boundary
version      = 10
status       = ACTIVE
verify_jwt   = true
import_map   = true
ezbr_sha256  = 16f9bf3d72103b10b09c73ae75710f09d4e24d279c7f8ea85b0c1e6fb12bef47
```

The hosted deployment changed the Product Truth core import pin; it did not grant Desktop provider, model, persistence, or Batch authority.

## 5. Desktop stale-prompt safety

Production Guidance is bound to the exact Product Truth snapshot used for its hosted request:

```text
product_name
verified_facts
target_customer
price_offer
```

After a successful guide, changing any of those fields immediately causes:

```text
status = STALE
guidanceStale = true
prompt surface = hidden
individual prompt copy = disabled
whole prompt copy = disabled
hosted request delta = 0
```

User-visible warning:

```text
상품 정보가 변경되었습니다. 기존 프롬프트는 사용할 수 없습니다. 제작안을 다시 생성해주세요.
```

If the exact original Product Truth snapshot is restored, the already-generated prompt becomes usable again without another hosted request. Any actual changed Product Truth requires a new Production Guidance submission.

## 6. Prompt UX

The native Desktop exposes four canonical prompt actions after Production Guidance succeeds:

```text
대본 만들기
촬영 계획
소재 목록
편집 지시
```

Each action has a prompt preview and independent copy control. A collapsed whole-production-prompt view provides one whole-copy action.

The prompt surface explicitly explains that prompts combine:

- analyzed reference production structure,
- server-derived metrics,
- user-entered Product Truth,
- canonical adaptation rules,
- anti-hallucination / anti-overclaim guardrails.

Reference-video product claims or specifications are not copied into the user's Product Truth.

If canonical adaptation safely excludes reference mechanisms, the guide may complete as:

```text
READY WITH WARNINGS
```

instead of treating the exclusions as a total workflow failure.

## 7. Developer diagnostics down-rank

These verification-oriented surfaces remain in the DOM but are moved under a collapsed `개발자 진단 / 실험 기능` disclosure:

- Hosted Capabilities,
- guarded Background Batch,
- Surface Migration roadmap.

Their existing IDs and authority markers are preserved for runtime regression tests. Background Batch is not promoted into the normal production workflow.

## 8. Preserved trust boundaries

The verified runtime preserves:

```text
provider_authority            = hosted-secret
compute_authority             = hosted-production-guidance
product_truth_authority       = user-input-raw
reference_analysis_authority  = validated-hosted-result-transit
metrics_authority             = server-derived
persistence_authority         = none
Desktop direct Gemini calls   = 0
Desktop local Next truth      = 0
Desktop local Next analyze    = 0
Desktop direct YouTube API    = 0
persistence writes            = 0
Background Batch requests     = 0
```

## 9. Authoritative implementation head verification

Implementation verification head before this document:

```text
8564a61abd8e74d5529eec37ef8c8aa21825d4fe
```

PR synthetic merge at that head:

```text
5f87e29994c74c9340d4ee10bb70009baf1966af
```

Base/main:

```text
f819da2a6568534360adbd4ee4282d22f495b923
```

Exact-head workflow results:

```text
CI #840
run 31984231275
SUCCESS

Desktop Release Readiness #17
run 31984231262
SUCCESS

Desktop Signing Readiness #13
run 31984231295
SUCCESS

Desktop Shareable Package #9
run 31984231255
SUCCESS

Desktop External Pilot Readiness #5
run 31984231272
SUCCESS
```

CI #840 passed `validate`, `desktop-shell`, and `desktop-windows-quality`. Native and installed Windows regressions for Reference Library, Detail/Compare, canonical compiler, YouTube Discovery, guarded Background Batch, installer quality, restart/logout, and uninstall all remained green.

## 10. Native Product workflow evidence

CI #840 artifact:

```text
artifact id = 9273410964
name        = masterv-windows-desktop-smoke
size        = 1,777,590 bytes
digest      = sha256:0218debfc613e37181da0a0e90622907e88eace5a769b6206adb88544bbda262
```

`artifacts/desktop-production-guidance/runtime-evidence.json` records:

```text
status                                = MASTERV_WINDOWS_PRODUCTION_GUIDANCE_RUNTIME_PASS
surface                               = desktop
auth_status                           = AUTHENTICATED
hosted_api_status                     = CONNECTED
product_truth_capability              = READY
production_guidance_capability        = READY
model                                 = gemini-3.6-flash
guidance_status                       = READY WITH WARNINGS
gemini_requests                       = 1
client_hosted_function_delta          = 1
client_gemini_api_delta               = 0
local_next_product_truth_requests     = 0
local_next_analyze_requests           = 0
client_youtube_api_delta              = 0
desktop_provider_credentials          = false
persistence_writes                    = 0
background_batch_requests             = 0
background_batch_migrated             = false
prompt_actions                        = 4
whole_prompt_copy                     = true
prompt_preview                        = true
stale_prompt_blocked                  = true
stale_prompt_restored_without_network = true
developer_diagnostics_collapsed       = true
logout_clear                          = true
```

This live Windows run is the direct regression for the user-observed Product Truth failure. Production Guidance completed instead of aborting, while unsafe/unapplicable reference mechanisms remained excluded.

## 11. Provider and installed-quality evidence

The same CI run recorded:

```text
PROVIDER_HEALTH_GREEN
deep_analysis       = success
production_guidance = success
activation_allowed  = false
```

Installed quality remained:

```text
MASTERV_WINDOWS_INSTALLED_QUALITY_PASS
installed_launch              = PASS
authenticated_runtime         = PASS
process_restart_without_logout= PASS
restart_auth_status           = SIGNED OUT
persistent_auth_storage       = false
explicit_logout_clear         = true
direct_gemini_requests        = 0
direct_youtube_data_api       = 0
local_next_api_requests       = 0
uninstall                     = PASS
updater_created               = false
activation                    = false
```

## 12. Packaging regressions

The unchanged packaging/signing-readiness architecture also passed on the implementation head.

Shareable Package #9:

```text
artifact id = 9273332749
name        = masterv-windows-private-share-package
digest      = sha256:e5d59a1728132ff19a3479d11c7fda42998a3d5c2d69dc87394afd5e788aa271
```

Release Readiness #17:

```text
artifact id = 9273334385
name        = masterv-windows-release-readiness
digest      = sha256:79de615edb0ca7ec45e59f8897120feb237118985644ee95e37b3efd25119ebe
```

Signing Readiness #13:

```text
artifact id = 9273330363
name        = masterv-windows-signing-readiness
digest      = sha256:944ab122fd80e56024c494a1766ee5c94d4cd9c2e175cd0c84f1be4a96ef2ba4
```

These passes do not sign, publish, release, or activate the application.

## 13. Background Batch poststate

After Product workflow verification, hosted database authority remains:

```text
provider_precondition_confirmed = false
live_batch_verified_at          = null
desktop_submit_enabled          = false
background_batch_jobs           = 0
```

Native guarded evidence still reports:

```text
submit_capability     = false
batch_submit_requests = 0
batch_create_attempts = 0
```

Therefore MV-PRODUCT-1A/1B did not alter the MV-ARCH-3J gate.

## 14. Repository/release lifecycle boundary

At the authoritative implementation-head poststate:

```text
PR #1 state       = open
PR #1 draft       = true
PR #1 merged      = false
PR #1 mergeable   = true
GitHub Releases   = 0
```

No tag, GitHub Release, signing activation, updater, public publication, PR Ready transition, merge, or Desktop production activation occurred.

## 15. Lifecycle conclusion

MV-PRODUCT-1A/1B establishes:

```text
PRODUCTION_WORKFLOW_VERIFIED
PROMPT_ACTIONS_READY
PRODUCT_TRUTH_SAFE_DEGRADATION_VERIFIED
STALE_PROMPT_BLOCKING_VERIFIED
PROVIDER_HEALTH_GREEN
NOT PUBLICLY RELEASED
NOT ACTIVATED
```

The next separate product stage remains MV-PRODUCT-1C: multi-reference Evidence Rules -> A/B/C Production Concepts -> Prompt Packs Desktop/hosted wiring.
