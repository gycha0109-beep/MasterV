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
  roles: string[],
  scenePurpose: string,
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
    action: { type: roles.includes("CTA") ? "CTA" : "행동", description: scenePurpose },
    scene_purpose: scenePurpose,
    message_roles: roles,
    spoken_text: "",
    on_screen_text: "",
    claims: roles.includes("기능설명") ? [scenePurpose] : [],
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
  summary: "문제 상황 뒤 제품 기능을 보여주는 영상",
  structure_label: "문제 → 시연 → CTA",
  duration_seconds: 12,
  hook: { type: "문제제기", text: "", visual: "", duration_seconds: 2 },
  product_presentation: {
    first_seen_seconds: 2,
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
    cta: "상세보기",
    emotional_trigger: ""
  },
  presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
  transcript: { full: "", segments: [] },
  scenes: [],
  observation_segments: [
    segment(0, 2, ["문제제기", "훅"], "기존 제품 사용 불편 제시", "일반예시", "비교/일반예시"),
    segment(2, 8, ["제품소개", "사용시연", "기능설명"], "특정 기능을 직접 시연"),
    segment(8, 12, ["CTA"], "구매 상세보기 안내")
  ],
  tags: [],
  confidence_notes: []
};

const metrics = deriveVideoMetrics(analysis);
const emptyGuide = compileSingleVideoProductionGuide(analysis, metrics);

assert(emptyGuide.direction_summary.length > 0, "production direction summary is required");
assert(emptyGuide.production_steps.some((step) => step.title === "CTA"), "CTA must remain visible without Product Truth");
assert(emptyGuide.reference_mechanisms.length >= 3, "reference mechanisms must be exposed for semantic interpretation");
assert(!emptyGuide.interpretation_required, "empty verified facts should not require semantic interpretation");
assert(!emptyGuide.interpretation_ready, "empty verified facts should not pretend semantic matching was performed");
assert(emptyGuide.asset_groups.length === 4, "default production UI should expose four asset groups");
assert(emptyGuide.prompts.script.includes("사용자가 입력한 원문"), "prompt must define raw Product Truth as authority");

const pendingGuide = compileSingleVideoProductionGuide(analysis, metrics, {
  product_name: "아무 상품",
  verified_facts: "개가벼움\n가방에 걍 쏙",
  target_customer: "몰?루",
  price_offer: ""
});
assert(pendingGuide.interpretation_required, "free-form facts should require semantic interpretation");
assert(!pendingGuide.interpretation_ready, "raw facts alone must not be auto-mapped by keyword heuristics");
assert(pendingGuide.critical_warnings.some((item) => item.includes("의미 해석 전")), "pending interpretation must be visible");
assert(pendingGuide.prompts.script.includes("의미 해석 전"), "downstream prompt must not claim adaptation is complete before interpretation");

const interpretation: ProductTruthInterpretation = {
  version: "v1",
  source_facts: ["개가벼움", "가방에 걍 쏙"],
  mechanism_matches: pendingGuide.reference_mechanisms.map((item) => ({
    mechanism_id: item.id,
    status: item.requires_product_fact ? "matched" : "matched",
    matched_facts: item.requires_product_fact ? ["가방에 걍 쏙"] : [],
    application_mode: item.requires_product_fact ? "direct_demo" : item.kind === "problem_hook" ? "support_only" : "information",
    confidence: "medium",
    rationale: "테스트용 의미 연결"
  }))
};

const readyGuide = compileSingleVideoProductionGuide(analysis, metrics, {
  product_name: "아무 상품",
  verified_facts: "개가벼움\n가방에 걍 쏙",
  target_customer: "몰?루",
  price_offer: "9,900원",
  interpretation
});
assert(readyGuide.interpretation_ready, "matching source facts should activate semantic interpretation");
assert(readyGuide.production_steps.some((step) => step.detail.includes("가방에 걍 쏙")), "semantic match must preserve exact raw fact wording");
assert(readyGuide.production_steps.some((step) => step.detail.includes("몰?루")), "arbitrary target text must remain literal user input");
assert(readyGuide.prompts.script.includes("Product Truth 의미 매칭 적용"), "ready prompt should state semantic matching was applied");
assert(readyGuide.prompts.script.includes("타깃 원문: 몰?루"), "prompt must preserve arbitrary target input exactly");
assert(readyGuide.prompts.script !== readyGuide.prompts.editing, "task prompts must remain distinct");

console.log("SINGLE_VIDEO_PRODUCTION_CONTRACT_PASS");
