"use client";

import { FormEvent, useMemo, useState } from "react";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { CoverageMetric, DerivedVideoMetrics } from "@/lib/derived-metrics";

type ApiResponse = {
  source?: { platform: string; url: string };
  analysis?: VideoAnalysis;
  derived_metrics?: DerivedVideoMetrics;
  error?: string;
};

const navItems = ["홈", "참고영상", "비교 분석", "제작안", "프롬프트"];

function formatSeconds(value: number | null) {
  return value === null ? "확인 불가" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function coverageTop(items: CoverageMetric[], limit = 6) {
  return items.slice(0, limit);
}

function CoverageBars({ items, emptyText }: { items: CoverageMetric[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="muted-copy">{emptyText}</p>;
  }

  return (
    <div className="coverage-list">
      {coverageTop(items).map((item) => (
        <div className="coverage-row" key={item.name}>
          <div className="coverage-label">
            <strong>{item.name}</strong>
            <span>{item.seconds}초 · {item.segment_count}구간</span>
          </div>
          <div className="coverage-track" aria-label={`${item.name} ${item.percent}%`}>
            <span style={{ width: `${Math.min(100, item.percent)}%` }} />
          </div>
          <b>{formatPercent(item.percent)}</b>
        </div>
      ))}
    </div>
  );
}

function buildScriptPrompt(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const firstThreeMaterials = coverageTop(metrics.first_three_seconds.materials, 3)
    .map((item) => `${item.name} ${formatPercent(item.percent)}`)
    .join(", ") || "뚜렷한 소재 분류 없음";
  const topMaterials = coverageTop(metrics.materials, 4)
    .map((item) => `${item.name} ${formatPercent(item.percent)}`)
    .join(", ");
  const topRoles = coverageTop(metrics.message_roles, 5)
    .map((item) => item.name)
    .join(" → ");

  return `상품 숏폼 광고 대본과 촬영 구성을 새로 작성하라.\n\n아래 내용은 실제 참고영상에서 관찰한 화면과 행동을 집계한 결과다. 특정 문장이나 장면을 그대로 복사하지 말고, 제작 구조만 참고하라.\n\n- 전체 내용 구조: ${analysis.structure_label}\n- 첫 3초 화면 소재: ${firstThreeMaterials}\n- 첫 3초 행동: ${metrics.first_three_seconds.actions.join(", ") || "확인 불가"}\n- 첫 3초 메시지 역할: ${metrics.first_three_seconds.message_roles.map((item) => item.name).join(", ") || "확인 불가"}\n- 제품 첫 등장: ${formatSeconds(metrics.product.first_seen_seconds)}\n- 제품 화면 노출: ${formatPercent(metrics.product.visible_percent)}\n- 주요 화면 소재: ${topMaterials || "확인 불가"}\n- 사용/시연 구간: ${metrics.demonstration.combined_segment_count}개, 총 ${metrics.demonstration.combined_seconds}초 (${formatPercent(metrics.demonstration.combined_percent)})\n- 화면으로 결과가 직접 확인되는 구간: ${metrics.demonstration.visually_observable_result_segment_count}개\n- 주요 메시지 역할: ${topRoles || "확인 불가"}\n- CTA 시작: ${formatSeconds(metrics.cta.first_seen_seconds)}\n\n요구사항:\n1. 세로형 숏폼 기준으로 시간대별 화면, 행동, 음성, 자막, 장면 목적을 작성한다.\n2. 첫 3초는 위 참고영상의 시작 구조를 참고하되 문구와 장면을 복제하지 않는다.\n3. 설명만 늘어놓지 말고 실제 상품 사용이나 기능 시연이 필요한 구간을 명시한다.\n4. 상품 사진, 상품페이지, 직접 촬영 등 어떤 소재가 필요한지 각 구간마다 표시한다.\n5. 광고 문구의 주장과 화면에서 실제 확인 가능한 결과를 구분한다.\n6. 확인되지 않은 효능, 수치, 후기, 성능을 만들어내지 않는다.\n7. 마지막에 필요한 촬영 소재 체크리스트를 붙인다.`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [metrics, setMetrics] = useState<DerivedVideoMetrics | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatedPrompt = useMemo(
    () => (analysis && metrics ? buildScriptPrompt(analysis, metrics) : ""),
    [analysis, metrics]
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

      if (!response.ok || !data.analysis || !data.derived_metrics) {
        throw new Error(data.error || "분석에 실패했습니다.");
      }

      setAnalysis(data.analysis);
      setMetrics(data.derived_metrics);
    } catch (caught) {
      setAnalysis(null);
      setMetrics(null);
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
          <strong>MVP 02</strong>
          <span>영상 역설계 · 관찰 기반 분석</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">상품 숏폼 역설계</p>
            <h1>이 영상은 실제로 어떻게 만들어졌을까?</h1>
          </div>
          <span className="status-pill">Gemini + 계산 지표</span>
        </header>

        <section className="search-panel">
          <div>
            <h2>분석할 YouTube 영상을 넣어주세요.</h2>
            <p>무슨 타입인지 찍는 대신, 화면·행동·소재·시연을 시간순으로 분해합니다.</p>
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
            <h3>영상 제작 구조가 여기에 표시됩니다.</h3>
            <p>첫 3초 · 화면 소재 · 상품 노출 · 시연 비중 · 주장과 근거 · 시간순 구성을 확인합니다.</p>
          </section>
        )}

        {loading && (
          <section className="empty-state loading-state">
            <div className="spinner" />
            <h3>영상의 화면과 음성을 함께 분해하고 있습니다.</h3>
            <p>관찰 구간을 만든 뒤 계산 가능한 지표를 자동으로 집계합니다.</p>
          </section>
        )}

        {analysis && metrics && (
          <div className="results">
            <section className="result-hero">
              <div>
                <span className="section-kicker">전체 흐름 요약</span>
                <h2>{analysis.structure_label}</h2>
                <p>{analysis.summary}</p>
              </div>
              <div className="hero-actions">
                <button className="secondary-button" onClick={() => setPromptOpen((value) => !value)}>
                  {promptOpen ? "프롬프트 닫기" : "이 구조로 프롬프트 만들기"}
                </button>
              </div>
            </section>

            <section className="stat-grid metric-stat-grid">
              <article className="stat-card emphasis-card">
                <span>상품 첫 등장</span>
                <strong>{formatSeconds(metrics.product.first_seen_seconds)}</strong>
                <small>관찰 구간 기준</small>
              </article>
              <article className="stat-card">
                <span>상품 노출</span>
                <strong>{formatPercent(metrics.product.visible_percent)}</strong>
                <small>{metrics.product.visible_seconds}초 · {metrics.product.segment_count}구간</small>
              </article>
              <article className="stat-card">
                <span>사용 / 시연</span>
                <strong>{formatPercent(metrics.demonstration.combined_percent)}</strong>
                <small>{metrics.demonstration.combined_seconds}초 · {metrics.demonstration.combined_segment_count}구간</small>
              </article>
              <article className="stat-card">
                <span>CTA 시작</span>
                <strong>{formatSeconds(metrics.cta.first_seen_seconds)}</strong>
                <small>{metrics.cta.segment_count}구간</small>
              </article>
            </section>

            <section className="first-three-panel panel">
              <div className="panel-heading">
                <div><span className="section-kicker">첫 3초</span><h3>시작을 무엇으로 만들었나</h3></div>
                <span>제품 {metrics.first_three_seconds.product_visible ? "등장" : "미등장"}</span>
              </div>
              <div className="first-three-grid">
                <div className="first-three-main">
                  <div className="big-signal">
                    <span>첫 행동</span>
                    <strong>{metrics.first_three_seconds.actions.join(" · ") || "확인 불가"}</strong>
                  </div>
                  <div className="chip-group">
                    {metrics.first_three_seconds.message_roles.slice(0, 5).map((item) => (
                      <span key={item.name}>{item.name}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mini-title">화면 소재</span>
                  <CoverageBars items={metrics.first_three_seconds.materials} emptyText="분류된 소재가 없습니다." />
                </div>
                <div>
                  <span className="mini-title">출연 요소</span>
                  <CoverageBars items={metrics.first_three_seconds.presenters} emptyText="출연 요소가 없습니다." />
                </div>
              </div>
            </section>

            <section className="two-column analysis-columns">
              <article className="panel">
                <div className="panel-heading compact-heading">
                  <div><span className="section-kicker">화면 구성</span><h3>무엇을 갖다 썼나</h3></div>
                  <span>복수 소재 동시 집계</span>
                </div>
                <CoverageBars items={metrics.materials} emptyText="화면 소재를 집계하지 못했습니다." />
              </article>

              <article className="panel">
                <div className="panel-heading compact-heading">
                  <div><span className="section-kicker">출연 방식</span><h3>누가 화면에 나오나</h3></div>
                </div>
                <CoverageBars items={metrics.presenters} emptyText="출연 요소를 집계하지 못했습니다." />
              </article>
            </section>

            <section className="three-column">
              <article className="panel compact-metric-panel">
                <span className="section-kicker">제품 사용</span>
                <strong>{metrics.demonstration.direct_use_segment_count}회</strong>
                <p>{metrics.demonstration.direct_use_seconds}초 동안 실제 사용·섭취·착용</p>
              </article>
              <article className="panel compact-metric-panel">
                <span className="section-kicker">기능 시연</span>
                <strong>{metrics.demonstration.direct_demo_segment_count}회</strong>
                <p>{metrics.demonstration.direct_demo_seconds}초 동안 기능·작동을 직접 보여줌</p>
              </article>
              <article className="panel compact-metric-panel">
                <span className="section-kicker">관찰 가능한 결과</span>
                <strong>{metrics.demonstration.visually_observable_result_segment_count}회</strong>
                <p>{metrics.demonstration.visually_observable_result_seconds}초 동안 결과 변화가 화면에서 확인됨</p>
              </article>
            </section>

            <section className="two-column analysis-columns">
              <article className="panel">
                <div className="panel-heading compact-heading">
                  <div><span className="section-kicker">메시지 역할</span><h3>무슨 일을 하는 구간이 많나</h3></div>
                </div>
                <CoverageBars items={metrics.message_roles} emptyText="메시지 역할을 집계하지 못했습니다." />
              </article>

              <article className="panel evidence-panel">
                <div className="panel-heading compact-heading">
                  <div><span className="section-kicker">주장과 근거</span><h3>말한 것과 보여준 것 분리</h3></div>
                </div>
                <div className="evidence-summary">
                  <div><span>주장</span><strong>{metrics.claims_and_evidence.claim_count}개</strong></div>
                  <div><span>주장 포함 구간</span><strong>{metrics.claims_and_evidence.claim_segment_count}</strong></div>
                  <div className={metrics.claims_and_evidence.claim_segments_with_no_evidence > 0 ? "warning-number" : ""}>
                    <span>화면상 근거 없음</span>
                    <strong>{metrics.claims_and_evidence.claim_segments_with_no_evidence}</strong>
                  </div>
                  <div><span>결과 직접 확인</span><strong>{metrics.claims_and_evidence.claim_segments_with_visually_observable_result}</strong></div>
                </div>
                <CoverageBars items={metrics.claims_and_evidence.evidence_types} emptyText="근거 유형을 집계하지 못했습니다." />
              </article>
            </section>

            <section className="panel observation-panel">
              <div className="panel-heading">
                <div><span className="section-kicker">시간순 역설계</span><h3>실제로 무엇을 어떤 순서로 배치했나</h3></div>
                <span>{analysis.observation_segments.length}개 관찰 구간</span>
              </div>
              <div className="observation-list">
                {analysis.observation_segments.map((segment, index) => (
                  <article className="observation-row" key={`${segment.start_seconds}-${index}`}>
                    <div className="observation-time">
                      <strong>{segment.start_seconds}–{segment.end_seconds}</strong>
                      <span>초</span>
                    </div>
                    <div className="observation-body">
                      <div className="observation-title-row">
                        <strong>{segment.action.type}</strong>
                        <span className={`confidence-pill confidence-${segment.confidence}`}>{segment.confidence}</span>
                      </div>
                      <p>{segment.visual.description}</p>
                      <div className="chip-group soft-chips">
                        {segment.visual.material_types.map((item) => <span key={item}>{item}</span>)}
                        {segment.message_roles.map((item) => <span key={item}>{item}</span>)}
                      </div>
                      {segment.action.description && <small>{segment.action.description}</small>}
                    </div>
                    <div className="observation-evidence">
                      <span className="mini-title">주장 / 근거</span>
                      {segment.claims.length > 0 ? (
                        <ul>{segment.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul>
                      ) : <p className="muted-copy">명시적 주장 없음</p>}
                      <div className="chip-group evidence-chips">
                        {segment.evidence.types.map((type) => <span key={type}>{type}</span>)}
                      </div>
                      {segment.evidence.observable_result && <small>관찰 결과: {segment.evidence.observable_result}</small>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel scene-panel secondary-analysis">
              <div className="panel-heading">
                <div><span className="section-kicker">내용 흐름</span><h3>의미 단락으로 요약</h3></div>
                <span>{analysis.scenes.length}개 단락</span>
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

            <section className="panel transcript-panel secondary-analysis">
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
                  <div><span className="section-kicker">실행용 프롬프트</span><h3>관찰 데이터로 AI에게 제작 지시하기</h3></div>
                  <button onClick={copyPrompt}>{copied ? "복사됨" : "전체 복사"}</button>
                </div>
                <pre>{generatedPrompt}</pre>
                <p>현재는 단일 참고영상 기준입니다. 이후 여러 영상의 반복 근거를 합쳐 프롬프트를 생성합니다.</p>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
