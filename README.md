# MasterV

상품 숏폼 참고영상을 구조화해서 분석하고, 실제 영상이 무엇을 어떤 순서로 조합해 만들어졌는지 역설계하는 내부 도구입니다.

## 현재 구현 범위

- 공개 YouTube / Shorts URL 단일 영상 분석
- Gemini 구조화 JSON 분석
- 의미 단락과 별도로 시간 구간별 관찰 데이터 추출
  - 화면 설명
  - 화면 소재
  - 출연 요소
  - 상품 포함 여부
  - 실제 행동
  - 메시지 역할
  - 주장과 화면상 근거 분리
- 관찰 데이터에서 코드로 파생 지표 계산
  - 첫 3초 구성
  - 상품 최초 등장 / 노출 비율
  - 화면 소재별 coverage
  - 얼굴·손 등 출연 요소별 coverage
  - 직접 사용 / 기능 시연 횟수와 시간
  - 화면으로 확인 가능한 결과
  - 주장 대비 근거
  - CTA 위치
- 단일 영상 분석 UI
  - 첫 3초
  - 화면 구성
  - 출연 방식
  - 제품 사용 / 기능 시연 / 관찰 가능한 결과
  - 주장과 근거
  - 시간순 역설계
  - 의미 단락 / 전체 대본
- 세션형 비교함
  - 분석한 영상을 하나씩 저장
  - 2개 이상부터 추가 AI 호출 없이 비교
- 다중 레퍼런스 비교
  - 첫 3초 상품 등장 비율
  - 화면 소재 / 출연 요소 / 메시지 역할의 영상 지지도
  - 상품 등장 시점 평균·중앙값
  - 상품 노출 비중 평균·중앙값
  - 사용·시연 포함 영상 비율과 평균 비중
  - 주장 / 근거 분포
  - CTA 포함 비율과 시작 시점
  - 2~3단계 반복 제작 구조
  - 영상별 차이 표
- Evidence Rule Compiler
  - 비교 결과를 결정론적으로 제작 규칙 후보로 변환
  - support / counterexample / sample size 보존
  - low / medium / high confidence 산출
  - candidate / recurring / dominant 상태 분리
  - 표본 8개 미만은 high confidence 금지
  - 지지도 50% 미만 또는 지지 영상 2개 미만은 규칙 승격 금지
  - 규칙 반복성과 광고 성과의 인과관계를 명시적으로 분리
- Production Concept Compiler
  - 선택된 근거 규칙에서 제작안 A/B/C 생성
  - A: 반복 패턴 우선
  - B: 핵심 + 균형
  - C: 핵심 고정 실험
  - A/B/C 차이를 성과 예측 점수가 아니라 규칙 적용 강도로 정의
- Prompt Pack Compiler
  - 각 A/B/C 제작안마다 4종 실행 프롬프트 생성
  - 대본 프롬프트
  - 촬영 프롬프트
  - 소재 준비 프롬프트
  - 편집 프롬프트
  - 확인되지 않은 효능·수치·후기·전문가 추천의 임의 생성을 금지
- Creative Workflow
  - 비교 결과 → 근거 규칙 → 선택 규칙 → A/B/C → 프롬프트 팩을 하나의 결정론적 체인으로 연결

## 분석 원칙

MasterV의 원시 분석 단위는 `영상 타입`이 아니라 `observation_segments`입니다.

각 구간에서 실제로 보이는 화면, 행동, 소재와 메시지 역할을 기록하고, 전체 영상의 특성은 이후 코드에서 집계합니다. 제품을 먹거나 바르는 장면 자체를 효과 증명으로 취급하지 않으며, 광고의 주장과 실제로 관찰 가능한 결과를 분리합니다.

다중 비교도 AI에게 다시 자유형 비교를 요청하지 않습니다. 각 영상의 관찰 데이터와 파생 지표를 동일 계산식으로 집계해서 재현 가능한 비교 결과를 만듭니다.

Evidence Rule Compiler 역시 AI 생성기가 아닙니다. 선택된 참고영상에서 반복된 패턴을 코드로 규칙 후보로 변환하며, `8/10에서 반복됨`을 `성과를 만든 원인`으로 승격하지 않습니다. 각 규칙에는 지지 표본, 반례, 신뢰도와 주의사항을 함께 보존합니다.

제작안 A/B/C와 실행 프롬프트도 이 근거 체인을 따라 생성합니다. 차이는 레퍼런스 규칙을 얼마나 강하게 적용할지이며, 특정 안이 더 높은 성과를 낸다고 예측하지 않습니다.

현재 단계에서는 분석/비교/제작 로직을 먼저 끝까지 연결하고, 실제 상품과 레퍼런스를 넣어 사용해 본 뒤 정보 밀도·버튼 순서·용어·결과 표현 같은 UX 괴리를 수정합니다. UI 구조를 로직보다 먼저 고정하지 않습니다.

## 실행

Node.js 24 기준입니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
```

API 키는 서버 라우트에서만 사용하며 브라우저 코드로 전달하지 않습니다.

## 검증

```bash
npm run typecheck
npm run test:observation-contract
npm run test:derived-metrics
npm run test:reference-compare
npm run test:evidence-rules
npm run test:production-concepts
npm run test:prompt-packs
npm run build
```

실제 Gemini 호출은 별도 runtime smoke / real-product pilot workflow로 검증합니다.

## 다음 단계

1. 근거 규칙 선택 UI와 A/B/C / 프롬프트 팩을 실제 사용 플로우에 연결
2. 실제 상품 단위 사용성 테스트 후 UI/정보 밀도 조정
3. 비교함 영속 저장 / 보관함 구조
4. 이후 YouTube 자동 탐색 및 TikTok / Meta 수집 경로 확장
