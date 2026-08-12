import type { ProductionConcept, ProductionConceptSet } from "@/lib/production-concepts";

export type PromptContext = {
  product_name?: string;
  platform?: string;
  target_duration_seconds?: number;
  audience?: string;
  objective?: string;
};

export type PromptPack = {
  concept_id: ProductionConcept["id"];
  concept_name: string;
  script_prompt: string;
  shooting_prompt: string;
  asset_prompt: string;
  editing_prompt: string;
  evidence_block: string;
};

export type PromptPackSet = {
  sample_size: number;
  packs: PromptPack[];
  notes: string[];
};

function contextLine(context: PromptContext) {
  const product = context.product_name?.trim() || "[상품명]";
  const platform = context.platform?.trim() || "세로형 숏폼";
  const duration = context.target_duration_seconds
    ? `${context.target_duration_seconds}초 내외`
    : "15~60초 범위";
  const audience = context.audience?.trim() || "[타깃 시청자]";
  const objective = context.objective?.trim() || "상품의 핵심 매력 전달과 다음 행동 유도";

  return `상품: ${product}\n플랫폼: ${platform}\n목표 길이: ${duration}\n타깃: ${audience}\n목표: ${objective}`;
}

function numbered(items: string[]) {
  if (items.length === 0) return "- 없음";
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function evidenceBlock(concept: ProductionConcept, sampleSize: number) {
  return `참고 표본: ${sampleSize}개\n전략: ${concept.strategy}\n\n반영 근거:\n${numbered(concept.evidence_summary)}\n\n주의:\n${numbered(concept.caveats)}`;
}

function commonGuardrails() {
  return [
    "참고영상의 문장, 자막, 장면을 그대로 복제하지 않는다.",
    "반복 패턴을 성과의 인과 원인이나 성공 보장으로 표현하지 않는다.",
    "확인되지 않은 효능, 수치, 후기, 전문가 추천, 가격, 할인 정보를 만들어내지 않는다.",
    "광고 문구의 주장과 화면에서 실제로 확인 가능한 결과를 구분한다.",
    "필요한 정보가 없으면 추측하지 말고 [확인 필요]로 표시한다."
  ];
}

function buildPack(
  concept: ProductionConcept,
  sampleSize: number,
  context: PromptContext
): PromptPack {
  const ctx = contextLine(context);
  const required = numbered(concept.required_instructions);
  const optional = numbered(concept.optional_instructions);
  const guardrails = numbered(commonGuardrails());
  const evidence = evidenceBlock(concept, sampleSize);

  const base = `당신은 상품 숏폼 제작자다. 아래 제작 콘셉트와 근거 규칙을 사용하되 레퍼런스를 복제하지 말고 새로운 결과물을 작성하라.\n\n${ctx}\n\n콘셉트 ${concept.id} — ${concept.name}\n${concept.strategy}\n\n필수 반영 규칙:\n${required}\n\n선택적으로 참고할 규칙:\n${optional}\n\n근거:\n${evidence}\n\n안전 규칙:\n${guardrails}`;

  return {
    concept_id: concept.id,
    concept_name: concept.name,
    evidence_block: evidence,
    script_prompt: `${base}\n\n[작업]\n시간대별 숏폼 대본을 작성한다. 각 구간마다 ① 시간 ② 화면 ③ 행동 ④ 내레이션/대사 ⑤ 화면 자막 ⑥ 구간 목적을 작성한다. 첫 3초와 CTA를 명확히 구분한다. 마지막에 전체 대본만 이어 붙인 버전도 제공한다.`,
    shooting_prompt: `${base}\n\n[작업]\n실제 촬영 가능한 쇼트 리스트를 작성한다. 각 쇼트마다 ① 예상 길이 ② 피사체 ③ 행동 ④ 구도/카메라 ⑤ 필요한 소품 ⑥ 반드시 화면에서 확인되어야 할 정보 ⑦ 대체 촬영안을 작성한다. 주장만 있고 실제로 증명할 수 없는 장면은 '연출/주장'으로 표시한다.`,
    asset_prompt: `${base}\n\n[작업]\n제작 전에 준비해야 할 소재 체크리스트를 만든다. 직접 촬영, 상품 실물, 상품 사진, 상품페이지 캡처, 공식 자료, 그래픽/표, 자막 데이터 등으로 구분한다. 각 소재가 어떤 규칙과 장면을 위해 필요한지도 연결한다. 저작권이나 출처 확인이 필요한 외부 소재는 별도 표시한다.`,
    editing_prompt: `${base}\n\n[작업]\n편집자용 지시서를 작성한다. ① 시간순 컷 구성 ② 첫 3초 처리 ③ 컷 전환 목적 ④ 자막 위치/밀도 ⑤ 제품 노출 타이밍 ⑥ 시연/결과 장면 유지 시간 ⑦ CTA 처리 ⑧ 사용하면 안 되는 과장 표현을 포함한다. 레퍼런스의 구체적 화면이나 문구를 복제하지 않는다.`
  };
}

export function compilePromptPacks(
  concepts: ProductionConceptSet,
  context: PromptContext = {}
): PromptPackSet {
  if (concepts.concepts.length !== 3) {
    throw new Error("프롬프트 팩 생성에는 A/B/C 제작안 3개가 필요합니다.");
  }

  return {
    sample_size: concepts.sample_size,
    packs: concepts.concepts.map((concept) => buildPack(concept, concepts.sample_size, context)),
    notes: [
      "프롬프트는 선택한 레퍼런스의 반복 근거를 전달하는 실행 템플릿이며 성공을 예측하지 않는다.",
      "상품 사실 정보는 별도 입력값이며, 비어 있는 경우 모델이 임의 생성하지 않도록 [확인 필요] 원칙을 포함한다."
    ]
  };
}
