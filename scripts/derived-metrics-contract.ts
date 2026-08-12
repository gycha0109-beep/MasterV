import type { VideoAnalysis } from "../lib/analysis-schema";
import { deriveVideoMetrics } from "../lib/derived-metrics";

const analysis: VideoAnalysis = {
  summary: "테스트",
  structure_label: "훅 → 제품 → 사용 → 결과 → CTA",
  duration_seconds: 10,
  hook: {
    type: "제품선공개",
    text: "",
    visual: "제품",
    duration_seconds: 2
  },
  product_presentation: {
    first_seen_seconds: 0,
    demonstration_present: true,
    before_after_present: false,
    comparison_present: false,
    result_visual_present: true,
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
    cta: "링크 확인",
    emotional_trigger: ""
  },
  presentation: {
    format: "",
    presenter_type: "",
    caption_style: "",
    visual_style: "",
    music_role: ""
  },
  transcript: { full: "", segments: [] },
  scenes: [],
  observation_segments: [
    {
      start_seconds: 0,
      end_seconds: 2,
      visual: {
        description: "손으로 제품을 제시한다",
        subjects: ["손", "제품"],
        material_types: ["직접촬영", "상품실물"],
        presenter_presence: ["손"],
        contains_product: true
      },
      action: { type: "제품제시", description: "제품을 들어 보여준다" },
      message_roles: ["훅", "제품소개"],
      spoken_text: "",
      on_screen_text: "",
      claims: [],
      evidence: {
        types: ["근거없음"],
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "high"
    },
    {
      start_seconds: 2,
      end_seconds: 5,
      visual: {
        description: "손에 제품을 바른다",
        subjects: ["손", "제품"],
        material_types: ["직접촬영", "상품실물"],
        presenter_presence: ["손"],
        contains_product: true
      },
      action: { type: "도포", description: "제품을 손에 바른다" },
      message_roles: ["사용시연"],
      spoken_text: "",
      on_screen_text: "",
      claims: [],
      evidence: {
        types: ["직접사용"],
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "high"
    },
    {
      start_seconds: 5,
      end_seconds: 8,
      visual: {
        description: "작동 결과를 연속해서 보여준다",
        subjects: ["제품", "결과"],
        material_types: ["직접촬영", "상품실물"],
        presenter_presence: ["손"],
        contains_product: true
      },
      action: { type: "기능시연", description: "제품 작동과 결과를 보여준다" },
      message_roles: ["사용시연", "결과제시"],
      spoken_text: "",
      on_screen_text: "",
      claims: ["이 기능이 작동한다"],
      evidence: {
        types: ["직접시연", "관찰가능한결과"],
        observable_result: "작동 전후 변화가 화면에서 이어서 보인다",
        result_visually_observable: true
      },
      confidence: "high"
    },
    {
      start_seconds: 8,
      end_seconds: 10,
      visual: {
        description: "상품페이지와 링크 안내를 보여준다",
        subjects: ["상품페이지"],
        material_types: ["상품페이지"],
        presenter_presence: ["없음"],
        contains_product: true
      },
      action: { type: "링크안내", description: "구매 링크를 안내한다" },
      message_roles: ["CTA", "가격/혜택"],
      spoken_text: "",
      on_screen_text: "링크 확인",
      claims: ["지금 할인 중이다"],
      evidence: {
        types: ["근거없음"],
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "medium"
    }
  ],
  tags: [],
  confidence_notes: []
};

const metrics = deriveVideoMetrics(analysis);

function assertEqual(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${name}: expected=${expected} actual=${actual}`);
  }
}

assertEqual("basis-duration", metrics.basis_duration_seconds, 10);
assertEqual("coverage", metrics.analyzed_coverage_percent, 100);
assertEqual("product-first-seen", metrics.product.first_seen_seconds, 0);
assertEqual("product-visible", metrics.product.visible_percent, 100);
assertEqual("demo-segment-count", metrics.demonstration.combined_segment_count, 2);
assertEqual("demo-seconds", metrics.demonstration.combined_seconds, 6);
assertEqual("demo-percent", metrics.demonstration.combined_percent, 60);
assertEqual("direct-use-seconds", metrics.demonstration.direct_use_seconds, 3);
assertEqual("direct-demo-seconds", metrics.demonstration.direct_demo_seconds, 3);
assertEqual("visible-result-segments", metrics.demonstration.visually_observable_result_segment_count, 1);
assertEqual("claim-count", metrics.claims_and_evidence.claim_count, 2);
assertEqual("claim-segments-no-evidence", metrics.claims_and_evidence.claim_segments_with_no_evidence, 1);
assertEqual("cta-first-seen", metrics.cta.first_seen_seconds, 8);
assertEqual("cta-seconds", metrics.cta.seconds, 2);
assertEqual("first-three-product-visible", metrics.first_three_seconds.product_visible, true);

const firstThreeDirect = metrics.first_three_seconds.materials.find((item) => item.name === "직접촬영");
assertEqual("first-three-direct-seconds", firstThreeDirect?.seconds, 3);
assertEqual("first-three-direct-percent", firstThreeDirect?.percent, 100);

console.log("DERIVED_METRICS_CONTRACT_PASS");
