"use client";

import { useState } from "react";
import type {
  ProductTruthInput,
  SingleVideoProductionGuide as Guide,
  SingleVideoPromptKind
} from "@/lib/single-video-production";

type Props = {
  guide: Guide;
  onProductTruthChange: (next: ProductTruthInput) => void;
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

export function SingleVideoProductionGuide({ guide, onProductTruthChange }: Props) {
  const [copiedKind, setCopiedKind] = useState<SingleVideoPromptKind | "raw" | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);

  async function copy(text: string, kind: SingleVideoPromptKind | "raw") {
    await navigator.clipboard.writeText(text);
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 1400);
  }

  function updateProductTruth<K extends keyof ProductTruthInput>(key: K, value: ProductTruthInput[K]) {
    onProductTruthChange({ ...guide.product_truth, [key]: value });
  }

  const visibleWarnings = warningsOpen ? guide.critical_warnings : guide.critical_warnings.slice(0, 2);
  const hasProductTruth = Boolean(
    guide.product_truth.product_name.trim() ||
    guide.product_truth.verified_facts.trim() ||
    guide.product_truth.target_customer.trim() ||
    guide.product_truth.price_offer.trim()
  );

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
            <strong>이 순서만 먼저 보세요.</strong>
          </div>
        </div>
        <div className="production-step-list">
          {guide.production_steps.map((step, index) => (
            <div className="production-step-row" key={`${step.title}-${index}`}>
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
            <strong>실제로 판매할 상품의 확인된 정보만 넣으세요.</strong>
          </div>
          <span className={`product-truth-status ${hasProductTruth ? "ready" : "empty"}`}>
            {hasProductTruth ? "프롬프트에 반영 중" : "아직 입력 전"}
          </span>
        </div>

        <div className="product-truth-grid">
          <label>
            <span>상품명</span>
            <input
              value={guide.product_truth.product_name}
              onChange={(event) => updateProductTruth("product_name", event.target.value)}
              placeholder="예: 초경량 완전자동 우산"
            />
          </label>
          <label>
            <span>타깃</span>
            <input
              value={guide.product_truth.target_customer}
              onChange={(event) => updateProductTruth("target_customer", event.target.value)}
              placeholder="예: 출퇴근 직장인"
            />
          </label>
          <label>
            <span>가격 / 혜택</span>
            <input
              value={guide.product_truth.price_offer}
              onChange={(event) => updateProductTruth("price_offer", event.target.value)}
              placeholder="예: 29,900원 / 무료배송"
            />
          </label>
          <label className="product-truth-facts">
            <span>확인된 특징 / 스펙</span>
            <textarea
              rows={4}
              value={guide.product_truth.verified_facts}
              onChange={(event) => updateProductTruth("verified_facts", event.target.value)}
              placeholder={"한 줄에 하나씩 입력\n예: 원터치 자동 개폐\n예: 실측 무게 310g\n예: UPF50+ 시험성적서 보유"}
            />
          </label>
        </div>
        <p className="product-truth-note">
          참고영상의 스펙·효능·가격은 자동으로 여기 들어오지 않습니다. 입력한 내용만 내 상품 사실로 사용합니다.
        </p>
      </article>

      <article className="compact-prompt-actions">
        <div className="compact-section-heading inline-heading">
          <div>
            <span className="guide-label">AI에게 맡기기</span>
            <strong>필요한 작업만 복사하세요.</strong>
          </div>
          <button className="text-toggle" onClick={() => setRawOpen((value) => !value)}>
            {rawOpen ? "전체 프롬프트 접기" : "전체 프롬프트 보기"}
          </button>
        </div>

        <div className="compact-prompt-button-row">
          {promptActions.map((action) => (
            <button
              className="compact-prompt-button"
              key={action.kind}
              onClick={() => copy(guide.prompts[action.kind], action.kind)}
            >
              <span>{action.icon}</span>
              <strong>{copiedKind === action.kind ? "복사됨" : action.label}</strong>
            </button>
          ))}
        </div>

        {rawOpen && (
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
