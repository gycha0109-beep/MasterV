# MV-ARCH-1 — Tiered Discovery & Analysis Pipeline v1

Status: **DESIGNED / NOT IMPLEMENTED**

Repository: `gycha0109-beep/MasterV`

Date: 2026-08-13

---

## 0. 왜 이 설계가 필요한가

현재 MVP는 `영상 URL 1개 -> Gemini Deep Analysis 1회` 구조다.

이 구조는 단일영상 분석 품질 검증에는 적합하지만 최종 MasterV의 검색형 제품에는 맞지 않는다.

최종 UX는:

```text
상품/키워드 입력
  -> 여러 플랫폼에서 관련 참고영상 발견
  -> 좋은 후보를 빠르게 훑음
  -> 저장/비교
  -> 대표 영상만 깊게 분석
  -> 공통 제작 메커니즘 추출
  -> 내 상품 Product Truth와 결합
  -> 제작안/프롬프트
```

이어야 한다.

검색 결과 20개를 그대로 20회 Deep Analysis하면 Gemini RPD/RPM/TPM과 비용에 너무 쉽게 부딪힌다. 따라서 **발견과 분석을 분리하고, 분석도 coarse/deep 두 계층으로 분리한다.**

---

## 1. 외부 제약 계약

### Gemini Video

공식 문서 기준:

- 공개 YouTube URL을 직접 video input으로 사용할 수 있다.
- Gemini 2.5+는 요청당 최대 10개 동영상을 받을 수 있다.
- 동시에 Google은 최적 결과를 위해 요청당 영상 1개를 권장한다.
- 기본 video visual sampling은 약 1 FPS다.
- Gemini 3에서는 video media resolution을 낮춰 토큰/비용을 줄일 수 있다.
- Free Tier YouTube URL 처리에는 하루 총 8시간 영상 제한이 있다.
- Rate limit은 project 단위이며 RPM / TPM / RPD 중 하나라도 초과하면 429가 발생한다.
- RPD는 Pacific Time 자정에 reset된다.

결론:

> `10 videos/request`는 지원 상한일 뿐 품질 authority가 아니다.

MasterV는 bundle size를 하드코딩하지 않고 calibration으로 허용 크기를 정한다.

### Gemini Batch API

공식 문서 기준:

- 대량 비동기 작업용이다.
- 일반 interactive traffic과 별도 rate limit을 사용한다.
- 표준 비용의 50% 가격이다.
- target turnaround는 24시간이며 즉시 응답을 보장하지 않는다.
- 현재 Batch API는 `generateContent` 기반이다.

결론:

> 실시간 검색 경로와 대량 background enrichment 경로를 분리한다.

### YouTube Discovery

YouTube Data API 검색은 별도 quota를 사용한다. Discovery 단계는 Gemini 분석과 분리한다.

---

## 2. 최종 파이프라인

```text
[1. DISCOVERY]
Keyword: "우산"
YouTube / TikTok / Meta / direct URL
        |
        v
[2. METADATA FILTER — AI 0회]
플랫폼별 relevance / recency / native signals / duration
중복 제거 / 다양성 샘플링
        |
        v
[3. COARSE SCAN]
상위 후보만 빠른 구조 분석
여러 영상을 small bundle로 처리 가능
        |
        v
[4. CLUSTER & REPRESENTATIVE PICK — AI 0회]
시연형 / 큐레이팅 / 구매가이드 / 이미지 짜집기 등
유사 영상 묶기 + 대표 선택
        |
        v
[5. DEEP ANALYSIS]
대표 3~5개만 현재 Deep Analyzer 사용
claim/evidence/subject attribution/segments 등
        |
        v
[6. COMPARE / EVIDENCE RULES — AI 0회 우선]
반복 메커니즘 / 차이 / evidence confidence
        |
        v
[7. PRODUCT TRUTH ADAPTATION]
사용자 상품 사실과 제작 메커니즘 연결
        |
        v
[8. PRODUCTION]
A/B/C concept -> script/shoot/assets/edit prompts
```

핵심 원칙:

> **Collection is a plug-in. Analysis is tiered. Deep analysis is scarce.**

---

## 3. Stage 1 — Discovery

### 책임

- 플랫폼에서 후보를 많이 찾는다.
- 아직 Gemini를 호출하지 않는다.

### Normalized Candidate

```ts
type SearchCandidate = {
  source: "youtube" | "tiktok" | "meta" | "direct";
  source_id: string;
  canonical_url: string;
  title?: string;
  creator?: string;
  published_at?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  native_metrics: Record<string, number | string | null>;
  source_metadata: Record<string, unknown>;
};
```

### 절대 금지

플랫폼의 서로 다른 지표를 `universal performance score` 하나로 합치지 않는다.

YouTube view, TikTok engagement, Meta ad longevity 등은 의미가 다르다.

따라서:

1. 플랫폼 내부에서 먼저 후보를 정렬한다.
2. 플랫폼 간 병합은 round-robin / diversity rule로 한다.
3. 원본 native signals를 항상 보존한다.

---

## 4. Stage 2 — Metadata Filter

Gemini 호출: **0회**

목표는 `많이 찾기 -> AI를 쓸 가치가 있는 후보만 남기기`다.

### Filter inputs

- 검색어 relevance
- duration 범위
- 업로드 시점
- source-native performance signal
- 중복 URL / 같은 영상 재업로드
- creator concentration
- product/category relevance
- 이미 분석된 cache 존재 여부

### Diversity sampling

상위 숫자만 자르면 같은 형식 영상이 반복될 수 있으므로 다음 다양성을 확보한다.

- creator diversity
- duration diversity
- visual/source diversity
- platform diversity
- apparent creative type diversity

이 단계 결과 예시:

```text
발견 126개
  -> 중복 제거 94개
  -> metadata shortlist 30개
```

---

## 5. Stage 3 — Coarse Scan

### 목적

Deep Analysis에 들어가기 전에 **영상의 큰 제작 구조만 싸게 파악**한다.

### Coarse schema

Coarse 단계에서는 다음만 추출한다.

```ts
type CoarseVideoAnalysis = {
  source_id: string;
  duration_seconds: number | null;
  primary_delivery_mode:
    | "demonstration"
    | "curation"
    | "buying_guide"
    | "review"
    | "problem_solution"
    | "comparison"
    | "vlog"
    | "image_compilation"
    | "mixed"
    | "unknown";
  hook_type: string;
  dominant_visual_source: string;
  product_first_seen_seconds: number | null;
  direct_demo_present: boolean;
  cta_present: boolean;
  multi_product: boolean;
  rough_structure: string[];
  risk_flags: string[];
  confidence: "high" | "medium" | "low";
};
```

### Coarse 단계에서 하지 않는 것

- full transcript
- fine-grained claims
- evidence adjudication
- 1초 단위 observation timeline
- 제품 성능 fact 판정
- literal shot/cut analysis

이것들은 Deep 단계 책임이다.

---

## 6. Multi-video Bundle 정책

Gemini는 최대 10 videos/request를 지원하지만 공식 best practice는 1 video/request다.

따라서 v1 정책:

```text
hard max        = 10
production max  = calibration 결과로 결정
initial candidate bundle sizes = 2 / 4 / 6 / 10
```

### 초기 설계 기본값

**bundle size 4를 후보 기본값**으로 둔다. 단, calibration 통과 전 production activation 금지.

이유:

- RPD 절감 효과가 충분하다.
- Shorts 4개면 context가 과도하게 커지지 않는다.
- 10개보다 cross-video attribution 위험이 낮다.

### 요청 구조

각 영상에 immutable `source_id`를 붙인다.

```text
SOURCE A: yt:T9Kc4GT8vGA
[video A]

SOURCE B: yt:1u3GloCO2ts
[video B]

...

반드시 source_id별 결과를 정확히 하나 반환.
다른 SOURCE의 장면/주장/시간 정보를 섞지 말 것.
```

서버 validation:

- input source_id 수 == output source_id 수
- duplicate output ID 금지
- unknown output ID 금지
- missing source ID면 bundle 실패 처리

구조 검증은 가능하지만 semantic bleed는 별도 calibration으로 검증한다.

---

## 7. Bundle Calibration Gate

기존 12개 실제 Shorts 표본을 이용한다.

### Test matrix

```text
single-video baseline
2-video bundle
4-video bundle
6-video bundle
10-video bundle
```

같은 영상을 여러 bundle ordering으로 반복해 위치 효과도 확인한다.

### 평가 항목

- source attribution bleed count
- primary delivery mode agreement
- hook type agreement
- product first seen MAE
- CTA presence agreement
- rough structure agreement
- missing item rate
- hallucinated cross-video feature rate

### activation rule

가장 큰 bundle을 고르는 것이 목표가 아니다.

**cross-video bleed가 발견되면 해당 bundle size 이상은 즉시 탈락**시킨다.

초기 production target은 4이며, 4도 불안정하면 2 또는 1로 낮춘다.

### fallback

Multi-video coarse가 품질 gate를 통과하지 못하면:

- one-video coarse + lighter model
- 또는 Batch API one-video-per-request

로 전환한다.

즉 MasterV architecture는 multi-video bundling 성공 여부에 종속되지 않는다.

---

## 8. Stage 4 — Cluster & Representative Selection

Gemini 호출: **0회 우선**

Coarse 결과를 deterministic code로 그룹화한다.

예:

```text
20개 coarse 결과

시연형               7
큐레이팅              4
상품사진/그래픽형       3
구매가이드             3
혼합형                 3
```

대표 영상 선정 기준:

- cluster 대표성
- native performance signal
- confidence
- source diversity
- visual diversity
- duplicate penalty

`조회수 최상위 5개`만 고르지 않는다.

예:

```text
시연형 2개
큐레이팅 1개
이미지형 1개
구매가이드 1개
=> Deep 5개
```

---

## 9. Stage 5 — Deep Analysis

현재 구현된 Single Video Deep Analyzer를 이 단계로 이동한다.

Gemini: **1 video/request 유지**

이 단계에서만:

- observation_segments
- subject attribution
- scene purpose
- claim/evidence separation
- semantic segments
- transcript
- product use / demonstration type
- comparison/result nuance
- high-detail timestamps

를 추출한다.

왜 1개씩 유지하는가:

- Google best practice와 일치
- claim/evidence 교차 오염 방지
- 현재 실제 영상 검증 데이터가 single-video 기준으로 축적됨

---

## 10. Stage 6 — Compare / Evidence Rule Compiler

기본적으로 추가 Gemini 호출 없이 코드로 계산한다.

### coarse evidence 용도

많은 영상에서 다음 빈도를 파악한다.

- hook type
- delivery mode
- CTA 존재
- demo 존재
- product appearance timing

### deep evidence 용도

다음처럼 오판 비용이 높은 규칙만 Deep evidence를 사용한다.

- 직접 시연인지 연출인지
- 비교 대상 귀속
- 성능 주장과 실제 관찰 결과 분리
- 건강/효능/인증/수치 claim

### Rule provenance

모든 규칙은 다음을 가진다.

```ts
type EvidenceRule = {
  rule: string;
  support_count: number;
  coarse_support: string[];
  deep_support: string[];
  source_breakdown: Record<string, number>;
  confidence: "high" | "medium" | "low";
  limitations: string[];
};
```

`많이 반복됐다`를 `성과 원인이다`로 승격하지 않는다.

---

## 11. Product Truth Adaptation

Product Truth semantic matching은 video Deep model과 분리한다.

### 원칙

- 사용자 raw text = authority
- matcher는 의미 연결만 수행
- 사실 강화 금지
- 결과 cache
- 같은 input + same mechanism set이면 재호출 금지

### Scale rule

Product Truth 해석은 한 검색 세션당 수십 번 호출되는 기능이 아니다.

실제 제작안에 들어갈 때 1회 수행하고 결과를 재사용한다.

---

## 12. Cache 계약

동일 영상을 반복 분석하지 않는다.

### Cache key

```text
provider
+ canonical source id
+ analyzer tier (coarse/deep)
+ analyzer schema version
+ prompt version
+ model
+ media resolution
```

예:

```text
youtube:T9Kc4GT8vGA
/coarse-v1
/gemini-3.6-flash
/low
/prompt-3
```

### invalidation

다음일 때만 재분석한다.

- schema version 변경
- prompt version 변경
- model 변경
- user force refresh

UI 새로고침이나 같은 검색 반복은 Gemini 호출 사유가 아니다.

---

## 13. Quota Budget Manager

Rate limit은 API key가 아니라 project 단위이며 실제 한도는 tier/model에 따라 달라진다.

따라서 MasterV는 `RPD=20`을 코드 상수로 박지 않는다.

### 상태

```ts
type AnalysisBudgetState = {
  tracked_requests_today: number;
  last_reset_window: string;
  last_rate_limit?: {
    kind: "RPM" | "TPM" | "RPD" | "UNKNOWN";
    model?: string;
    limit?: number;
  };
  queue_paused_until?: string;
};
```

`tracked_requests_today`는 MasterV 내부 호출만 추적하므로 Google 전체 프로젝트 사용량의 absolute authority라고 표시하지 않는다.

### 429 behavior

- RPM: 현재 queue pause, retry window 이후 resume 가능
- TPM: bundle size/media resolution 축소 고려
- RPD: 해당 model interactive queue 즉시 stop
- UNKNOWN: 자동 hammering 금지, 사용자/관리자 확인

RPD에서 자동 재시도를 반복하지 않는다.

---

## 14. Interactive / Background / Dev 세 모드

### A. Interactive Search

사용자가 키워드를 검색하고 바로 결과를 보고 싶을 때.

```text
Discovery -> metadata results 즉시 표시
-> best candidates coarse scan progressive enrichment
-> representative deep analysis
```

### B. Background Library Enrichment

보관함에 저장된 영상을 대량으로 밤새/비동기로 분석할 때.

Gemini Batch API 후보.

- 일반 interactive traffic과 별도 rate limit
- one-video-per-request semantic isolation 유지 가능
- 50% cost
- 즉시성 보장 없음

Batch가 YouTube URL / media input과 현재 요구사항을 실제로 만족하는지는 별도 spike 후 activation한다.

### C. Replay / Dev

이미 저장된 실제 Gemini JSON fixture를 사용한다.

UI / compare / production / Product Truth 개발은 Gemini 호출 0회.

---

## 15. Request Budget 예시

### 현재 방식

```text
우산 영상 20개
Deep 20개 = 20 interactive requests
```

### Tiered 방식 — bundle 4가 calibration 통과한 경우

```text
Discovery 100개                0 Gemini
Metadata shortlist 20개        0 Gemini
Coarse 20 / bundle 4           5 requests
Deep representative 4개        4 requests
Product Truth interpretation    1 request
Compare/rules                   0 requests
------------------------------------------
총                             10 requests
```

같은 영상을 다시 검색하면 cache hit으로 coarse/deep는 0회가 될 수 있다.

### bundle 10은

이론적으로 20 coarse = 2 requests지만 **공식 best practice와 attribution risk 때문에 calibration 전 기본값으로 사용하지 않는다.**

---

## 16. Free Dev Profile / Paid Product Profile

### DEV_FREE

목적: 개발 중 하루 quota를 한 검색으로 다 태우지 않기.

```text
search candidates      50
metadata shortlist     12
coarse target          8
candidate bundle       4 (calibration 후)
deep target            2
auto Gemini budget     최대 4 requests/query 목표
```

### PRODUCT_INTERACTIVE

실제 유료 서비스 기준.

```text
search candidates      100+
metadata shortlist     30
coarse target          16~24
deep target            3~5
bundle size            calibration 결과
```

### BACKGROUND_ENRICH

저장된 library를 Batch API로 비동기 처리.

이 profile들은 config이며 business tier와 1:1로 묶지 않는다.

---

## 17. UX 계약

사용자가 `우산`을 입력했을 때 화면은 분석 완료를 기다렸다가 뜨면 안 된다.

### Progressive UX

```text
우산 검색

찾은 영상 84개
[카드][카드][카드]...        <- metadata 즉시

빠른 분석 중 8/16
정밀 분석 2/4
```

각 카드 상태:

```text
미분석
빠른 분석 완료
정밀 분석 완료
분석 대기
분석 제한됨
```

사용자는 Gemini가 막혀도 발견된 영상을 보고 저장할 수 있어야 한다.

### 분석은 검색의 prerequisite가 아니다.

이 원칙을 UX에서 반드시 유지한다.

---

## 18. Platform Adapter 계약

```ts
interface DiscoveryProvider {
  search(query: string, options: SearchOptions): Promise<SearchCandidate[]>;
}

interface MediaResolver {
  resolve(candidate: SearchCandidate): Promise<ResolvedMedia | MetadataOnly>;
}
```

YouTube public URL은 Gemini direct URI를 사용할 수 있다.

TikTok / Meta 등은 Gemini가 해당 페이지 URL을 직접 video input으로 지원한다고 가정하지 않는다.

지원 가능한 공식 API/media access 또는 합법적 media ingestion 경로가 없으면 `MetadataOnly`로 남긴다.

Collection layer는 교체 가능해야 한다.

---

## 19. Failure / Partial Success

### Coarse bundle 일부 실패

- 전체 검색 실패로 취급하지 않는다.
- 성공 item은 저장한다.
- 실패 item만 smaller bundle 또는 single retry 후보로 넣는다.
- RPD일 경우 retry하지 않고 pending으로 보존한다.

### Deep 분석 실패

- coarse 결과는 계속 사용할 수 있다.
- compare에서 deep evidence unavailable 표시.

### 플랫폼 media 접근 실패

- metadata-only 카드 유지.
- `분석 불가`와 `검색 불가`를 구분한다.

---

## 20. Observability

최소 기록:

```text
query_id
candidate count by platform
cache hit/miss
coarse requests
videos per coarse request
coarse latency
bundle attribution validation failures
deep requests
deep latency
429 kind/model/limit
estimated input video seconds
```

개별 사용자에게 내부 quota 수치를 과장해 표시하지 않는다.

---

## 21. 구현 순서

### MV-ARCH-1A — Contract

- SearchCandidate
- CoarseVideoAnalysis
- AnalyzerTier
- cache key
- analysis queue state

### MV-ARCH-1B — Coarse Analyzer Harness

- 기존 12개 영상 fixture
- single coarse baseline
- bundle 2/4/6/10 runner

### MV-ARCH-1C — Bundle Calibration

- attribution bleed 평가
- bundle size activation decision

### MV-ARCH-1D — Cache + Budget Manager

- coarse/deep cache
- RPD stop behavior
- dev replay mode

### MV-ARCH-1E — YouTube Discovery MVP

- keyword search
- metadata normalization
- duplicate/diversity filter

### MV-ARCH-1F — Orchestrator

- search -> shortlist -> coarse -> cluster -> deep
- progressive partial results

### MV-ARCH-1G — Search UX

- keyword input
- result cards
- analysis state
- save/compare

### MV-ARCH-1H — Background Batch Spike

- Batch API + video/media support 검증
- turnaround / result mapping / quota behavior
- 통과 시 library enrichment에만 activation

---

## 22. 현재 구현의 위치

현재 Single Video Analyzer는 폐기하지 않는다.

새 구조에서 역할은:

```text
현재: 제품 전체의 분석 엔진

변경 후:
Stage 5 Deep Analyzer
```

현재 만들어둔:

- subject attribution
- claim/evidence separation
- production guide
- Product Truth adaptation
- prompt compiler

도 그대로 후단에 재사용한다.

변경되는 것은 **언제, 몇 개 영상에 Deep Analysis를 적용하느냐**다.

---

## 23. 최종 결정

MasterV v1 분석 architecture는 다음으로 고정한다.

```text
DISCOVER MANY
    -> FILTER WITHOUT AI
    -> COARSE SCAN SELECTED CANDIDATES
    -> CLUSTER / PICK REPRESENTATIVES
    -> DEEP ANALYZE FEW
    -> COMPARE WITH EVIDENCE
    -> ADAPT TO PRODUCT TRUTH
    -> PRODUCE
```

### 결정 사항

1. 검색 결과 전체에 Deep Analysis 금지.
2. Single Video Deep Analyzer는 대표 영상 전용.
3. Coarse multi-video는 calibration 없이는 production activation 금지.
4. 공식 max 10은 상한일 뿐 기본 bundle size가 아니다.
5. 실시간 경로와 Batch background 경로 분리.
6. 검색/수집은 Gemini quota가 없어도 동작해야 한다.
7. 같은 영상은 analyzer version이 같으면 재호출하지 않는다.
8. RPD가 발생하면 queue를 멈추며 자동 hammering하지 않는다.
9. 플랫폼별 native signal은 universal performance score로 합치지 않는다.
10. 기존 Deep evidence/claim safety contract는 후단에서 그대로 유지한다.

---

## 24. 공식 참고

- Gemini Video Understanding: https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini Rate Limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini Batch API: https://ai.google.dev/gemini-api/docs/batch-api
- Gemini File Input Methods: https://ai.google.dev/gemini-api/docs/file-input-methods
- YouTube Data API quota: https://developers.google.com/youtube/v3/determine_quota_cost
