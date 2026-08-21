import type { ObservationSegment, VideoAnalysis } from "../lib/analysis-schema";
import { deriveVideoMetrics } from "../lib/derived-metrics";
import { compileSingleVideoProductionGuide } from "../lib/single-video-production";
import type { ProductTruthInterpretation } from "../lib/product-truth-interpretation";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function segment(
  start: number,
  end: number,
  scenePurpose: string,
  actionType: string,
  roles: string[],
  subjectRole: ObservationSegment["visual"]["subject_role"] = "판매제품",
  scope: ObservationSegment["evidence"]["scope"] = "판매제품직접"
): ObservationSegment {
  return {
    start_seconds: start,
    end_seconds: end,
    visual: {
      description: scenePurpose,
      subjects: [subjectRole === "판매제품" ? "판매 제품" : "일반 사례"],
      material_types: subjectRole === "판매제품" ? ["직접촬영", "상품실물"] : ["외부자료"],
      presenter_presence: ["손"],
      subject_role: subjectRole,
      contains_product: subjectRole === "판매제품"
    },
    action: { type: actionType, description: scenePurpose },
    scene_purpose: scenePurpose,
    message_roles: roles,
    spoken_text: "",
    on_screen_text: "",
    claims: [],
    evidence: {
      types: scope === "판매제품직접" ? ["직접시연"] : ["외부자료"],
      scope,
      supports_selling_product_claim: scope === "판매제품직접",
      observable_result: "",
      result_visually_observable: false
    },
    confidence: "high"
  };
}

const analysis: VideoAnalysis = {
  summary: "문제 뒤 여러 기능을 보여주는 상품 숏폼",
  structure_label: "문제 → 시연 → CTA",
  duration_seconds: 25,
  hook: { type: "문제제기", text: "", visual: "", duration_seconds: 2 },
  product_presentation: {
    first_seen_seconds: 2,
    demonstration_present: true,
    before_after_present: false,
    comparison_present: true,
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
    cta: "상세보기",
    emotional_trigger: ""
  },
  presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
  transcript: { full: "", segments: [] },
  scenes: [],
  observation_segments: [
    segment(0, 2, "기존 제품 사용 불편 제시", "문제제시", ["문제제기", "훅"], "일반예시", "비교/일반예시"),
    segment(2, 5, "버튼으로 자동 개폐 기능 직접 시연", "자동개폐", ["제품소개", "사용시연", "기능설명"]),
    segment(5, 8, "살대를 크게 구부려 내구성 시연", "내구시연", ["사용시연", "기능설명"]),
    segment(8, 12, "원단에 물을 뿌려 발수 성능 시연", "발수시연", ["사용시연", "기능설명", "결과제시"]),
    segment(12, 15, "햇빛 B-roll로 자외선 차단 기능 설명", "UV설명", ["기능설명"], "제품없음", "연출/보조"),
    segment(15, 19, "가방에 제품을 연결해 휴대성 시연", "휴대시연", ["사용시연", "기능설명"]),
    segment(19, 25, "구매 상세보기 CTA", "CTA", ["CTA"])
  ],
  tags: [],
  confidence_notes: []
};

const metrics = deriveVideoMetrics(analysis);
const rawFacts = ["물 존나 잘튕김", "200그람", "가방에 걍 쏙"];
const interpretation: ProductTruthInterpretation = {
  version: "v1",
  source_facts: rawFacts,
  mechanism_matches: [
    { mechanism_id: "m1", status: "matched", matched_facts: [], application_mode: "support_only", confidence: "high", rationale: "구조 메커니즘" },
    { mechanism_id: "m2", status: "unmatched", matched_facts: [], application_mode: "not_applicable", confidence: "high", rationale: "자동 개폐 사실 없음" },
    { mechanism_id: "m3", status: "unmatched", matched_facts: [], application_mode: "not_applicable", confidence: "high", rationale: "내구 사실 없음" },
    { mechanism_id: "m4", status: "matched", matched_facts: ["물 존나 잘튕김"], application_mode: "direct_demo", confidence: "medium", rationale: "물 관련 사실을 직접 보여줄 수 있음" },
    { mechanism_id: "m5", status: "unmatched", matched_facts: [], application_mode: "not_applicable", confidence: "high", rationale: "자외선 관련 사실 없음" },
    { mechanism_id: "m6", status: "matched", matched_facts: ["200그람", "가방에 걍 쏙"], application_mode: "direct_demo", confidence: "medium", rationale: "휴대성을 직접 보여줄 수 있음" },
    { mechanism_id: "m7", status: "matched", matched_facts: [], application_mode: "information", confidence: "high", rationale: "구조 메커니즘" }
  ]
};

const guide = compileSingleVideoProductionGuide(analysis, metrics, {
  product_name: "자동 단우산",
  verified_facts: rawFacts.join("\n"),
  target_customer: "모르겠음",
  price_offer: "8900/로켓배송",
  interpretation
});

const flow = guide.production_steps.map((step) => `${step.title} ${step.detail}`).join("\n");
const prompt = guide.prompts.script;

assert(guide.interpretation_ready, "semantic interpretation should be accepted when source facts exactly match current raw facts");
assert(flow.includes("물 존나 잘튕김"), "free-form water wording must survive exactly as user authority");
assert(flow.includes("200그람"), "free-form weight wording must survive exactly as user authority");
assert(flow.includes("가방에 걍 쏙"), "free-form portability wording must survive exactly as user authority");
assert(flow.includes("모르겠음"), "target text must be preserved as user input rather than hard-coded to null");
assert(!flow.includes("자동 개폐"), "unmatched reference automation feature must not survive target adaptation");
assert(!flow.includes("내구성 시연"), "unmatched durability mechanism must not survive target adaptation");
assert(!flow.includes("자외선 차단"), "unmatched UV reference feature must not survive target adaptation");
assert(prompt.includes("상품명 원문: 자동 단우산"), "product name raw input must be preserved in prompt");
assert(prompt.includes("타깃 원문: 모르겠음"), "target raw input must be preserved in prompt");
assert(prompt.includes("물 존나 잘튕김"), "prompt must keep exact free-form Product Truth wording");
assert(!prompt.includes("IPX8"), "semantic interpretation must not strengthen user wording into invented certification/specs");
assert(guide.excluded_reference_mechanisms.length >= 3, "unmatched/unsupported reference mechanisms should be explicitly excluded");

const staleGuide = compileSingleVideoProductionGuide(analysis, metrics, {
  product_name: "자동 단우산",
  verified_facts: `${rawFacts.join("\n")}\n새로 추가한 아무 표현`,
  target_customer: "모르겠음",
  price_offer: "8900/로켓배송",
  interpretation
});
assert(!staleGuide.interpretation_ready, "editing raw facts must invalidate the previous semantic interpretation");
assert(staleGuide.critical_warnings.some((item) => item.includes("의미 해석 전")), "stale interpretation must surface a visible warning");

console.log("REFERENCE_ADAPTATION_CONTRACT_PASS");
