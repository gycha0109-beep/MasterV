"use client";

import { FormEvent, useMemo, useState } from "react";
import type { VideoAnalysis } from "@/lib/analysis-schema";

type ApiResponse = {
  source?: { platform: string; url: string };
  analysis?: VideoAnalysis;
  error?: string;
};

const navItems = ["홈", "참고영상", "비교 분석", "제작안", "프롬프트"];

function yesNo(value: boolean) {
  return value ? "있음" : "없음";
}

function buildScriptPrompt(analysis: VideoAnalysis) {
  const evidence = [
    `영상 구조: ${analysis.structure_label}`,
    `첫 장면 유형: ${analysis.hook.type}`,
    `첫 장면 화면: ${analysis.hook.visual}`,
    `첫 문장: ${analysis.hook.text || "명확한 발화 없음"}`,
    `제품 첫 등장: ${analysis.product_presentation.first_seen_seconds ?? "확인 불가"}초`,
    `직접 시연: ${yesNo(analysis.product_presentation.demonstration_present)}`,
    `전후 비교: ${yesNo(analysis.product_presentation.before_after_present)}`,
    `결과 화면: ${yesNo(analysis.product_presentation.result_visual_present)}`,
    `행동 유도: ${analysis.persuasion.cta || "뚜렷하지 않음"}`
  ];

  return `상품 숏폼 광고 대본을 새로 작성하라.\n\n아래 내용은 실제 참고영상 분석 결과다. 특정 문장이나 장면을 그대로 복사하지 말고 구조와 설득 방식을 참고하라.\n\n${evidence
    .map((item) => `- ${item}`)
    .join("\n")}\n\n요구사항:\n1. 세로형 숏폼 기준으로 작성한다.\n2. 첫 2초 안에 시선을 끄는 장면과 문장을 제시한다.\n3. 제품 설명보다 실제 사용과 결과를 우선한다.\n4. 확인되지 않은 효능이나 수치를 만들어내지 않는다.\n5. 시간대별로 화면, 음성, 자막, 장면 목적을 나눠 작성한다.\n6. 마지막에는 짧은 행동 유도 문장을 제안한다.`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatedPrompt = useMemo(
    () => (analysis ? buildScriptPrompt(analysis) : ""),
    [analysis]
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPromptOpen(false);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.analysis) {
        throw new Error(data.error || "분석에 실패했습니다.");
      }

      setAnalysis(data.analysis);
    } catch (caught) {
      setAnalysis(null);
      setError(caught instanceof Error ? caught.message : "분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">▶</span> MasterV</div>
        <nav>
          {navItems.map((item, index) => (
            <button key={item} className={`nav-item ${index === 0 ? "active" : ""}`}>
              <span>{["⌂", "▣", "⌁", "✎", "▤"][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>MVP 01</strong>
          <span>YouTube 단일 영상 분석</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">상품 숏폼 참고영상 분석</p>
            <h1>영상 하나부터 제대로 뜯어봅니다.</h1>
          </div>
          <span className="status-pill">Gemini 연결 준비</span>
        </header>

        <section className="search-panel">
          <div>
            <h2>분석할 YouTube 영상을 넣어주세요.</h2>
            <p>공개 영상 또는 Shorts 주소를 입력하면 대본과 영상 구조를 함께 분석합니다.</p>
          </div>
          <form onSubmit={submit} className="url-form">
            <input
              aria-label="YouTube URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/shorts/..."
            />
            <button disabled={loading || !url.trim()}>
              {loading ? "분석 중..." : "영상 분석"}
            </button>
          </form>
          {error && <p className="error-box">{error}</p>}
        </section>

        {!analysis && !loading && (
          <section className="empty-state">
            <div className="empty-icon">◎</div>
            <h3>첫 분석 결과가 여기에 표시됩니다.</h3>
            <p>첫 장면 · 제품 등장 · 시연 · 전후 비교 · 대본 · 장면별 역할을 한 화면에서 확인합니다.</p>
          </section>
        )}

        {loading && (
          <section className="empty-state loading-state">
            <div className="spinner" />
            <h3>영상의 화면과 음성을 함께 분석하고 있습니다.</h3>
            <p>자유형 요약이 아니라 정해진 항목으로 구조화하는 중입니다.</p>
          </section>
        )}

        {analysis && (
          <div className="results">
            <section className="result-hero">
              <div>
                <span className="section-kicker">핵심 구조</span>
                <h2>{analysis.structure_label}</h2>
                <p>{analysis.summary}</p>
              </div>
              <div className="hero-actions">
                <button className="secondary-button" onClick={() => setPromptOpen((value) => !value)}>
                  {promptOpen ? "프롬프트 닫기" : "이 분석으로 프롬프트 만들기"}
                </button>
              </div>
            </section>

            <section className="stat-grid">
              <article className="stat-card">
                <span>첫 장면</span>
                <strong>{analysis.hook.type}</strong>
                <small>{analysis.hook.duration_seconds ?? "?"}초</small>
              </article>
              <article className="stat-card">
                <span>제품 첫 등장</span>
                <strong>{analysis.product_presentation.first_seen_seconds ?? "?"}초</strong>
                <small>초반 노출 시점</small>
              </article>
              <article className="stat-card">
                <span>직접 시연</span>
                <strong>{yesNo(analysis.product_presentation.demonstration_present)}</strong>
                <small>사용 장면 기준</small>
              </article>
              <article className="stat-card">
                <span>전후 비교</span>
                <strong>{yesNo(analysis.product_presentation.before_after_present)}</strong>
                <small>결과 증명 방식</small>
              </article>
            </section>

            <section className="two-column">
              <article className="panel">
                <span className="section-kicker">처음 어떻게 시선을 끌었나</span>
                <blockquote>{analysis.hook.text || "뚜렷한 첫 문장 없음"}</blockquote>
                <p className="visual-note"><b>화면</b>{analysis.hook.visual}</p>
              </article>
              <article className="panel">
                <span className="section-kicker">설득 방식</span>
                <div className="tag-list">
                  {analysis.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <dl className="mini-list">
                  <div><dt>문제</dt><dd>{analysis.persuasion.problem || "-"}</dd></div>
                  <div><dt>증거</dt><dd>{analysis.persuasion.proof || "-"}</dd></div>
                  <div><dt>행동 유도</dt><dd>{analysis.persuasion.cta || "-"}</dd></div>
                </dl>
              </article>
            </section>

            <section className="panel scene-panel">
              <div className="panel-heading">
                <div><span className="section-kicker">장면 구성</span><h3>초 단위로 뜯어보기</h3></div>
                <span>{analysis.scenes.length}개 장면</span>
              </div>
              <div className="scene-table-wrap">
                <table>
                  <thead><tr><th>시간</th><th>화면</th><th>음성 / 자막</th><th>역할</th></tr></thead>
                  <tbody>
                    {analysis.scenes.map((scene, index) => (
                      <tr key={`${scene.start_seconds}-${index}`}>
                        <td>{scene.start_seconds}~{scene.end_seconds}초</td>
                        <td>{scene.visual}</td>
                        <td><b>{scene.spoken_text || "발화 없음"}</b><span>{scene.on_screen_text || "화면 글자 없음"}</span></td>
                        <td><span className="purpose-chip">{scene.purpose}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel transcript-panel">
              <div className="panel-heading"><div><span className="section-kicker">전체 대본</span><h3>영상에서 실제로 들린 내용</h3></div></div>
              <p>{analysis.transcript.full || "명확한 음성 대본을 추출하지 못했습니다."}</p>
            </section>

            {analysis.confidence_notes.length > 0 && (
              <section className="confidence-box">
                <strong>분석 시 주의할 점</strong>
                {analysis.confidence_notes.map((note) => <span key={note}>• {note}</span>)}
              </section>
            )}

            {promptOpen && (
              <section className="prompt-panel">
                <div className="panel-heading">
                  <div><span className="section-kicker">실행용 프롬프트</span><h3>이 분석 결과를 AI에 바로 넣기</h3></div>
                  <button onClick={copyPrompt}>{copied ? "복사됨" : "전체 복사"}</button>
                </div>
                <pre>{generatedPrompt}</pre>
                <p>현재는 단일 참고영상 기준입니다. 다음 단계에서 여러 영상의 반복 근거를 합쳐 프롬프트를 생성합니다.</p>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
