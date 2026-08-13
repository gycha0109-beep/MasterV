"use client";

import { useState } from "react";
import type { SingleVideoProductionGuide as Guide, SingleVideoPromptKind } from "@/lib/single-video-production";

type Props = {
  guide: Guide;
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

export function SingleVideoProductionGuide({ guide }: Props) {
  const [copiedKind, setCopiedKind] = useState<SingleVideoPromptKind | "raw" | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);

  async function copy(text: string, kind: SingleVideoPromptKind | "raw") {
    await navigator.clipboard.writeText(text);
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 1400);
  }

  const visibleWarnings = warningsOpen ? guide.critical_warnings : guide.critical_warnings.slice(0, 2);

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
