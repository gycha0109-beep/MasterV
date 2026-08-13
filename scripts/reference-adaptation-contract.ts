import type { VideoAnalysis, ObservationSegment } from "../lib/analysis-schema";
import { deriveVideoMetrics } from "../lib/derived-metrics";
import { compileSingleVideoProductionGuide } from "../lib/single-video-production";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function segment(
  start: number,
  end: number,
  scenePurpose: string,
  actionType: string,
  actionDescription: string,
  roles: string[],
  claims: string[] = [],
  scope: ObservationSegment["evidence"]["scope"] = "판매제품직접",
  subjectRole: ObservationSegment["visual"]["subject_role"] = "판매제품"
): ObservationSegment {
  return {
    start_seconds: start,
    end_seconds: end,
    visual: {
      description: scenePurpose,
      subjects: [subjectRole === "판매제품" ? "판매 우산" : "일반 우산"],
      material_types: subjectRole === "판매제품" ? ["직접촬영", "상품실물"] : ["외부자료"],
      presenter_presence: ["손"],
      subject_role: subjectRole,
      contains_product: subjectRole === "판매제품"
    },
    action: { type: actionType, description: actionDescription },
    scene_purpose: scenePurpose,
    message_roles: roles,
    spoken_text: "",
    on_screen_text: "",
    claims,
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
  summary: "우산 기능을 여러 장면으로 직접 시연하는 상품 숏폼",
  structure_label: "문제 → 기능 시연 → CTA",
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
    problem: "기존 우산 불편",
    solution: "판매 우산",
    benefit: "",
    proof: "",
    social_proof: "",
    offer: "",
    cta: "상세보기",
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
    segment(0, 2, "기존 작은 우산 사용 불편 제시", "문제제시", "비 오는 날 바지가 젖는 문제를 보여준다", ["문제제기", "훅"], [], "비교/일반예시", "일반예시"),
    segment(2, 5, "완전 자동 개폐 기능 직접 시연", "자동개폐", "버튼으로 우산을 자동으로 펼치고 접는다", ["제품소개", "사용시연", "기능설명"], ["완전 자동 우산이다"]),
    segment(5, 8, "3중 유리섬유 살대 내구성 시연", "내구시연", "살대를 반대로 구부려 탄성을 보여준다", ["사용시연", "기능설명"], ["3중 유리섬유 살대다"]),
    segment(8, 12, "방수·발수 성능 직접 시연", "발수시연", "우산에 물을 뿌리고 털어낸다", ["사용시연", "기능설명", "결과제시"], ["방수 가능하다"]),
    segment(12, 15, "자외선 차단 기능 설명", "UV설명", "햇빛 B-roll과 자외선 차단 설명을 보여준다", ["기능설명"], ["자외선 차단 기능이 있다"], "연출/보조", "제품없음"),
    segment(15, 19, "버클형 고리 휴대성 시연", "휴대시연", "버클 고리를 가방에 체결한다", ["사용시연", "기능설명"], ["버클형 고리로 휴대할 수 있다"]),
    segment(19, 25, "구매 상세보기 CTA", "CTA", "상품 상세보기를 안내한다", ["CTA"], [])
  ],
  tags: [],
  confidence_notes: []
};

const metrics = deriveVideoMetrics(analysis);
const guide = compileSingleVideoProductionGuide(analysis, metrics, {
  product_name: "자동 단우산",
  verified_facts: "무게 200g\n방수 가능\n자외선 차단\n휴대용 주머니 있음",
  target_customer: "모르겠음",
  price_offer: "8900원 / 로켓배송"
});

const flow = guide.production_steps.map((step) => `${step.title} ${step.detail}`).join("\n");
const scriptPrompt = guide.prompts.script;

assert(guide.production_steps.some((step) => step.title === "방수·발수 시연"), "verified water fact should adapt into a water demonstration mechanism");
assert(guide.production_steps.some((step) => step.title === "UV 정보"), "verified UV fact should adapt into an informational mechanism");
assert(guide.production_steps.some((step) => step.title === "휴대성 시연"), "verified portability fact should adapt into a portability mechanism");
assert(guide.production_steps.some((step) => step.title === "CTA"), "CTA must survive target adaptation");
assert(!flow.includes("완전 자동"), "reference automation feature must not survive when Product Truth has no automation fact");
assert(!flow.includes("3중 유리섬유"), "reference durability material must not survive when Product Truth has no durability fact");
assert(!flow.includes("버클"), "reference-specific buckle feature must be replaced by the target product portability fact");
assert(flow.includes("휴대용 주머니 있음"), "target portability fact should replace the reference-specific portability implementation");
assert(guide.excluded_reference_mechanisms.some((item) => item.mechanism === "automation_demo"), "unmatched automation mechanism should be tracked as excluded");
assert(guide.excluded_reference_mechanisms.some((item) => item.mechanism === "durability_demo"), "unmatched durability mechanism should be tracked as excluded");
assert(scriptPrompt.includes("[추천 제작 흐름 — Product Truth 적용 완료]"), "final prompt must explicitly state that target adaptation has already been applied");
assert(scriptPrompt.includes("[내 상품에 없어 제외된 참고 메커니즘]"), "final prompt must expose exclusions so downstream AI cannot silently restore them");
assert(!scriptPrompt.includes("3중 유리섬유 살대로"), "final prompt must not reintroduce excluded reference durability claims as target-product instructions");
assert(!scriptPrompt.includes("버클형 고리로"), "final prompt must not reintroduce excluded reference portability implementation");
assert(scriptPrompt.includes("방수 가능"), "verified target-product fact must remain available in final prompt");
assert(scriptPrompt.includes("자외선 차단"), "verified target-product UV fact must remain available in final prompt");
assert(scriptPrompt.includes("휴대용 주머니 있음"), "verified target-product portability fact must remain available in final prompt");

console.log("REFERENCE_ADAPTATION_CONTRACT_PASS");
