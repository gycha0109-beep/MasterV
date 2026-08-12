import type { VideoAnalysis } from "../lib/analysis-schema";
import { validateVideoAnalysis } from "../lib/analysis-validation";

function makeAnalysis(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
  return {
    summary: "테스트",
    structure_label: "훅 → 제품 → 사용",
    duration_seconds: 10,
    hook: {
      type: "제품선공개",
      text: "",
      visual: "제품을 보여준다",
      duration_seconds: 1
    },
    product_presentation: {
      first_seen_seconds: 0,
      demonstration_present: true,
      before_after_present: false,
      comparison_present: false,
      result_visual_present: false,
      face_present: false,
      hand_present: true
    },
    persuasion: {
      problem: "",
      solution: "",
      benefit: "",
      proof: "",
      social_proof: "",
      offer: "",
      cta: "",
      emotional_trigger: ""
    },
    presentation: {
      format: "",
      presenter_type: "",
      caption_style: "",
      visual_style: "",
      music_role: ""
    },
    transcript: {
      full: "",
      segments: []
    },
    scenes: [],
    observation_segments: [
      {
        start_seconds: 0,
        end_seconds: 2,
        visual: {
          description: "손이 제품을 들어 보여준다",
          subjects: ["손", "제품"],
          material_types: ["직접촬영", "상품실물"],
          presenter_presence: ["손"]
        },
        action: {
          type: "제품제시",
          description: "손으로 제품을 카메라 앞에 보여준다"
        },
        message_roles: ["제품소개"],
        spoken_text: "",
        on_screen_text: "",
        claims: [],
        evidence: {
          types: ["직접사용"],
          observable_result: "",
          result_visually_observable: false
        },
        confidence: "high"
      }
    ],
    tags: [],
    confidence_notes: [],
    ...overrides
  };
}

function expectFailure(name: string, analysis: VideoAnalysis) {
  let failed = false;

  try {
    validateVideoAnalysis(analysis);
  } catch {
    failed = true;
  }

  if (!failed) {
    throw new Error(`${name}: 실패해야 하는 분석이 통과했습니다.`);
  }
}

validateVideoAnalysis(makeAnalysis());

expectFailure(
  "invalid-time-range",
  makeAnalysis({
    observation_segments: [
      {
        ...makeAnalysis().observation_segments[0],
        start_seconds: 2,
        end_seconds: 1
      }
    ]
  })
);

expectFailure(
  "observable-result-without-description",
  makeAnalysis({
    observation_segments: [
      {
        ...makeAnalysis().observation_segments[0],
        evidence: {
          types: ["관찰가능한결과"],
          observable_result: "",
          result_visually_observable: true
        }
      }
    ]
  })
);

console.log("OBSERVATION_CONTRACT_PASS");
