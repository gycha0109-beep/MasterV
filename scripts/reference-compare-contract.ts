import type { ObservationSegment, VideoAnalysis } from "../lib/analysis-schema";
import { compareVideoAnalyses } from "../lib/reference-compare";

function makeAnalysis(
  id: string,
  options: {
    firstProduct?: number | null;
    demoPercentShape?: "high" | "low";
    firstRole?: string;
    secondRole?: string;
    material?: "직접촬영" | "상품사진" | "상품페이지";
    cta?: boolean;
  } = {}
): VideoAnalysis {
  const firstProduct = options.firstProduct ?? 1;
  const material = options.material ?? "직접촬영";
  const highDemo = options.demoPercentShape !== "low";
  const firstRole = options.firstRole ?? "훅";
  const secondRole = options.secondRole ?? "제품소개";
  const secondEnd = highDemo ? 7 : 4;

  const containsProductByEnd = (endSeconds: number) =>
    firstProduct !== null && endSeconds > firstProduct;

  const segments: ObservationSegment[] = [
    {
      start_seconds: 0,
      end_seconds: 2,
      visual: {
        description: `${id} 시작 화면`,
        subjects: ["제품"],
        material_types: [material],
        presenter_presence: ["손"],
        contains_product: containsProductByEnd(2)
      },
      action: { type: "제품제시", description: "제품을 보여준다" },
      message_roles: [firstRole],
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
      end_seconds: secondEnd,
      visual: {
        description: `${id} 제품 사용`,
        subjects: ["제품", "손"],
        material_types: [material],
        presenter_presence: ["손"],
        contains_product: containsProductByEnd(secondEnd)
      },
      action: { type: "사용", description: "제품을 사용한다" },
      message_roles: [secondRole, "사용시연"],
      spoken_text: "",
      on_screen_text: "",
      claims: ["제품 특징을 설명한다"],
      evidence: {
        types: ["직접시연"],
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "high"
    },
    {
      start_seconds: secondEnd,
      end_seconds: 10,
      visual: {
        description: `${id} 마무리`,
        subjects: ["제품"],
        material_types: [material],
        presenter_presence: ["손"],
        contains_product: containsProductByEnd(10)
      },
      action: { type: options.cta === false ? "마무리" : "링크안내", description: "마무리한다" },
      message_roles: [options.cta === false ? "요약" : "CTA"],
      spoken_text: "",
      on_screen_text: "",
      claims: [],
      evidence: {
        types: ["근거없음"],
        observable_result: "",
        result_visually_observable: false
      },
      confidence: "high"
    }
  ];

  return {
    summary: `${id} 테스트`,
    structure_label: `${firstRole} → ${secondRole} → CTA`,
    duration_seconds: 10,
    hook: { type: firstRole, text: "", visual: "", duration_seconds: 2 },
    product_presentation: {
      first_seen_seconds: firstProduct,
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
      cta: options.cta === false ? "" : "링크 확인",
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
    observation_segments: segments,
    tags: [],
    confidence_notes: []
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const comparison = compareVideoAnalyses([
  { id: "a", label: "A", analysis: makeAnalysis("a", { firstProduct: 1, material: "직접촬영" }) },
  { id: "b", label: "B", analysis: makeAnalysis("b", { firstProduct: 2, material: "직접촬영" }) },
  { id: "c", label: "C", analysis: makeAnalysis("c", { firstProduct: 5, material: "상품사진", demoPercentShape: "low", cta: false }) }
]);

assert(comparison.sample_size === 3, "sample size should be 3");
assert(comparison.product.known_first_seen_count === 3, "known product starts should be 3");
assert(comparison.product.within_three_seconds_count === 2, "two videos should show product within 3 seconds");
assert(comparison.first_three_seconds.product_visible_count === 2, "two first-three windows should contain product");
assert(comparison.demonstration.videos_with_use_or_demo_count === 3, "all videos should contain demo");
assert(comparison.cta.present_count === 2, "two videos should contain CTA");

const direct = comparison.materials.find((item) => item.name === "직접촬영");
assert(direct?.video_count === 2, "direct shooting should appear in two videos");
assert(direct?.video_percent === 66.7, "direct shooting support should be 66.7%");

const pattern = comparison.common_patterns.find(
  (item) => item.sequence.join(" → ") === "훅 → 제품소개"
);
assert(pattern?.support_count === 3, "hook to product-intro pattern should be supported by all videos");

let failed = false;
try {
  compareVideoAnalyses([{ id: "only", analysis: makeAnalysis("only") }]);
} catch {
  failed = true;
}
assert(failed, "single-video comparison must fail");

console.log("REFERENCE_COMPARE_CONTRACT_PASS");
