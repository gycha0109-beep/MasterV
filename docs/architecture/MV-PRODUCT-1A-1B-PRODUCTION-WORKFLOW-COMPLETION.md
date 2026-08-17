# MV-PRODUCT-1A/1B — Production Workflow Completion

Status: **IMPLEMENTED / VERIFICATION_PENDING / NOT ACTIVATED**

## 1. Goal

MV-PRODUCT-1A/1B closes the first real-user failure discovered while exercising the private Windows package and makes the single-video path usable as a production workflow rather than an architecture diagnostics console.

The user-facing path is:

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

During a real Desktop use attempt, Deep Analysis completed but Production Guidance returned:

```text
unmatched/ambiguous match에 상품 사실이 연결되었습니다.
```

The original Product Truth interpreter intentionally rejected model output that violated the semantic contract. That protected Product Truth authority, but one malformed semantic match also aborted the entire guide and all four prompt actions.

The product requirement is stricter in a different direction:

- invented facts must still never reach a prompt,
- ambiguous/unmatched facts must still never be promoted,
- but a malformed model-side relationship must degrade only the affected mechanism rather than destroy the whole workflow.

## 3. Canonical safe degradation

The runtime-portable Product Truth core now sanitizes untrusted semantic matcher output against two authorities:

1. the exact user-provided normalized source facts,
2. the canonical reference mechanism list supplied by the production compiler.

The sanitizer applies conservative rules:

- model-modified `source_facts` are discarded and replaced with the user authority,
- facts absent from the user input are removed,
- `ambiguous` or `unmatched` matches cannot retain `matched_facts`,
- a fact-requiring `matched` mechanism with no valid user fact is downgraded,
- unknown mechanism ids are ignored,
- missing mechanisms receive a safe fallback,
- duplicate mechanisms are conservatively downgraded,
- structural mechanisms that do not require a product fact may retain only a low-confidence structural fallback.

No sanitizer rule creates a new product fact or strengthens a user claim.

The compatibility API `interpretProductTruthAgainstReferenceWithKey()` remains available, while a detailed result API exposes sanitizer warnings for future diagnostics.

## 4. Immutable hosted authority

The corrected Product Truth core is frozen in the repository at:

```text
4b34b3b51225c7ec6177b3dad45a2bb0d2efca1c
```

Only the hosted Product Truth core import is moved to that source pin. The unchanged Product Truth interpretation schema, reference adaptation compiler, and single-video production compiler remain pinned to their previous immutable source commit.

The hosted boundary still owns:

- Gemini credential,
- model selection,
- analysis validation,
- derived metrics,
- reference mechanism derivation,
- semantic matching,
- canonical Production Guidance compilation.

Desktop still carries no Gemini credential and makes no direct provider call.

## 5. Stale-prompt safety

A generated prompt is bound to the exact Product Truth snapshot used for its hosted Production Guidance request.

After a successful guide is rendered, changing any of these fields invalidates the prompt surface:

```text
product_name
verified_facts
target_customer
price_offer
```

Stale behavior is:

```text
status = STALE
guidanceStale = true
prompt surface = hidden
individual prompt copy = disabled
whole prompt copy = disabled
hosted request delta = 0
```

The UI displays:

```text
상품 정보가 변경되었습니다. 기존 프롬프트는 사용할 수 없습니다. 제작안을 다시 생성해주세요.
```

If the user restores the exact original Product Truth snapshot, the already-generated prompt surface becomes usable again without a network request. Otherwise the user must submit the updated Product Truth and compile a new guide.

## 6. Prompt UX

The Desktop Production Guidance output keeps the four canonical prompt actions:

```text
대본 만들기
촬영 계획
소재 목록
편집 지시
```

Each action now includes a short prompt preview before copy. The output also exposes a collapsed whole-production-prompt view with one whole-copy action.

The prompt surface explains its authority explicitly: it combines the analyzed reference production structure, server-derived metrics, the user's Product Truth, and guardrails. Reference-video product claims/specifications are not copied into the user's product facts.

When canonical adaptation excludes reference mechanisms, the guide may report `READY WITH WARNINGS` rather than treating safe exclusions as a total failure.

## 7. Developer diagnostics down-rank

The following surfaces are preserved for runtime/CI authority but moved into a collapsed `개발자 진단 / 실험 기능` section:

- Hosted Capabilities,
- guarded Background Batch,
- Surface Migration roadmap.

Their DOM ids and runtime markers remain present so existing capability, Background Batch, and architecture verification can continue to query them. This is presentation reorganization only.

Background Batch remains guarded and is not promoted into the main production workflow.

## 8. Preserved boundaries

MV-PRODUCT-1A/1B preserves:

```text
provider_authority            = hosted-secret
compute_authority             = hosted-production-guidance
product_truth_authority       = user-input-raw
reference_analysis_authority  = validated-hosted-result-transit
metrics_authority             = server-derived
persistence_authority         = none
Desktop direct Gemini calls   = 0
Desktop local Next truth calls= 0
persistence writes            = 0
Background Batch requests     = 0
```

It does not change the Background Batch database gates.

## 9. Verification plan

Static/semantic verification must prove:

- contradictory ambiguous/unmatched fact links degrade safely,
- invented facts are removed,
- missing/duplicate/unknown mechanisms cannot introduce authority,
- clean semantic output remains unchanged,
- hosted immutable source pin points to the safe core,
- Desktop stale snapshot logic exists,
- four prompt actions and whole-prompt action exist,
- developer diagnostics remain present but collapsed,
- no Desktop provider credential/direct Gemini/local Next authority is introduced.

Native Windows verification must additionally prove:

- live hosted Deep Analysis succeeds,
- live hosted Production Guidance reaches `READY` or `READY WITH WARNINGS`,
- four prompt actions and whole-copy are usable,
- Product Truth mutation produces `STALE` with no hosted request,
- stale prompt surface is hidden/disabled,
- exact Product Truth restore re-enables the prompt with no hosted request,
- logout still clears process state.

## 10. Lifecycle boundary

Until exact-head static, native Windows, hosted poststate, and regressions are complete, the lifecycle remains:

```text
IMPLEMENTED
VERIFICATION_PENDING
NOT ACTIVATED
```

MV-PRODUCT-1C multi-reference Evidence -> A/B/C -> Prompt Pack Desktop wiring remains a separate later stage.
