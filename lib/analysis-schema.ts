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
  tags: string[];
  confidence_notes: string[];
};

const nullableNumber = { type: ["number", "null"] } as const;

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
    "tags",
    "confidence_notes"
  ]
} as const;
