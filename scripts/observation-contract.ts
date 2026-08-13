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
          description: "손이 판매 제품을 들어 보여준다",
          subjects: ["손", "제품"],
          material_types: ["직접촬영", "상품실물"],
          presenter_presence: ["손"],
          subject_role: "판매제품",
          contains_product: true
        },
        action: {
          type: "제품제시",
          description: "손으로 제품을 카메라 앞에 보여준다"
        },
        scene_purpose: "판매 제품 소개",
        message_roles: ["제품소개"],
        spoken_text: "",
        on_screen_text: "",
        claims: [],
        evidence: {
          types: ["직접사용"],
          scope: "판매제품직접",
          supports_selling_product_claim: false,
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
          scope: "판매제품직접",
          supports_selling_product_claim: true,
          observable_result: "",
          result_visually_observable: true
        }
      }
    ]
  })
);

expectFailure(
  "overlapping-segments",
  makeAnalysis({
    observation_segments: [
      makeAnalysis().observation_segments[0],
      {
        ...makeAnalysis().observation_segments[0],
        start_seconds: 1.5,
        end_seconds: 3
      }
    ]
  })
);

expectFailure(
  "general-example-marked-as-selling-product",
  makeAnalysis({
    observation_segments: [
      {
        ...makeAnalysis().observation_segments[0],
        visual: {
          ...makeAnalysis().observation_segments[0].visual,
          description: "일반 투명 우산이 강풍에 뒤집힌다",
          subject_role: "일반예시",
          contains_product: true
        }
      }
    ]
  })
);

expectFailure(
  "context-broll-promoted-to-product-proof",
  makeAnalysis({
    observation_segments: [
      {
        ...makeAnalysis().observation_segments[0],
        visual: {
          ...makeAnalysis().observation_segments[0].visual,
          description: "햇빛이 비치는 나무와 하늘",
          subjects: ["햇빛", "나무", "하늘"],
          material_types: ["불명확"],
          presenter_presence: ["없음"],
          subject_role: "제품없음",
          contains_product: false
        },
        scene_purpose: "자외선 차단 기능 설명 보조",
        evidence: {
          types: ["근거없음"],
          scope: "연출/보조",
          supports_selling_product_claim: true,
          observable_result: "",
          result_visually_observable: false
        }
      }
    ]
  })
);

console.log("OBSERVATION_CONTRACT_PASS");