import type { ObservationSegment, VideoAnalysis } from "../lib/analysis-schema";
import { deriveVideoMetrics } from "../lib/derived-metrics";
import { compileSingleVideoProductionGuide } from "../lib/single-video-production";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function segment(overrides: Partial<ObservationSegment> & Pick<ObservationSegment, "start_seconds" | "end_seconds">): ObservationSegment {
  return {
    start_seconds: overrides.start_seconds,
    end_seconds: overrides.end_seconds,
    visual: overrides.visual ?? {
      description: "판매 제품을 손으로 보여준다",
      subjects: ["판매 제품", "손"],
      material_types: ["직접촬영", "상품실물"],
      presenter_presence: ["손"],
      subject_role: "판매제품",
      contains_product: true
    },
    action: overrides.action ?? { type: "제품제시", description: "제품을 보여준다" },
    scene_purpose: overrides.scene_purpose ?? "제품 소개",
    message_roles: overrides.message_roles ?? ["제품소개"],
    spoken_text: overrides.spoken_text ?? "",
    on_screen_text: overrides.on_screen_text ?? "",
    claims: overrides.claims ?? [],
    evidence: overrides.evidence ?? {
      types: ["근거없음"],
      scope: "해당없음",
      supports_selling_product_claim: false,
      observable_result: "",
      result_visually_observable: false
    },
    confidence: overrides.confidence ?? "high"
  };
}

function analysisFrom(segments: ObservationSegment[], duration = 12): VideoAnalysis {
  return {
    summary: "문제 상황 뒤 판매 제품 기능을 직접 시연하는 영상",
    structure_label: "문제 → 제품 → 시연 → CTA",
    duration_seconds: duration,
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
      problem: "일반 제품의 불편",
      solution: "판매 제품 기능",
      benefit: "",
      proof: "",
      social_proof: "",
      offer: "",
      cta: "구매 링크",
      emotional_trigger: ""
    },
    presentation: { format: "", presenter_type: "", caption_style: "", visual_style: "", music_role: "" },
    transcript: { full: "", segments: [] },
    scenes: [],
    observation_segments: segments,
    tags: [],
    confidence_notes: []
  };
}

const problem = segment({
  start_seconds: 0,
  end_seconds: 2,
  visual: {
    description: "일반 제품이 불편하게 사용되는 장면",
    subjects: ["일반 제품"],
    material_types: ["외부자료"],
    presenter_presence: ["손"],
    subject_role: "일반예시",
    contains_product: false
  },
  action: { type: "문제사례제시", description: "일반적인 불편을 보여준다" },
  scene_purpose: "기존 제품의 불편함 제시",
  message_roles: ["문제제기", "훅"],
  claims: ["기존 제품은 불편할 수 있다"],
  evidence: {
    types: ["외부자료"],
    scope: "비교/일반예시",
    supports_selling_product_claim: false,
    observable_result: "",
    result_visually_observable: false
  }
});

const demo = segment({
  start_seconds: 2,
  end_seconds: 8,
  action: { type: "기능시연", description: "원터치 기능을 직접 작동한다" },
  scene_purpose: "원터치 자동 개폐 기능 직접 시연",
  message_roles: ["제품소개", "사용시연", "결과제시"],
  claims: ["버튼으로 자동 개폐된다"],
  evidence: {
    types: ["직접시연", "관찰가능한결과"],
    scope: "판매제품직접",
    supports_selling_product_claim: true,
    observable_result: "작동 결과가 보인다",
    result_visually_observable: true
  }
});

const cta = segment({
  start_seconds: 8,
  end_seconds: 12,
  action: { type: "CTA", description: "구매 행동을 유도한다" },
  scene_purpose: "구매 CTA",
  message_roles: ["CTA"]
});

const analysis = analysisFrom([problem, demo, cta]);
const metrics = deriveVideoMetrics(analysis);
const pendingGuide = compileSingleVideoProductionGuide(analysis, metrics);

assert(pendingGuide.direction_summary.length > 0, "production direction summary is required");
assert(pendingGuide.production_steps.some((step) => step.title === "CTA"), "CTA must remain visible");
assert(pendingGuide.production_steps.some((step) => step.mechanism === "automation_demo"), "reference feature should be abstracted into an automation mechanism while Product Truth is empty");
assert(pendingGuide.production_steps.find((step) => step.mechanism === "automation_demo")?.detail.includes("확인되면"), "missing Product Truth should keep feature mechanisms conditional");
assert(pendingGuide.asset_groups.length === 4, "default production UI should expose four asset groups");
assert(pendingGuide.reference_claims.includes("버튼으로 자동 개폐된다"), "reference claims should remain preserved for traceability");
assert(!pendingGuide.prompts.script.includes("버튼으로 자동 개폐된다"), "raw reference claims must not contaminate downstream task prompts");
assert(pendingGuide.prompts.script.includes("[참고영상 주장 처리]"), "prompt must explain that reference claims are isolated");
assert(pendingGuide.prompts.script.includes("그대로 복사하지"), "hidden guardrails must remain embedded");
assert(pendingGuide.prompts.script.includes("[내 상품 정보 — 사용자 입력 Product Truth]\n- 아직 입력되지 않음"), "missing Product Truth must remain explicit");
assert(pendingGuide.prompts.script !== pendingGuide.prompts.editing, "task prompts must remain distinct");

const productGuide = compileSingleVideoProductionGuide(analysis, metrics, {
  product_name: "초경량 자동 우산",
  verified_facts: "원터치 자동 개폐\n실측 무게 310g",
  target_customer: "출퇴근 직장인",
  price_offer: "29,900원 / 무료배송"
});
const productTruthBlock = productGuide.prompts.script
  .split("[내 상품 정보 — 사용자 입력 Product Truth]")[1]
  ?.split("[참고영상 주장 처리]")[0] ?? "";
assert(productTruthBlock.includes("상품명: 초경량 자동 우산"), "user product name must reach Product Truth");
assert(productTruthBlock.includes("원터치 자동 개폐"), "verified matching fact must reach Product Truth");
assert(productTruthBlock.includes("실측 무게 310g"), "verified facts must remain line-separated");
assert(productTruthBlock.includes("출퇴근 직장인"), "target input must reach Product Truth");
assert(productTruthBlock.includes("29,900원 / 무료배송"), "price/offer input must reach Product Truth");
assert(productGuide.production_steps.some((step) => step.mechanism === "automation_demo" && step.detail.includes("원터치 자동 개폐")), "matching Product Truth should activate the reference mechanism with the target fact");
assert(!productGuide.prompts.script.includes("버튼으로 자동 개폐된다"), "reference claim wording must stay out of the task prompt after adaptation");

const externalComparison = segment({
  start_seconds: 6,
  end_seconds: 8,
  visual: {
    description: "강풍에 일반 우산이 뒤집히는 외부 자료",
    subjects: ["일반 우산"],
    material_types: ["외부자료"],
    presenter_presence: ["없음"],
    subject_role: "외부자료대상",
    contains_product: false
  },
  action: { type: "비교사례", description: "일반 우산이 강풍에 뒤집힌다" },
  scene_purpose: "일반 우산 강풍 실패 사례",
  message_roles: ["문제제기", "비교"],
  evidence: {
    types: ["외부자료", "관찰가능한결과"],
    scope: "외부자료",
    supports_selling_product_claim: false,
    observable_result: "일반 우산이 뒤집힘",
    result_visually_observable: true
  }
});
const comparisonAnalysis = analysisFrom([demo, externalComparison, cta]);
const comparisonGuide = compileSingleVideoProductionGuide(comparisonAnalysis, deriveVideoMetrics(comparisonAnalysis));
assert(comparisonGuide.production_steps.some((step) => step.mechanism === "durability_example" && step.title === "비교 사례"), "external general-product failure should be treated as comparison evidence, not selling-product durability");

const crowdedAnalysis = analysisFrom([
  ...Array.from({ length: 8 }, (_, index) => segment({
    start_seconds: index * 2,
    end_seconds: index * 2 + 2,
    action: { type: `기능시연${index + 1}`, description: `기능 ${index + 1}을 직접 시연한다` },
    scene_purpose: `기능 ${index + 1} 설명`,
    message_roles: ["사용시연"],
    claims: [`기능 주장 ${index + 1}`]
  })),
  segment({ start_seconds: 16, end_seconds: 18, action: { type: "CTA", description: "구매 행동을 유도한다" }, scene_purpose: "구매 CTA", message_roles: ["CTA"] })
], 18);
const crowdedGuide = compileSingleVideoProductionGuide(crowdedAnalysis, deriveVideoMetrics(crowdedAnalysis));
assert(crowdedGuide.production_steps.length === 9, "compact flow may expand by one slot to preserve a late CTA");
assert(crowdedGuide.production_steps.at(-1)?.title === "CTA", "late CTA must never be dropped");

console.log("SINGLE_VIDEO_PRODUCTION_CONTRACT_PASS");
