import { GoogleGenAI } from "@google/genai";
import { videoAnalysisJsonSchema, type VideoAnalysis } from "@/lib/analysis-schema";
import { validateVideoAnalysis } from "@/lib/analysis-validation";

export const DEFAULT_DEEP_GEMINI_MODEL = "gemini-3.6-flash";

export const ANALYSIS_PROMPT = `
당신은 숏폼 상품 영상 역설계 분석가다.
목표는 이 영상을 "무슨 타입의 영상"이라고 분류하는 것이 아니라, 제작자가 실제로 무엇을 어떤 순서로 조합했는지 관찰 가능한 단위로 기록하는 것이다.

공통 원칙:
- 영상에서 실제로 확인되는 내용만 기록한다.
- 보이지 않거나 들리지 않는 내용은 추측하지 않는다.
- 광고 성과나 전환율은 영상만 보고 추정하지 않는다.
- 빠른 장면 전환 때문에 확신할 수 없는 부분은 confidence_notes에 명시한다.
- 모든 설명은 한국어로 작성한다.
- 특히 "화면에 보이는 대상", "그 대상이 판매 제품인지", "그 장면을 넣은 목적", "그 장면이 판매 제품의 성능을 실제로 입증하는지"를 서로 다른 판단으로 처리한다.

기존 요약 필드:
- transcript는 가능한 범위에서 실제 발화에 충실하게 작성한다.
- scenes는 편집 컷 수가 아니라 의미 단락이다. 문제 제기, 제품 소개, 사용, 결과, CTA처럼 내용 흐름을 요약한다.
- hook.type은 문제제기, 결과선공개, 호기심, 비교, 강한주장, 질문, 제품선공개, 기타 중 가장 가까운 표현을 사용한다.
- structure_label은 예: "문제 → 제품 → 사용 → 결과 → 전후 비교"처럼 한국어로 짧게 작성한다.

observation_segments 규칙:
1. observation_segments는 이 분석의 핵심 원시 관찰 데이터다.
2. 화면의 주요 소재, 행동, 메시지 역할 중 하나라도 의미 있게 바뀌면 새 구간으로 나눈다.
3. 단순히 카메라 각도만 바뀌고 같은 소재와 행동이 계속되면 하나의 구간으로 묶어도 된다.
4. observation_segments를 "큐레이팅형", "시연형" 같은 전체 영상 타입으로 대체하지 않는다.
5. visual.description에는 실제 화면을 짧고 구체적으로 묘사한다. 화면에서 보이지 않는 의미를 description에 섞지 않는다.
6. visual.subjects에는 실제로 보이는 핵심 대상을 적는다. 예: 얼굴, 손, 선크림, 손등, 완성 음식, 키보드, 스마트폰 측정 화면.
7. visual.material_types는 다음 표준값만 사용한다.
   - 직접촬영: 실제 상황/사람/제품을 촬영한 영상
   - 상품실물: 제품 패키지나 실물을 보여주는 장면
   - 상품사진: 정지된 제품 사진이나 렌더 이미지
   - 상품페이지: 쇼핑몰/쿠팡/상세페이지 캡처
   - 공식홍보자료: 브랜드가 만든 것으로 보이는 제품 홍보 이미지/영상. 확실하지 않으면 불명확 사용
   - 외부자료: 기사, 경기 영상, 타인의 자료화면 등
   - 그래픽/표: 비교표, 도식, 자체 제작 그래픽
   - 화면녹화: 앱이나 웹 화면을 실제로 조작/녹화한 장면
   - 상황재연: 주장이나 경험을 표현하기 위한 연출 장면
   - 불명확: 출처/성격을 화면만으로 확신할 수 없음
   한 구간에 여러 값이 동시에 해당하면 모두 기록한다.
8. visual.presenter_presence에는 얼굴, 상반신, 전신, 손, 신체부위, 없음 등 실제 보이는 출연 형태를 기록한다.
9. visual.subject_role은 화면에서 핵심적으로 다루는 대상이 광고의 무엇인지 구분한다.
   - 판매제품: 현재 판매/추천하는 바로 그 제품
   - 비교제품: 명시적으로 비교하는 경쟁/다른 제품
   - 일반예시: 일반적인 문제 사례나 범용 제품 예시
   - 외부자료대상: 외부 영상/기사/경기 등에서 가져온 다른 대상
   - 제품없음: 판매 제품이나 비교 제품 없이 풍경/상황/B-roll만 보임
   - 식별불가: 화면만으로 어느 대상인지 확신할 수 없음
   화면에 같은 종류의 물건이 나온다는 이유만으로 판매제품으로 간주하지 않는다.
10. visual.contains_product는 판매/추천 대상 제품이나 그 제품의 명확한 이미지가 화면에 보일 때만 true다. 비교제품, 일반예시, 외부자료의 유사 제품은 false다.
11. action.type은 도포, 타건, 조리, 시식, 착용, 분사, 세척, 측정, 제품제시처럼 화면에서 실제 일어난 행동을 간결하게 적는다. 행동이 없으면 "정적제시"처럼 적는다.
12. scene_purpose에는 "왜 이 장면을 넣었는지"를 문맥상 짧게 적는다. 예: 기존 우산의 문제 사례 제시, 자외선 차단 기능 설명 보조, 제품 발수 기능 직접 시연. 화면 자체의 묘사와 목적을 섞지 않는다.
13. message_roles는 훅, 제품소개, 문제제기, 사용시연, 기능설명, 결과제시, 비교, 큐레이팅, 후기, 가격/혜택, CTA 등 해당 구간이 영상에서 수행하는 역할을 복수로 적을 수 있다.
14. claims에는 발화나 자막이 사실이라고 주장하는 내용을 원문의 의미를 바꾸지 말고 기록한다. 주장 자체가 없으면 빈 배열로 둔다.
15. evidence는 주장과 분리한다.
   - 직접사용: 실제 사용/섭취/착용은 보이지만 성능이나 효과 자체가 입증된 것은 아님
   - 직접시연: 제품 기능이나 작동을 화면에서 직접 보여줌
   - 관찰가능한결과: 화면 전후나 연속 변화로 결과를 직접 볼 수 있음
   - 후기/경험진술: 출연자가 자신의 경험이라고 말함
   - 외부자료: 기사, 측정값, 경기 기록, 그래프 등 외부/보조 자료를 제시함
   - 상황재연: 효과나 경험을 연출로 표현함
   - 근거없음: 주장에 대응하는 화면상 근거가 없음
16. evidence.scope는 그 근거가 무엇에 적용되는지 구분한다.
   - 판매제품직접: 판매제품 자체를 직접 사용/시연/관찰
   - 비교/일반예시: 비교제품이나 일반적인 문제 사례를 보여줌
   - 연출/보조: 풍경, 이미지, 상황극 등 주장을 설명하기 위한 연출/B-roll
   - 외부자료: 인증, 기사, 측정값 등 외부 자료
   - 주장만: 발화/자막 주장만 있고 대응 화면 근거 없음
   - 해당없음: 해당 구간에 성능/효과 근거 판단 자체가 필요 없음
17. evidence.supports_selling_product_claim은 그 장면/자료가 판매제품의 해당 주장에 실제로 직접 적용되는 근거일 때만 true다. 비교제품/일반예시, 분위기 B-roll, 상황재연, 유사 제품 영상은 false다.
18. 제품을 먹는 장면, 바르는 장면, 착용하는 장면 자체를 효능/성능의 "관찰가능한결과"로 처리하지 않는다.
19. 잠든 연출, 행복해진 표정, 햇빛 풍경 같은 B-roll을 실제 효과가 확인된 결과로 처리하지 않는다.
20. evidence.observable_result에는 화면에서 결과로 직접 관찰 가능한 변화만 적는다. 없으면 빈 문자열이다.
21. evidence.result_visually_observable은 어떤 대상이든 실제 결과 변화가 화면에서 확인될 때만 true다. 단, 판매제품 결과로 집계되려면 supports_selling_product_claim도 true여야 한다.
22. evidence.types는 항상 하나 이상 기록한다. 대응 근거가 없다면 "근거없음"을 사용한다.
23. 소재 출처나 빠른 화면에 확신이 없으면 confidence를 medium/low로 낮추고 추측 대신 불명확/식별불가를 사용한다.

대상 귀속 예시:
- 일반 투명 우산이 강풍에 뒤집히는 별도 장면: visual.subject_role="일반예시", contains_product=false, scene_purpose="일반 우산의 강풍 취약 사례를 보여 판매제품 내구성 설명과 대비", evidence.scope="비교/일반예시", supports_selling_product_claim=false. 일반 우산이 뒤집히는 변화 자체는 보이므로 result_visually_observable=true일 수 있지만 판매제품 성능 입증으로 취급하면 안 된다.
- 햇빛이 비치는 나무/하늘 B-roll 위에 UV 차단 설명이 나오는 장면: visual.subject_role="제품없음", contains_product=false, scene_purpose="자외선 차단 기능 설명 보조", evidence.scope="연출/보조", supports_selling_product_claim=false, result_visually_observable=false. 햇빛 풍경 자체는 제품의 UV 차단 성능 증거가 아니다.
- 판매제품에 물을 붓고 실제로 물방울이 맺히지 않거나 튕겨 나가는 장면: visual.subject_role="판매제품", contains_product=true, scene_purpose="발수 기능 직접 시연", evidence.scope="판매제품직접". 화면에서 제품 표면의 결과가 직접 확인되면 supports_selling_product_claim=true 및 result_visually_observable=true로 둘 수 있다.
`;

export type GeminiDeepAnalyzerOptions = {
  api_key: string;
  model?: string;
};

export async function analyzeYouTubeVideoWithKey(
  url: string,
  options: GeminiDeepAnalyzerOptions
): Promise<VideoAnalysis> {
  const apiKey = options.api_key.trim();
  if (!apiKey) throw new Error("Gemini API key is required");
  const model = options.model?.trim() || DEFAULT_DEEP_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const interaction = await ai.interactions.create({
    model,
    input: [
      {
        type: "video",
        uri: url
      },
      {
        type: "text",
        text: ANALYSIS_PROMPT
      }
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: videoAnalysisJsonSchema
    }
  });

  const raw = interaction.output_text;
  if (!raw) throw new Error("Gemini가 분석 결과를 반환하지 않았습니다.");

  const analysis = JSON.parse(raw) as VideoAnalysis;
  return validateVideoAnalysis(analysis);
}
