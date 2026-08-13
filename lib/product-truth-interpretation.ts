export type InterpretationConfidence = "high" | "medium" | "low";
export type MechanismMatchStatus = "matched" | "unmatched" | "ambiguous";
export type ApplicationMode = "direct_demo" | "information" | "comparison_candidate" | "support_only" | "not_applicable";

export type ReferenceMechanismCandidate = {
  id: string;
  kind:
    | "problem_hook"
    | "product_intro"
    | "comparison"
    | "demonstration"
    | "result"
    | "information"
    | "price_offer"
    | "cta"
    | "support_example";
  title: string;
  description: string;
  requires_product_fact: boolean;
};

export type MechanismSemanticMatch = {
  mechanism_id: string;
  status: MechanismMatchStatus;
  matched_facts: string[];
  application_mode: ApplicationMode;
  confidence: InterpretationConfidence;
  rationale: string;
};

export type ProductTruthInterpretation = {
  version: "v1";
  source_facts: string[];
  mechanism_matches: MechanismSemanticMatch[];
};

export function normalizeRawFacts(value: string) {
  return [...new Set(
    value
      .split(/\r?\n/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  )].slice(0, 20);
}

export function interpretationMatchesFacts(
  interpretation: ProductTruthInterpretation | undefined,
  verifiedFacts: string
) {
  if (!interpretation) return false;
  const current = normalizeRawFacts(verifiedFacts);
  if (current.length !== interpretation.source_facts.length) return false;
  return current.every((fact, index) => fact === interpretation.source_facts[index]);
}

export const productTruthInterpretationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "source_facts", "mechanism_matches"],
  properties: {
    version: { type: "string", enum: ["v1"] },
    source_facts: {
      type: "array",
      items: { type: "string" }
    },
    mechanism_matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["mechanism_id", "status", "matched_facts", "application_mode", "confidence", "rationale"],
        properties: {
          mechanism_id: { type: "string" },
          status: { type: "string", enum: ["matched", "unmatched", "ambiguous"] },
          matched_facts: { type: "array", items: { type: "string" } },
          application_mode: {
            type: "string",
            enum: ["direct_demo", "information", "comparison_candidate", "support_only", "not_applicable"]
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" }
        }
      }
    }
  }
} as const;
