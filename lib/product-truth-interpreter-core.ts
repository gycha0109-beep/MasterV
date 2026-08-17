import { GoogleGenAI } from "@google/genai";
import {
  normalizeRawFacts,
  productTruthInterpretationJsonSchema,
  type ApplicationMode,
  type InterpretationConfidence,
  type MechanismMatchStatus,
  type MechanismSemanticMatch,
  type ProductTruthInterpretation,
  type ReferenceMechanismCandidate
} from "@/lib/product-truth-interpretation";

export type ProductTruthInterpreterInput = {
  verified_facts: string;
  reference_mechanisms: ReferenceMechanismCandidate[];
};

export type ProductTruthInterpreterRuntimeOptions = {
  api_key: string;
  model?: string;
};

export type ProductTruthInterpretationDetailedResult = {
  interpretation: ProductTruthInterpretation;
  sanitized: boolean;
  warnings: string[];
};

export const DEFAULT_PRODUCT_TRUTH_MODEL = "gemini-3.6-flash";

const INTERPRETATION_PROMPT = `
당신은 상품 숏폼 제작 도구의 Product Truth semantic matcher다.

목표:
사용자가 자유롭게 입력한 상품 사실 원문과, 참고영상에서 추출된 제작 메커니즘을 의미적으로 연결한다.

절대 원칙:
1. 사용자가 입력한 원문이 유일한 상품 사실 authority다.
2. 맞춤법, 은어, 축약어, 비문, 다른 언어가 있어도 의미를 해석할 수 있지만 사실을 더 강하게 만들면 안 된다.
3. matched_facts에는 반드시 제공된 source_facts의 문자열을 글자 그대로 복사한다. 새 사실, 정규화된 스펙, 수치, 인증, 효능을 만들지 않는다.
4. 예: "물 존나 잘튕김"을 water-related 의미로 이해할 수는 있지만 "IPX8", "완전 방수"로 바꾸면 안 된다.
5. 예: "가방에 걍 쏙"을 휴대/수납 관련 사실로 이해할 수는 있지만 크기 수치를 만들어내면 안 된다.
6. 의미 연결이 불확실하면 status="ambiguous", application_mode="not_applicable"로 둔다. 억지 매칭하지 않는다.
7. 관련 사실이 없으면 status="unmatched"로 둔다.
8. 동일한 raw fact가 여러 메커니즘과 실제로 관련될 수는 있다.
9. comparison 메커니즘은 단순 특징이 있다는 이유만으로 비교 성능을 만들지 않는다. 비교 가능한 수치/속성이라면 comparison_candidate로 둘 수 있지만 비교 대상의 사실은 별도 확인이 필요하다.
10. direct_demo는 사용자가 입력한 사실을 화면에서 직접 확인하거나 조작해 보여줄 수 있는 경우에만 쓴다.
11. information은 사실은 전달할 수 있지만 영상만으로 성능을 직접 입증하기 어려운 경우에 사용한다.
12. support_only는 문제 사례/B-roll/보조 자료처럼 설명을 돕는 용도다. 판매 제품 성능 증거로 승격하지 않는다.
13. source_facts 배열은 입력받은 원문 배열과 정확히 같은 순서/문자열로 반환한다.
14. reference_mechanisms의 모든 id에 대해 mechanism_matches를 정확히 하나씩 반환한다.
15. rationale은 짧은 한국어로 작성한다.
`;

const MATCH_STATUSES = new Set<MechanismMatchStatus>(["matched", "unmatched", "ambiguous"]);
const APPLICATION_MODES = new Set<ApplicationMode>(["direct_demo", "information", "comparison_candidate", "support_only", "not_applicable"]);
const CONFIDENCES = new Set<InterpretationConfidence>(["high", "medium", "low"]);

function structuralFallback(mechanism: ReferenceMechanismCandidate, rationale: string): MechanismSemanticMatch {
  if (mechanism.requires_product_fact) {
    return {
      mechanism_id: mechanism.id,
      status: "unmatched",
      matched_facts: [],
      application_mode: "not_applicable",
      confidence: "low",
      rationale
    };
  }

  return {
    mechanism_id: mechanism.id,
    status: "matched",
    matched_facts: [],
    application_mode: mechanism.kind === "support_example" ? "support_only" : "information",
    confidence: "low",
    rationale
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sanitizeMatch(
  raw: unknown,
  mechanism: ReferenceMechanismCandidate,
  allowedFacts: Set<string>,
  warnings: string[]
): MechanismSemanticMatch {
  const record = asRecord(raw);
  if (!record) {
    warnings.push(`invalid_match_downgraded:${mechanism.id}`);
    return structuralFallback(mechanism, "semantic matcher 결과 형식이 올바르지 않아 안전하게 제외했습니다.");
  }

  const status = typeof record.status === "string" && MATCH_STATUSES.has(record.status as MechanismMatchStatus)
    ? record.status as MechanismMatchStatus
    : "ambiguous";
  const confidence = typeof record.confidence === "string" && CONFIDENCES.has(record.confidence as InterpretationConfidence)
    ? record.confidence as InterpretationConfidence
    : "low";
  const applicationMode = typeof record.application_mode === "string" && APPLICATION_MODES.has(record.application_mode as ApplicationMode)
    ? record.application_mode as ApplicationMode
    : "not_applicable";
  const rationale = typeof record.rationale === "string" && record.rationale.trim()
    ? record.rationale.trim().slice(0, 500)
    : "semantic matcher 결과를 안전 규칙으로 정규화했습니다.";
  const rawFacts = Array.isArray(record.matched_facts)
    ? record.matched_facts.filter((item): item is string => typeof item === "string")
    : [];
  const validFacts = [...new Set(rawFacts.filter((fact) => allowedFacts.has(fact)))];

  if (validFacts.length !== rawFacts.length) warnings.push(`generated_fact_removed:${mechanism.id}`);

  if (status !== "matched") {
    if (rawFacts.length > 0) warnings.push(`nonmatched_fact_link_removed:${mechanism.id}`);
    return {
      mechanism_id: mechanism.id,
      status,
      matched_facts: [],
      application_mode: "not_applicable",
      confidence,
      rationale
    };
  }

  if (mechanism.requires_product_fact && validFacts.length === 0) {
    warnings.push(`matched_without_valid_fact_downgraded:${mechanism.id}`);
    return structuralFallback(mechanism, "연결 가능한 사용자 원문 사실이 없어 해당 메커니즘을 제외했습니다.");
  }

  const safeMode = applicationMode === "not_applicable"
    ? mechanism.kind === "support_example"
      ? "support_only"
      : mechanism.kind === "comparison"
        ? "comparison_candidate"
        : "information"
    : applicationMode;

  return {
    mechanism_id: mechanism.id,
    status: "matched",
    matched_facts: validFacts,
    application_mode: safeMode,
    confidence,
    rationale
  };
}

export function sanitizeProductTruthInterpretation(
  value: unknown,
  facts: string[],
  mechanisms: ReferenceMechanismCandidate[]
): ProductTruthInterpretationDetailedResult {
  const warnings: string[] = [];
  const record = asRecord(value);
  const expectedById = new Map(mechanisms.map((item) => [item.id, item]));
  const rawMatches = record && Array.isArray(record.mechanism_matches) ? record.mechanism_matches : [];
  const grouped = new Map<string, unknown[]>();

  if (!record || record.version !== "v1") warnings.push("version_replaced_with_canonical_v1");
  const rawSourceFacts = record && Array.isArray(record.source_facts)
    ? record.source_facts.filter((item): item is string => typeof item === "string")
    : [];
  if (rawSourceFacts.length !== facts.length || !facts.every((fact, index) => rawSourceFacts[index] === fact)) {
    warnings.push("source_facts_replaced_with_user_authority");
  }

  for (const rawMatch of rawMatches) {
    const matchRecord = asRecord(rawMatch);
    const mechanismId = matchRecord && typeof matchRecord.mechanism_id === "string" ? matchRecord.mechanism_id : "";
    if (!mechanismId || !expectedById.has(mechanismId)) {
      warnings.push("unknown_mechanism_ignored");
      continue;
    }
    const existing = grouped.get(mechanismId) ?? [];
    existing.push(rawMatch);
    grouped.set(mechanismId, existing);
  }

  const allowedFacts = new Set(facts);
  const mechanismMatches = mechanisms.map((mechanism) => {
    const candidates = grouped.get(mechanism.id) ?? [];
    if (candidates.length === 0) {
      warnings.push(`missing_mechanism_filled:${mechanism.id}`);
      return structuralFallback(mechanism, "semantic matcher 결과가 누락되어 안전한 기본 상태로 보완했습니다.");
    }
    if (candidates.length > 1) {
      warnings.push(`duplicate_mechanism_downgraded:${mechanism.id}`);
      return structuralFallback(mechanism, "semantic matcher 결과가 중복되어 안전하게 제외했습니다.");
    }
    return sanitizeMatch(candidates[0], mechanism, allowedFacts, warnings);
  });

  const uniqueWarnings = [...new Set(warnings)];
  return {
    interpretation: {
      version: "v1",
      source_facts: [...facts],
      mechanism_matches: mechanismMatches
    },
    sanitized: uniqueWarnings.length > 0,
    warnings: uniqueWarnings
  };
}

export async function interpretProductTruthAgainstReferenceDetailedWithKey(
  input: ProductTruthInterpreterInput,
  options: ProductTruthInterpreterRuntimeOptions
): Promise<ProductTruthInterpretationDetailedResult> {
  const facts = normalizeRawFacts(input.verified_facts);
  const mechanisms = input.reference_mechanisms.slice(0, 20);

  if (mechanisms.length === 0) {
    return {
      interpretation: { version: "v1", source_facts: facts, mechanism_matches: [] },
      sanitized: false,
      warnings: []
    };
  }

  if (facts.length === 0) {
    return {
      interpretation: {
        version: "v1",
        source_facts: [],
        mechanism_matches: mechanisms.map((item) => structuralFallback(item, item.requires_product_fact
          ? "사용자가 입력한 확인 사실이 없습니다."
          : "상품 사실 매칭이 필요하지 않은 구조 메커니즘입니다."))
      },
      sanitized: false,
      warnings: []
    };
  }

  const apiKey = options.api_key.trim();
  if (!apiKey) throw new Error("Product Truth interpreter API key is required.");
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model?.trim() || DEFAULT_PRODUCT_TRUTH_MODEL;
  const payload = JSON.stringify({
    source_facts: facts,
    reference_mechanisms: mechanisms
  }, null, 2);

  const interaction = await ai.interactions.create({
    model,
    input: [
      { type: "text", text: `${INTERPRETATION_PROMPT}\n\n입력 데이터:\n${payload}` }
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: productTruthInterpretationJsonSchema
    }
  });

  if (!interaction.output_text) throw new Error("Product Truth interpreter가 결과를 반환하지 않았습니다.");
  const parsed = JSON.parse(interaction.output_text) as unknown;
  return sanitizeProductTruthInterpretation(parsed, facts, mechanisms);
}

export async function interpretProductTruthAgainstReferenceWithKey(
  input: ProductTruthInterpreterInput,
  options: ProductTruthInterpreterRuntimeOptions
): Promise<ProductTruthInterpretation> {
  const result = await interpretProductTruthAgainstReferenceDetailedWithKey(input, options);
  return result.interpretation;
}
