import { GoogleGenAI } from "@google/genai";
import { videoAnalysisJsonSchema, type VideoAnalysis } from "@/lib/analysis-schema";

const ANALYSIS_PROMPT = `
당신은 숏폼 상품 영상 분석가다.
이 영상의 내용을 감상평처럼 설명하지 말고, 광고/상품 영상 제작에 재사용할 수 있도록 구조화해서 분석하라.

원칙:
- 영상에서 실제로 확인되는 내용만 기록한다.
- 보이지 않거나 들리지 않는 내용은 추측하지 않는다.
- 광고 성과나 전환율은 영상만 보고 추정하지 않는다.
- 빠른 장면 전환 때문에 확신할 수 없는 부분은 confidence_notes에 명시한다.
- transcript는 가능한 범위에서 실제 발화에 충실하게 작성한다.
- scenes는 제작자가 다시 만들 수 있을 정도로 장면의 역할을 짧고 구체적으로 적는다.
- hook.type은 문제제기, 결과선공개, 호기심, 비교, 강한주장, 질문, 제품선공개, 기타 중 가장 가까운 표현을 사용한다.
- structure_label은 예: "문제 → 제품 → 사용 → 결과 → 전후 비교"처럼 한국어로 짧게 작성한다.
- 모든 설명은 한국어로 작성한다.
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

  return JSON.parse(raw) as VideoAnalysis;
}
