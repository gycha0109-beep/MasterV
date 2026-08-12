import { GoogleGenAI } from "@google/genai";
import { videoAnalysisJsonSchema, type VideoAnalysis } from "@/lib/analysis-schema";
import { validateVideoAnalysis } from "@/lib/analysis-validation";

const ANALYSIS_PROMPT = `
당신은 숏폼 상품 영상 역설계 분석가다.
목표는 이 영상을 "무슨 타입의 영상"이라고 분류하는 것이 아니라, 제작자가 실제로 무엇을 어떤 순서로 조합했는지 관찰 가능한 단위로 기록하는 것이다.

공통 원칙:
- 영상에서 실제로 확인되는 내용만 기록한다.
- 보이지 않거나 들리지 않는 내용은 추측하지 않는다.
- 광고 성과나 전환율은 영상만 보고 추정하지 않는다.
- 빠른 장면 전환 때문에 확신할 수 없는 부분은 confidence_notes에 명시한다.
- 모든 설명은 한국어로 작성한다.

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
5. visual.description에는 실제 화면을 짧고 구체적으로 묘사한다.
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
8. presenter_presence에는 얼굴, 상반신, 전신, 손, 신체부위, 없음 등 실제 보이는 출연 형태를 기록한다.
9. action.type은 도포, 타건, 조리, 시식, 착용, 분사, 세척, 측정, 제품제시처럼 화면에서 실제 일어난 행동을 간결하게 적는다. 행동이 없으면 "정적제시"처럼 적는다.
10. message_roles는 훅, 제품소개, 문제제기, 사용시연, 기능설명, 결과제시, 비교, 큐레이팅, 후기, 가격/혜택, CTA 등 해당 구간이 영상에서 수행하는 역할을 복수로 적을 수 있다.
11. claims에는 발화나 자막이 사실이라고 주장하는 내용을 원문의 의미를 바꾸지 말고 기록한다. 주장 자체가 없으면 빈 배열로 둔다.
12. evidence는 주장과 분리한다.
   - 직접사용: 실제 사용/섭취/착용은 보이지만 성능이나 효과 자체가 입증된 것은 아님
   - 직접시연: 제품 기능이나 작동을 화면에서 직접 보여줌
   - 관찰가능한결과: 화면 전후나 연속 변화로 결과를 직접 볼 수 있음
   - 후기/경험진술: 출연자가 자신의 경험이라고 말함
   - 외부자료: 기사, 측정값, 경기 기록, 그래프 등 외부/보조 자료를 제시함
   - 상황재연: 효과나 경험을 연출로 표현함
   - 근거없음: 주장에 대응하는 화면상 근거가 없음
13. 제품을 먹는 장면, 바르는 장면, 착용하는 장면 자체를 효능/성능의 "관찰가능한결과"로 처리하지 않는다.
14. 잠든 연출, 행복해진 표정 같은 재연을 실제 효과가 확인된 결과로 처리하지 않는다.
15. evidence.observable_result에는 화면에서 결과로 직접 관찰 가능한 변화만 적는다. 없으면 빈 문자열이다.
16. evidence.result_visually_observable은 실제 결과 변화가 화면에서 확인될 때만 true다.
17. evidence.types는 항상 하나 이상 기록한다. 대응 근거가 없다면 "근거없음"을 사용한다.
18. 소재 출처나 빠른 화면에 확신이 없으면 confidence를 medium/low로 낮추고 추측 대신 불명확을 사용한다.
`;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  return new GoogleGenAI({ apiKey });
}

export async function analyzeYouTubeVideo(url: string): Promise<VideoAnalysis> {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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
  if (!raw) {
    throw new Error("Gemini가 분석 결과를 반환하지 않았습니다.");
  }

  const analysis = JSON.parse(raw) as VideoAnalysis;
  return validateVideoAnalysis(analysis);
}
