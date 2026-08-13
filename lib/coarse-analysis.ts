import { GoogleGenAI } from "@google/genai";
import type { CoarseVideoAnalysis } from "@/lib/tiered-analysis";

export const COARSE_SCHEMA_VERSION = "coarse-v2";
export const COARSE_PROMPT_VERSION = "coarse-prompt-v1";

export const coarseAnalysisJsonSchema = {
  type: "object",
  properties: {
    videos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_id: { type: "string" },
          duration_seconds: { anyOf: [{ type: "number" }, { type: "null" }] },
          primary_delivery_mode: {
            type: "string",
            enum: ["demonstration", "curation", "buying_guide", "review", "problem_solution", "comparison", "vlog", "image_compilation", "mixed", "unknown"]
          },
          hook_type: { type: "string" },
          dominant_visual_source: { type: "string" },
          product_first_seen_seconds: { anyOf: [{ type: "number" }, { type: "null" }] },
          direct_demo_present: { type: "boolean" },
          cta_present: { type: "boolean" },
          multi_product: { type: "boolean" },
          rough_structure: { type: "array", items: { type: "string" } },
          risk_flags: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        },
        required: [
          "source_id", "duration_seconds", "primary_delivery_mode", "hook_type", "dominant_visual_source",
          "product_first_seen_seconds", "direct_demo_present", "cta_present", "multi_product",
          "rough_structure", "risk_flags", "confidence"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["videos"],
  additionalProperties: false
} as const;

export type CoarseInputVideo = {
  source_id: string;
  url: string;
};

const COARSE_PROMPT = `
당신은 상품 숏폼 참고영상의 빠른 구조 스캐너다.
이 단계의 목적은 정밀 분석이 아니라 여러 후보 영상을 비교하기 위한 큰 제작 구조만 추출하는 것이다.

반드시 지킬 것:
- 각 SOURCE는 서로 완전히 독립적인 영상이다.
- 다른 SOURCE의 장면, 기능, 시간, 제품 수, CTA를 절대 섞지 않는다.
- source_id는 입력에 제공된 문자열을 그대로 반환한다.
- full transcript, 세부 claim 목록, 1초 단위 장면 분석, 성능 사실 판정은 하지 않는다.
- 영상에서 명확히 확인되지 않으면 unknown / low confidence를 사용한다.
- 광고 성과나 전환율을 추정하지 않는다.

primary_delivery_mode 기준:
- demonstration: 직접 사용/작동/성능 시연이 중심
- curation: 여러 상품을 골라 소개하는 것이 중심
- buying_guide: 선택 기준/구매 기준 설명이 중심
- review: 한 상품에 대한 사용/평가 설명 중심
- problem_solution: 문제 제시 후 해결책 소개 중심
- comparison: 제품/대안 비교가 중심
- vlog: 생활 흐름 속 제품 사용이 중심
- image_compilation: 상품 사진/렌더/스크린샷 조합이 중심
- mixed: 두 가지 이상이 비슷한 비중으로 핵심
- unknown: 확신 불가

rough_structure는 3~7개의 짧은 한국어 단계로 작성한다.
risk_flags에는 빠른 컷, 외부자료 혼재, 다제품, 주장-근거 혼동 위험 등 coarse 단계에서 Deep 분석이 필요해 보이는 이유만 짧게 적는다.
`;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  return new GoogleGenAI({ apiKey });
}

export function validateCoarseInput(input: CoarseInputVideo[]) {
  if (input.length === 0) throw new Error("coarse 입력 영상이 없습니다.");
  if (input.length > 10) throw new Error("coarse bundle은 최대 10개 영상만 허용합니다.");

  const inputIds = input.map((item) => item.source_id);
  if (inputIds.some((id) => !id.trim())) throw new Error("coarse 입력 source_id가 비어 있습니다.");
  if (new Set(inputIds).size !== inputIds.length) throw new Error("coarse 입력 source_id가 중복되었습니다.");

  return input;
}

export function buildCoarseAnalysisJsonSchema(sourceIds: string[]) {
  if (sourceIds.length === 0) throw new Error("coarse schema에 source_id가 없습니다.");
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("coarse schema source_id가 중복되었습니다.");

  return {
    ...coarseAnalysisJsonSchema,
    properties: {
      ...coarseAnalysisJsonSchema.properties,
      videos: {
        ...coarseAnalysisJsonSchema.properties.videos,
        items: {
          ...coarseAnalysisJsonSchema.properties.videos.items,
          properties: {
            ...coarseAnalysisJsonSchema.properties.videos.items.properties,
            source_id: {
              type: "string",
              enum: [...sourceIds]
            }
          }
        }
      }
    }
  };
}

export function validateCoarseBundle(input: CoarseInputVideo[], output: CoarseVideoAnalysis[]) {
  validateCoarseInput(input);

  const inputIds = input.map((item) => item.source_id);
  const outputIds = output.map((item) => item.source_id);
  const expected = new Set(inputIds);

  if (new Set(outputIds).size !== outputIds.length) throw new Error("coarse 출력 source_id가 중복되었습니다.");
  if (output.length !== input.length) throw new Error(`coarse 출력 개수 불일치: input=${input.length}, output=${output.length}`);

  for (const id of outputIds) {
    if (!expected.has(id)) throw new Error(`coarse 출력에 알 수 없는 source_id가 있습니다: ${id}`);
  }
  for (const id of inputIds) {
    if (!outputIds.includes(id)) throw new Error(`coarse 출력에 source_id가 누락되었습니다: ${id}`);
  }

  return output;
}

export async function analyzeYouTubeCoarseBundle(videos: CoarseInputVideo[]): Promise<CoarseVideoAnalysis[]> {
  validateCoarseInput(videos);

  const ai = getClient();
  const model = process.env.GEMINI_COARSE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const input: Array<Record<string, unknown>> = [];
  const sourceIds = videos.map((video) => video.source_id);

  for (const video of videos) {
    input.push({ type: "text", text: `SOURCE_ID: ${video.source_id}` });
    input.push({ type: "video", uri: video.url });
  }
  input.push({ type: "text", text: COARSE_PROMPT });

  const interaction = await ai.interactions.create({
    model,
    input,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: buildCoarseAnalysisJsonSchema(sourceIds)
    }
  });

  const raw = interaction.output_text;
  if (!raw) throw new Error("Gemini가 coarse 분석 결과를 반환하지 않았습니다.");

  const parsed = JSON.parse(raw) as { videos?: CoarseVideoAnalysis[] };
  if (!Array.isArray(parsed.videos)) throw new Error("Gemini coarse 결과의 videos 배열이 없습니다.");
  return validateCoarseBundle(videos, parsed.videos);
}
