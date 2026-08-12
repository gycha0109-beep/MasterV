# MasterV

상품별 숏폼 참고영상을 수집·분석하고, 반복되는 구성과 근거를 바탕으로 제작 명세와 AI 실행용 프롬프트를 생성하는 내부 도구입니다.

## 현재 구현 범위

첫 번째 세로 슬라이스는 `공개 YouTube 영상 1개 분석`입니다.

- YouTube URL 입력
- Gemini 영상 분석
- 고정 JSON 스키마로 결과 구조화
- 첫 장면 / 제품 첫 등장 / 직접 시연 / 전후 비교 표시
- 설득 구조와 태그 표시
- 초 단위 장면표
- 전체 대본
- 분석 결과를 바탕으로 실행용 프롬프트 생성 및 복사

다음 단계에서는 여러 참고영상 저장·비교, 반복 근거 집계, 제작안 A/B/C 및 근거 기반 프롬프트 생성을 추가합니다.

## 실행

Node.js 24 기준입니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 Gemini API 키를 넣습니다.

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
```

API 키는 서버 라우트에서만 사용하며 브라우저 코드로 전달하지 않습니다.

## 기술 기준

- Next.js App Router
- React
- TypeScript
- Google GenAI SDK
- Gemini Interactions API
- Gemini Structured Output

## 전체 목표

1. 참고영상 발견 및 저장
2. 영상별 구조화 분석
3. 여러 영상의 반복 특징과 성과 신호 비교
4. 새 숏폼 제작안 생성
5. 대본·장면표·필요 소재·편집 지시 생성
6. ChatGPT/Gemini 등에 바로 붙여 넣을 실행용 프롬프트 생성
