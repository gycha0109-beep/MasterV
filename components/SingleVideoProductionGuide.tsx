"use client";

import { useState } from "react";
import type { SingleVideoProductionGuide as Guide, SingleVideoPromptKind } from "@/lib/single-video-production";

type Props = {
  guide: Guide;
};

const promptCards: Array<{
  kind: SingleVideoPromptKind;
  title: string;
  description: string;
}> = [
  {
    kind: "script",
    title: "대본 프롬프트",
    description: "시간대별 화면·행동·내레이션·자막을 새로 구성합니다."
  },
  {
    kind: "shooting",
    title: "촬영 프롬프트",
    description: "실제로 찍어야 할 쇼트와 구도·행동·소품을 정리합니다."
  },
  {
    kind: "assets",
    title: "소재 프롬프트",
    description: "촬영·편집 전에 준비해야 할 상품·이미지·자료를 체크합니다."
  },
  {
    kind: "editing",
    title: "편집 프롬프트",
    description: "컷 구성·자막·제품 노출·CTA까지 편집 지시서로 바꿉니다."
  }
];

export function SingleVideoProductionGuide({ guide }: Props) {
  const [copiedKind, setCopiedKind] = useState<SingleVideoPromptKind | "raw" | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  async function copy(text: string, kind: SingleVideoPromptKind | "raw") {
    await navigator.clipboard.writeText(text);
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 1400);
  }

  return (
    <section className="production-guide" id="single-video-production-guide">
      <div className="production-guide-heading">
        <div>
          <span className="section-kicker">제작 가이드</span>
          <h3>이 영상을 참고해 만들려면</h3>
          <p>먼저 사람이 볼 제작 방향을 확인하고, 필요한 AI 작업만 복사하세요.</p>
        </div>
      </div>

      <div className="production-guide-grid">
        <article className="production-guide-card structure-guide-card">
          <span className="guide-label">추천 구성</span>
          <div className="guide-flow">
            {guide.structure_steps.map((step, index) => (
              <div className="guide-flow-step" key={`${step}-${index}`}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="production-guide-card">
          <span className="guide-label">촬영할 장면</span>
          <ul className="guide-check-list">
            {guide.shooting_scenes.map((scene) => <li key={scene}>{scene}</li>)}
          </ul>
        </article>

        <article className="production-guide-card">
          <span className="guide-label">준비할 소재</span>
          <ul className="guide-check-list compact-check-list">
            {guide.asset_checklist.map((asset) => <li key={asset}>{asset}</li>)}
          </ul>
        </article>

        <article className="production-guide-card warning-guide-card">
          <span className="guide-label">주의할 점</span>
          <ul className="guide-warning-list">
            {guide.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </article>
      </div>

      <div className="prompt-action-section">
        <div className="prompt-action-heading">
          <div>
            <span className="section-kicker">AI에 맡길 작업</span>
            <h4>필요한 것만 복사</h4>
          </div>
          <small>프롬프트 전문을 읽을 필요 없습니다.</small>
        </div>

        <div className="prompt-action-grid">
          {promptCards.map((card) => (
            <article className="prompt-action-card" key={card.kind}>
              <div>
                <strong>{card.title}</strong>
                <p>{card.description}</p>
              </div>
              <button onClick={() => copy(guide.prompts[card.kind], card.kind)}>
                {copiedKind === card.kind ? "복사됨" : "복사"}
              </button>
            </article>
          ))}
        </div>
      </div>

      <div className="raw-prompt-disclosure">
        <button className="raw-prompt-toggle" onClick={() => setRawOpen((value) => !value)}>
          <span>AI용 전체 프롬프트</span>
          <b>{rawOpen ? "접기" : "보기"}</b>
        </button>
        {rawOpen && (
          <div className="raw-prompt-body">
            <div className="raw-prompt-toolbar">
              <p>대본·촬영·소재·편집을 한 번에 요청할 때 사용하는 전체 프롬프트입니다.</p>
              <button onClick={() => copy(guide.raw_prompt, "raw")}>
                {copiedKind === "raw" ? "복사됨" : "전체 복사"}
              </button>
            </div>
            <pre>{guide.raw_prompt}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
