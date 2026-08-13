import { GoogleGenAI } from "@google/genai";
import {
  normalizeRawFacts,
  productTruthInterpretationJsonSchema,
  type ProductTruthInterpretation,
  type ReferenceMechanismCandidate
} from "@/lib/product-truth-interpretation";

export type ProductTruthInterpreterInput = {
  verified_facts: string;
  reference_mechanisms: ReferenceMechanismCandidate[];
};

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

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  return new GoogleGenAI({ apiKey });
}

function validateInterpretation(
  value: ProductTruthInterpretation,
  facts: string[],
  mechanisms: ReferenceMechanismCandidate[]
) {
  if (value.version !== "v1") throw new Error("Product Truth interpretation version이 올바르지 않습니다.");
  if (value.source_facts.length !== facts.length || !facts.every((fact, index) => value.source_facts[index] === fact)) {
    throw new Error("Product Truth interpreter가 사용자 원문을 변경했습니다.");
  }

  const allowedFacts = new Set(facts);
  const expectedIds = new Set(mechanisms.map((item) => item.id));
  const seen = new Set<string>();

  for (const match of value.mechanism_matches) {
    if (!expectedIds.has(match.mechanism_id)) throw new Error("알 수 없는 reference mechanism match가 반환되었습니다.");
    if (seen.has(match.mechanism_id)) throw new Error("reference mechanism match가 중복되었습니다.");
    seen.add(match.mechanism_id);
    if (match.matched_facts.some((fact) => !allowedFacts.has(fact))) {
      throw new Error("Product Truth interpreter가 사용자 입력에 없는 사실을 생성했습니다.");
    }
    if (match.status !== "matched" && match.matched_facts.length > 0) {
      throw new Error("unmatched/ambiguous match에 상품 사실이 연결되었습니다.");
    }
  }

  if (seen.size !== expectedIds.size || [...expectedIds].some((id) => !seen.has(id))) {
    throw new Error("일부 reference mechanism interpretation이 누락되었습니다.");
  }

  return value;
}

export async function interpretProductTruthAgainstReference(
  input: ProductTruthInterpreterInput
): Promise<ProductTruthInterpretation> {
  const facts = normalizeRawFacts(input.verified_facts);
  const mechanisms = input.reference_mechanisms.slice(0, 20);

  if (mechanisms.length === 0) {
    return { version: "v1", source_facts: facts, mechanism_matches: [] };
  }

  if (facts.length === 0) {
    return {
      version: "v1",
      source_facts: [],
      mechanism_matches: mechanisms.map((item) => ({
        mechanism_id: item.id,
        status: item.requires_product_fact ? "unmatched" : "matched",
        matched_facts: [],
        application_mode: item.requires_product_fact ? "not_applicable" : item.kind === "support_example" ? "support_only" : "information",
        confidence: "high",
        rationale: item.requires_product_fact ? "사용자가 입력한 확인 사실이 없습니다." : "상품 사실 매칭이 필요하지 않은 구조 메커니즘입니다."
      }))
    };
  }

  const ai = getClient();
  const model = process.env.GEMINI_PRODUCT_TRUTH_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";
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
  const parsed = JSON.parse(interaction.output_text) as ProductTruthInterpretation;
  return validateInterpretation(parsed, facts, mechanisms);
}
