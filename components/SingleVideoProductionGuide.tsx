"use client";

import { useState } from "react";
import type { GeminiRateLimitDiagnostic } from "@/lib/gemini-error";
import type { ProductTruthInterpretation } from "@/lib/product-truth-interpretation";
import type {
  ProductTruthInput,
  SingleVideoProductionGuide as Guide,
  SingleVideoPromptKind
} from "@/lib/single-video-production";

type Props = {
  guide: Guide;
  onProductTruthChange: (next: ProductTruthInput) => void;
};

type InterpretationApiResponse = {
  interpretation?: ProductTruthInterpretation;
  error?: string;
  code?: string;
  rate_limit?: GeminiRateLimitDiagnostic | null;
};

const promptActions: Array<{
  kind: SingleVideoPromptKind;
  label: string;
  icon: string;
}> = [
  { kind: "script", label: "대본 만들기", icon: "✍" },
  { kind: "shooting", label: "촬영 계획", icon: "🎥" },
  { kind: "assets", label: "소재 목록", icon: "📦" },
  { kind: "editing", label: "편집 지시", icon: "✂" }
];

function interpretationErrorMessage(data: InterpretationApiResponse, status: number) {
  if (status === 429 || data.code === "GEMINI_RATE_LIMIT") {
    return data.error || "Gemini 요청 한도에 도달했습니다. 제한 정보를 확인해주세요.";
  }
  return data.error || "상품 정보 의미 해석에 실패했습니다.";
}

export function SingleVideoProductionGuide({ guide, onProductTruthChange }: Props) {
  const [copiedKind, setCopiedKind] = useState<SingleVideoPromptKind | "raw" | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretationError, setInterpretationError] = useState("");

  const promptBlocked = guide.interpretation_required && !guide.interpretation_ready;
  const hasAnyProductInput = Boolean(
    guide.product_truth.product_name.trim() ||
    guide.product_truth.verified_facts.trim() ||
    guide.product_truth.target_customer.trim() ||
    guide.product_truth.price_offer.trim()
  );

  async function copy(text: string, kind: SingleVideoPromptKind | "raw") {
    if (promptBlocked) return;
    await navigator.clipboard.writeText(text);
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 1400);
  }

  function updateProductTruth<K extends keyof Omit<ProductTruthInput, "interpretation">>(
    key: K,
    value: ProductTruthInput[K]
  ) {
    const next: ProductTruthInput = { ...guide.product_truth, [key]: value };
    if (key === "verified_facts") next.interpretation = undefined;
    setInterpretationError("");
    onProductTruthChange(next);
  }

  async function applyProductTruth() {
    if (!guide.interpretation_required || interpreting) return;
    setInterpreting(true);
    setInterpretationError("");

    try {
      const response = await fetch("/api/interpret-product-truth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verified_facts: guide.product_truth.verified_facts,
          reference_mechanisms: guide.reference_mechanisms
        })
      });
      const data = (await response.json()) as InterpretationApiResponse;
      if (!response.ok || !data.interpretation) {
        setInterpretationError(interpretationErrorMessage(data, response.status));
        return;
      }

      onProductTruthChange({
        ...guide.product_truth,
        interpretation: data.interpretation
      });
    } catch (error) {
      setInterpretationError(error instanceof Error ? error.message : "상품 정보 의미 해석에 실패했습니다.");
    } finally {
      setInterpreting(false);
    }
  }

  const visibleWarnings = warningsOpen ? guide.critical_warnings : guide.critical_warnings.slice(0, 2);
  const statusLabel = interpreting
    ? "의미 해석 중"
    : guide.interpretation_ready
      ? "의미 매칭 완료"
      : guide.interpretation_required
        ? "의미 해석 필요"
        : hasAnyProductInput
          ? "기본 정보 입력됨"
          : "아직 입력 전";

  return (
    <section className="production-guide compact-production-guide" id="single-video-production-guide">
      <header className="production-guide-heading compact-production-heading">
        <span className="section-kicker">제작 가이드</span>
        <h3>이 영상을 참고해 만들려면</h3>
        <p className="production-direction">{guide.direction_summary}</p>
      </header>

      <article className="production-flow-section">
        <div className="compact-section-heading">
          <div>
            <span className="guide-label">추천 제작 흐름</span>
            <strong>{promptBlocked ? "상품 정보 의미 해석 전의 조건부 흐름입니다." : "이 순서만 먼저 보세요."}</strong>
          </div>
        </div>
        <div className="production-step-list">
          {guide.production_steps.map((step, index) => (
            <div className="production-step-row" key={`${step.mechanism}-${index}`}>
              <span className="production-step-number">{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="asset-summary-section">
        <div className="compact-section-heading inline-heading">
          <div>
            <span className="guide-label">준비할 것</span>
            <strong>필요한 준비물은 네 종류로 묶었습니다.</strong>
          </div>
          <button className="text-toggle" onClick={() => setAssetsOpen((value) => !value)}>
            {assetsOpen ? "체크리스트 접기" : "세부 체크리스트"}
          </button>
        </div>
        <div className="asset-summary-grid">
          {guide.asset_groups.map((group) => (
            <div className="asset-summary-chip" key={group.title}>
              <span>{group.icon}</span>
              <strong>{group.title}</strong>
            </div>
          ))}
        </div>
        {assetsOpen && (
          <div className="asset-detail-grid">
            {guide.asset_groups.map((group) => (
              <div className="asset-detail-group" key={group.title}>
                <strong>{group.icon} {group.title}</strong>
                <ul>
                  {group.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </article>

      {guide.critical_warnings.length > 0 && (
        <article className="compact-warning-section">
          <div className="warning-summary-heading">
            <strong>⚠ 제작 전 확인할 것 {guide.critical_warnings.length}건</strong>
            {guide.critical_warnings.length > 2 && (
              <button className="text-toggle" onClick={() => setWarningsOpen((value) => !value)}>
                {warningsOpen ? "접기" : "자세히"}
              </button>
            )}
          </div>
          <ul>
            {visibleWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </article>
      )}

      <article className="product-truth-section">
        <div className="compact-section-heading product-truth-heading">
          <div>
            <span className="guide-label">내 상품 정보</span>
            <strong>자유롭게 입력하세요. 원문은 수정하지 않고 의미 연결만 합니다.</strong>
          </div>
          <span className={`product-truth-status ${guide.interpretation_ready ? "ready" : "empty"}`}>
            {statusLabel}
          </span>
        </div>

        <div className="product-truth-grid">
          <label>
            <span>상품명</span>
            <input
              value={guide.product_truth.product_name}
              onChange={(event) => updateProductTruth("product_name", event.target.value)}
              placeholder="예: 자동 단우산"
            />
          </label>
          <label>
            <span>타깃</span>
            <input
              value={guide.product_truth.target_customer}
              onChange={(event) => updateProductTruth("target_customer", event.target.value)}
              placeholder="자유 입력"
            />
          </label>
          <label>
            <span>가격 / 혜택</span>
            <input
              value={guide.product_truth.price_offer}
              onChange={(event) => updateProductTruth("price_offer", event.target.value)}
              placeholder="예: 8,900원 / 로켓배송"
            />
          </label>
          <label className="product-truth-facts">
            <span>확인된 특징 / 스펙</span>
            <textarea
              rows={4}
              value={guide.product_truth.verified_facts}
              onChange={(event) => updateProductTruth("verified_facts", event.target.value)}
              placeholder={"한 줄에 하나씩 자유롭게 입력\n예: 물 존나 잘튕김\n예: 200그람\n예: 가방에 걍 쏙"}
            />
          </label>
        </div>

        <div className="product-truth-apply-row">
          <p className="product-truth-note">
            사용자가 쓴 문장은 그대로 Product Truth로 보존합니다. 의미 해석은 참고영상 제작 메커니즘과 연결하는 용도로만 사용합니다.
          </p>
          {guide.interpretation_required && (
            <button
              className="product-truth-apply-button"
              disabled={interpreting || guide.interpretation_ready}
              onClick={applyProductTruth}
            >
              {interpreting ? "해석 중..." : guide.interpretation_ready ? "반영 완료" : "제작안에 반영"}
            </button>
          )}
        </div>

        {interpretationError && <p className="product-truth-interpretation-error">{interpretationError}</p>}
      </article>

      <article className="compact-prompt-actions">
        <div className="compact-section-heading inline-heading">
          <div>
            <span className="guide-label">AI에게 맡기기</span>
            <strong>{promptBlocked ? "상품 정보를 제작안에 반영한 뒤 사용할 수 있습니다." : "필요한 작업만 복사하세요."}</strong>
          </div>
          <button className="text-toggle" disabled={promptBlocked} onClick={() => setRawOpen((value) => !value)}>
            {rawOpen ? "전체 프롬프트 접기" : "전체 프롬프트 보기"}
          </button>
        </div>

        <div className="compact-prompt-button-row">
          {promptActions.map((action) => (
            <button
              className="compact-prompt-button"
              key={action.kind}
              disabled={promptBlocked}
              onClick={() => copy(guide.prompts[action.kind], action.kind)}
            >
              <span>{action.icon}</span>
              <strong>{copiedKind === action.kind ? "복사됨" : action.label}</strong>
            </button>
          ))}
        </div>

        {rawOpen && !promptBlocked && (
          <div className="raw-prompt-body compact-raw-prompt">
            <div className="raw-prompt-toolbar">
              <p>대본·촬영·소재·편집을 한 번에 요청하는 고급용 프롬프트입니다.</p>
              <button onClick={() => copy(guide.raw_prompt, "raw")}>
                {copiedKind === "raw" ? "복사됨" : "전체 복사"}
              </button>
            </div>
            <pre>{guide.raw_prompt}</pre>
          </div>
        )}
      </article>
    </section>
  );
}
