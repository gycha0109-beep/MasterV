import type { VideoAnalysis } from "../lib/analysis-schema";
import { deriveVideoMetrics } from "../lib/derived-metrics";
import { compileSingleVideoProductionGuide } from "../lib/single-video-production";

const analysis: VideoAnalysis = {
  summary: "문제 상황 뒤 판매 제품 기능을 직접 시연하는 영상",
  structure_label: "문제 → 제품 → 시연 → CTA",
  duration_seconds: 12,
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
      spoken_text: "",
      on_screen_text: "",
      claims: ["기존 제품은 불편할 수 있다"],
      evidence: {
        types: ["외부자료"],
        scope: "비교/일반예시",
        supports_selling_product_claim: false,
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "high"
    },
    {
      start_seconds: 2,
      end_seconds: 8,
      visual: {
        description: "손으로 판매 제품을 작동시켜 기능과 결과를 보여준다",
        subjects: ["판매 제품", "손"],
        material_types: ["직접촬영", "상품실물"],
        presenter_presence: ["손"],
        subject_role: "판매제품",
        contains_product: true
      },
      action: { type: "기능시연", description: "제품 기능을 직접 작동한다" },
      scene_purpose: "판매 제품 핵심 기능 직접 시연",
      message_roles: ["제품소개", "사용시연", "결과제시"],
      spoken_text: "",
      on_screen_text: "",
      claims: ["기능이 작동한다"],
      evidence: {
        types: ["직접시연", "관찰가능한결과"],
        scope: "판매제품직접",
        supports_selling_product_claim: true,
        observable_result: "제품 작동 결과가 화면에 보인다",
        result_visually_observable: true
      },
      confidence: "high"
    },
    {
      start_seconds: 8,
      end_seconds: 12,
      visual: {
        description: "상품과 링크 안내를 보여준다",
        subjects: ["판매 제품"],
        material_types: ["직접촬영", "상품실물"],
        presenter_presence: ["손"],
        subject_role: "판매제품",
        contains_product: true
      },
      action: { type: "CTA", description: "구매 행동을 유도한다" },
      scene_purpose: "구매 CTA",
      message_roles: ["CTA"],
      spoken_text: "",
      on_screen_text: "링크 확인",
      claims: [],
      evidence: {
        types: ["근거없음"],
        scope: "해당없음",
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

const metrics = deriveVideoMetrics(analysis);
const guide = compileSingleVideoProductionGuide(analysis, metrics);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(guide.direction_summary.length > 0, "production direction summary is required");
assert(guide.production_steps.length >= 3, "production flow should expose multiple steps");
assert(guide.production_steps.some((step) => step.title === "문제 제시"), "problem opening should be simplified into a readable step title");
assert(guide.production_steps.some((step) => step.title === "CTA"), "CTA should remain visible in the compact flow");
assert(guide.asset_groups.length === 4, "default production UI should expose exactly four asset groups");
assert(guide.asset_groups.some((group) => group.title === "제품 실물" && group.items.includes("판매할 상품 실물")), "selling product asset should be required");
assert(guide.asset_groups.some((group) => group.title === "비교·보조 자료" && group.items.length > 0), "comparison/support assets should remain available behind details");
assert(guide.asset_groups.some((group) => group.title === "상품 정보" && group.items.every((item) => !item.includes("기능이 작동한다"))), "reference claims must never be promoted into product information");
assert(guide.reference_claims.includes("기능이 작동한다"), "reference claims should be preserved in a separate unverified layer");
assert(guide.critical_warnings.some((item) => item.includes("일반 사례")), "comparison/example warning should be generated");
assert(!guide.critical_warnings.some((item) => item.includes("그대로 복사")), "global guardrails should not clutter the visible warning list");
assert(guide.prompts.script.includes("[작업: 대본]"), "script prompt must be task-specific");
assert(guide.prompts.shooting.includes("[작업: 촬영]"), "shooting prompt must be task-specific");
assert(guide.prompts.assets.includes("[작업: 소재 준비]"), "asset prompt must be task-specific");
assert(guide.prompts.editing.includes("[작업: 편집]"), "editing prompt must be task-specific");
assert(guide.prompts.script.includes("그대로 복사하지"), "hidden system guardrails must still be embedded in prompts");
assert(guide.prompts.script.includes("[참고영상 주장 — 상품 사실 아님]"), "prompt must explicitly separate reference claims from product truth");
assert(guide.prompts.script.includes("기능이 작동한다 [참고영상 주장 / 내 상품 적용 전 확인 필요]"), "reference claim must be labeled as unverified for the target product");
assert(guide.prompts.script.includes("[내 상품 정보]\n- 아직 입력되지 않음"), "missing target product truth must remain explicit");
assert(guide.raw_prompt.includes("대본, 촬영 구성, 준비 소재, 편집 지시"), "raw prompt should remain available as an advanced combined request");
assert(guide.prompts.script !== guide.prompts.editing, "prompt packs must not collapse into one identical prompt");

const demoSegment = analysis.observation_segments[1];
const ctaSegment = analysis.observation_segments[2];
const crowdedAnalysis: VideoAnalysis = {
  ...analysis,
  duration_seconds: 18,
  observation_segments: [
    ...Array.from({ length: 8 }, (_, index) => ({
      ...demoSegment,
      start_seconds: index * 2,
      end_seconds: index * 2 + 2,
      action: {
        type: `기능시연${index + 1}`,
        description: `기능 ${index + 1}을 직접 시연한다`
      },
      scene_purpose: `기능 ${index + 1} 설명`,
      claims: [`기능 주장 ${index + 1}`]
    })),
    {
      ...ctaSegment,
      start_seconds: 16,
      end_seconds: 18
    }
  ]
};

const crowdedGuide = compileSingleVideoProductionGuide(crowdedAnalysis, deriveVideoMetrics(crowdedAnalysis));
assert(crowdedGuide.production_steps.length === 9, "compact flow may expand by one slot to preserve a late CTA");
assert(crowdedGuide.production_steps.at(-1)?.title === "CTA", "late CTA must never be dropped by the compact step limit");

console.log("SINGLE_VIDEO_PRODUCTION_CONTRACT_PASS");
