import type { VideoAnalysis } from "../lib/analysis-schema";
import { validateVideoAnalysis } from "../lib/analysis-validation";
import { deriveVideoMetrics } from "../lib/derived-metrics";

const umbrellaRegression: VideoAnalysis = {
  summary: "우산 영상 대상 귀속 회귀 테스트",
  structure_label: "내구성 설명 → 일반 우산 문제 사례 → 제품 발수 시연 → UV 설명 B-roll",
  duration_seconds: 18,
  hook: { type: "문제제기", text: "", visual: "", duration_seconds: 1 },
  product_presentation: {
    first_seen_seconds: 0,
    demonstration_present: true,
    before_after_present: false,
    comparison_present: true,
    result_visual_present: true,
    face_present: false,
    hand_present: true
  },
  persuasion: {
    problem: "일반 우산의 취약성",
    solution: "판매 우산의 기능",
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
  transcript: { full: "", segments: [] },
  scenes: [],
  observation_segments: [
    {
      start_seconds: 12,
      end_seconds: 13.2,
      visual: {
        description: "일반 투명 비닐우산이 강풍에 뒤집히는 별도 영상",
        subjects: ["투명 비닐우산", "강풍"],
        material_types: ["외부자료"],
        presenter_presence: ["없음"],
        subject_role: "일반예시",
        contains_product: false
      },
      action: { type: "문제사례제시", description: "일반 우산이 강풍에 뒤집힌다" },
      scene_purpose: "일반 우산의 강풍 취약 사례를 보여 판매제품 내구성 설명과 대비",
      message_roles: ["문제제기", "비교", "기능설명"],
      spoken_text: "",
      on_screen_text: "",
      claims: ["일반적인 우산은 강풍에 취약할 수 있다"],
      evidence: {
        types: ["외부자료", "관찰가능한결과"],
        scope: "비교/일반예시",
        supports_selling_product_claim: false,
        observable_result: "일반 투명 우산이 바람에 뒤집히는 모습이 보인다",
        result_visually_observable: true
      },
      confidence: "high"
    },
    {
      start_seconds: 13.2,
      end_seconds: 15.5,
      visual: {
        description: "판매 우산 표면에 물을 붓고 물방울이 튕겨 나가는 장면",
        subjects: ["판매 우산", "물"],
        material_types: ["직접촬영", "상품실물"],
        presenter_presence: ["손"],
        subject_role: "판매제품",
        contains_product: true
      },
      action: { type: "발수시연", description: "우산 표면에 물을 부어 발수 상태를 보여준다" },
      scene_purpose: "판매 제품의 발수 기능 직접 시연",
      message_roles: ["사용시연", "기능설명", "결과제시"],
      spoken_text: "",
      on_screen_text: "",
      claims: ["발수 기능이 있다"],
      evidence: {
        types: ["직접시연", "관찰가능한결과"],
        scope: "판매제품직접",
        supports_selling_product_claim: true,
        observable_result: "물방울이 원단에 흡수되지 않고 튕겨 나가는 모습이 보인다",
        result_visually_observable: true
      },
      confidence: "high"
    },
    {
      start_seconds: 16.4,
      end_seconds: 17.9,
      visual: {
        description: "밝은 햇빛이 비치는 나무와 하늘 풍경",
        subjects: ["햇빛", "나무", "하늘"],
        material_types: ["불명확"],
        presenter_presence: ["없음"],
        subject_role: "제품없음",
        contains_product: false
      },
      action: { type: "풍경제시", description: "햇빛 풍경 B-roll을 보여준다" },
      scene_purpose: "자외선 차단 기능 설명 보조",
      message_roles: ["기능설명"],
      spoken_text: "",
      on_screen_text: "UV 차단효과 / UPF50+ 인증 / 자외선차단 코팅",
      claims: ["자외선 차단 기능이 있다"],
      evidence: {
        types: ["근거없음"],
        scope: "연출/보조",
        supports_selling_product_claim: false,
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "high"
    }
  ],
  tags: [],
  confidence_notes: []
};

validateVideoAnalysis(umbrellaRegression);
const metrics = deriveVideoMetrics(umbrellaRegression);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const generalUmbrella = umbrellaRegression.observation_segments[0];
const uvBroll = umbrellaRegression.observation_segments[2];

assert(generalUmbrella.visual.subject_role === "일반예시", "wind clip must be a general example");
assert(generalUmbrella.visual.contains_product === false, "wind clip must not count as the selling product");
assert(generalUmbrella.evidence.supports_selling_product_claim === false, "wind clip must not prove selling-product durability");
assert(uvBroll.scene_purpose.includes("자외선 차단"), "sunlight B-roll must retain UV explanation intent");
assert(uvBroll.evidence.scope === "연출/보조", "sunlight B-roll must stay contextual");
assert(uvBroll.evidence.supports_selling_product_claim === false, "sunlight B-roll must not prove UV performance");
assert(metrics.demonstration.visually_observable_result_segment_count === 1, "only the selling-product result should count as product-visible evidence");
assert(metrics.demonstration.contextual_or_comparison_result_segment_count === 1, "general umbrella result should be tracked separately");
assert(metrics.product.visible_seconds === 2.3, "general/example and B-roll footage must not inflate product visibility");

console.log("SUBJECT_ATTRIBUTION_CONTRACT_PASS");