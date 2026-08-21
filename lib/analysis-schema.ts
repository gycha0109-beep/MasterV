export type TranscriptSegment = {
  start_seconds: number;
  end_seconds: number;
  text: string;
};

export type SceneAnalysis = {
  start_seconds: number;
  end_seconds: number;
  visual: string;
  spoken_text: string;
  on_screen_text: string;
  purpose: string;
};

export type ObservationMaterialType =
  | "직접촬영"
  | "상품실물"
  | "상품사진"
  | "상품페이지"
  | "공식홍보자료"
  | "외부자료"
  | "그래픽/표"
  | "화면녹화"
  | "상황재연"
  | "불명확";

export type ObservationSubjectRole =
  | "판매제품"
  | "비교제품"
  | "일반예시"
  | "외부자료대상"
  | "제품없음"
  | "식별불가";

export type EvidenceType =
  | "직접사용"
  | "직접시연"
  | "관찰가능한결과"
  | "후기/경험진술"
  | "외부자료"
  | "상황재연"
  | "근거없음";

export type EvidenceScope =
  | "판매제품직접"
  | "비교/일반예시"
  | "연출/보조"
  | "외부자료"
  | "주장만"
  | "해당없음";

export type ObservationSegment = {
  start_seconds: number;
  end_seconds: number;
  visual: {
    description: string;
    subjects: string[];
    material_types: ObservationMaterialType[];
    presenter_presence: string[];
    subject_role: ObservationSubjectRole;
    contains_product: boolean;
  };
  action: {
    type: string;
    description: string;
  };
  scene_purpose: string;
  message_roles: string[];
  spoken_text: string;
  on_screen_text: string;
  claims: string[];
  evidence: {
    types: EvidenceType[];
    scope: EvidenceScope;
    supports_selling_product_claim: boolean;
    observable_result: string;
    result_visually_observable: boolean;
  };
  confidence: "high" | "medium" | "low";
};

export type VideoAnalysis = {
  summary: string;
  structure_label: string;
  duration_seconds: number | null;
  hook: {
    type: string;
    text: string;
    visual: string;
    duration_seconds: number | null;
  };
  product_presentation: {
    first_seen_seconds: number | null;
    demonstration_present: boolean;
    before_after_present: boolean;
    comparison_present: boolean;
    result_visual_present: boolean;
    face_present: boolean;
    hand_present: boolean;
  };
  persuasion: {
    problem: string;
    solution: string;
    benefit: string;
    proof: string;
    social_proof: string;
    offer: string;
    cta: string;
    emotional_trigger: string;
  };
  presentation: {
    format: string;
    presenter_type: string;
    caption_style: string;
    visual_style: string;
    music_role: string;
  };
  transcript: {
    full: string;
    segments: TranscriptSegment[];
  };
  scenes: SceneAnalysis[];
  observation_segments: ObservationSegment[];
  tags: string[];
  confidence_notes: string[];
};

const nullableNumber = { type: ["number", "null"] } as const;

const materialTypeSchema = {
  type: "string",
  enum: [
    "직접촬영",
    "상품실물",
    "상품사진",
    "상품페이지",
    "공식홍보자료",
    "외부자료",
    "그래픽/표",
    "화면녹화",
    "상황재연",
    "불명확"
  ]
} as const;

const subjectRoleSchema = {
  type: "string",
  enum: ["판매제품", "비교제품", "일반예시", "외부자료대상", "제품없음", "식별불가"]
} as const;

const evidenceTypeSchema = {
  type: "string",
  enum: [
    "직접사용",
    "직접시연",
    "관찰가능한결과",
    "후기/경험진술",
    "외부자료",
    "상황재연",
    "근거없음"
  ]
} as const;

const evidenceScopeSchema = {
  type: "string",
  enum: ["판매제품직접", "비교/일반예시", "연출/보조", "외부자료", "주장만", "해당없음"]
} as const;

export const videoAnalysisJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    structure_label: { type: "string" },
    duration_seconds: nullableNumber,
    hook: {
      type: "object",
      properties: {
        type: { type: "string" },
        text: { type: "string" },
        visual: { type: "string" },
        duration_seconds: nullableNumber
      },
      required: ["type", "text", "visual", "duration_seconds"]
    },
    product_presentation: {
      type: "object",
      properties: {
        first_seen_seconds: nullableNumber,
        demonstration_present: { type: "boolean" },
        before_after_present: { type: "boolean" },
        comparison_present: { type: "boolean" },
        result_visual_present: { type: "boolean" },
        face_present: { type: "boolean" },
        hand_present: { type: "boolean" }
      },
      required: [
        "first_seen_seconds",
        "demonstration_present",
        "before_after_present",
        "comparison_present",
        "result_visual_present",
        "face_present",
        "hand_present"
      ]
    },
    persuasion: {
      type: "object",
      properties: {
        problem: { type: "string" },
        solution: { type: "string" },
        benefit: { type: "string" },
        proof: { type: "string" },
        social_proof: { type: "string" },
        offer: { type: "string" },
        cta: { type: "string" },
        emotional_trigger: { type: "string" }
      },
      required: ["problem", "solution", "benefit", "proof", "social_proof", "offer", "cta", "emotional_trigger"]
    },
    presentation: {
      type: "object",
      properties: {
        format: { type: "string" },
        presenter_type: { type: "string" },
        caption_style: { type: "string" },
        visual_style: { type: "string" },
        music_role: { type: "string" }
      },
      required: ["format", "presenter_type", "caption_style", "visual_style", "music_role"]
    },
    transcript: {
      type: "object",
      properties: {
        full: { type: "string" },
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start_seconds: { type: "number" },
              end_seconds: { type: "number" },
              text: { type: "string" }
            },
            required: ["start_seconds", "end_seconds", "text"]
          }
        }
      },
      required: ["full", "segments"]
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start_seconds: { type: "number" },
          end_seconds: { type: "number" },
          visual: { type: "string" },
          spoken_text: { type: "string" },
          on_screen_text: { type: "string" },
          purpose: { type: "string" }
        },
        required: ["start_seconds", "end_seconds", "visual", "spoken_text", "on_screen_text", "purpose"]
      }
    },
    observation_segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start_seconds: { type: "number" },
          end_seconds: { type: "number" },
          visual: {
            type: "object",
            properties: {
              description: { type: "string" },
              subjects: { type: "array", items: { type: "string" } },
              material_types: { type: "array", items: materialTypeSchema },
              presenter_presence: { type: "array", items: { type: "string" } },
              subject_role: subjectRoleSchema,
              contains_product: { type: "boolean" }
            },
            required: [
              "description",
              "subjects",
              "material_types",
              "presenter_presence",
              "subject_role",
              "contains_product"
            ]
          },
          action: {
            type: "object",
            properties: {
              type: { type: "string" },
              description: { type: "string" }
            },
            required: ["type", "description"]
          },
          scene_purpose: { type: "string" },
          message_roles: { type: "array", items: { type: "string" } },
          spoken_text: { type: "string" },
          on_screen_text: { type: "string" },
          claims: { type: "array", items: { type: "string" } },
          evidence: {
            type: "object",
            properties: {
              types: { type: "array", items: evidenceTypeSchema },
              scope: evidenceScopeSchema,
              supports_selling_product_claim: { type: "boolean" },
              observable_result: { type: "string" },
              result_visually_observable: { type: "boolean" }
            },
            required: [
              "types",
              "scope",
              "supports_selling_product_claim",
              "observable_result",
              "result_visually_observable"
            ]
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"]
          }
        },
        required: [
          "start_seconds",
          "end_seconds",
          "visual",
          "action",
          "scene_purpose",
          "message_roles",
          "spoken_text",
          "on_screen_text",
          "claims",
          "evidence",
          "confidence"
        ]
      }
    },
    tags: { type: "array", items: { type: "string" } },
    confidence_notes: { type: "array", items: { type: "string" } }
  },
  required: [
    "summary",
    "structure_label",
    "duration_seconds",
    "hook",
    "product_presentation",
    "persuasion",
    "presentation",
    "transcript",
    "scenes",
    "observation_segments",
    "tags",
    "confidence_notes"
  ]
} as const;