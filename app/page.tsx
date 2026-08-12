"use client";

import { FormEvent, useMemo, useState } from "react";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { CoverageMetric, DerivedVideoMetrics } from "@/lib/derived-metrics";
import {
  compareVideoAnalyses,
  type CrossVideoCoverageMetric,
  type ReferenceComparisonResult
} from "@/lib/reference-compare";

type ApiResponse = {
  source?: { platform: string; url: string };
  analysis?: VideoAnalysis;
  derived_metrics?: DerivedVideoMetrics;
  error?: string;
};

type SavedReference = {
  id: string;
  url: string;
  analysis: VideoAnalysis;
  metrics: DerivedVideoMetrics;
};

const navItems = ["홈", "참고영상", "비교 분석", "제작안", "프롬프트"];

function formatSeconds(value: number | null) {
  return value === null ? "확인 불가" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function coverageTop<T>(items: T[], limit = 6) {
  return items.slice(0, limit);
}

function videoIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\//, "") || url;
    const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    return parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).at(-1) || url;
  } catch {
    return url;
  }
}

function CoverageBars({ items, emptyText }: { items: CoverageMetric[]; emptyText: string }) {
  if (items.length === 0) return <p className="muted-copy">{emptyText}</p>;

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

function ComparisonCoverageBars({
  items,
  sampleSize,
  emptyText
}: {
  items: CrossVideoCoverageMetric[];
  sampleSize: number;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="muted-copy">{emptyText}</p>;

  return (
    <div className="coverage-list compare-coverage-list">
      {coverageTop(items).map((item) => (
        <div className="coverage-row" key={item.name}>
          <div className="coverage-label">
            <strong>{item.name}</strong>
            <span>{item.video_count}/{sampleSize}개 · 사용 영상 내 평균 {formatPercent(item.avg_coverage_percent)}</span>
          </div>
          <div className="coverage-track support-track" aria-label={`${item.name} 영상 지지도 ${item.video_percent}%`}>
            <span style={{ width: `${Math.min(100, item.video_percent)}%` }} />
          </div>
          <b>{formatPercent(item.video_percent)}</b>
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

function ComparisonDashboard({ comparison }: { comparison: ReferenceComparisonResult }) {
  return (
    <section className="comparison-dashboard" id="comparison">
      <div className="comparison-hero">
        <div>
          <span className="section-kicker">다중 레퍼런스 비교</span>
          <h2>{comparison.sample_size}개 영상을 같은 기준으로 비교했습니다.</h2>
          <p>영상 타입을 억지로 통일하지 않고, 실제 화면 구성과 행동에서 반복되는 것만 집계합니다.</p>
        </div>
        <span className="comparison-count">N = {comparison.sample_size}</span>
      </div>

      <div className="stat-grid metric-stat-grid compare-stat-grid">
        <article className="stat-card emphasis-card">
          <span>첫 3초 상품 등장</span>
          <strong>{formatPercent(comparison.first_three_seconds.product_visible_percent)}</strong>
          <small>{comparison.first_three_seconds.product_visible_count}/{comparison.sample_size}개 영상</small>
        </article>
        <article className="stat-card">
          <span>상품 등장 중앙값</span>
          <strong>{formatSeconds(comparison.product.median_first_seen_seconds)}</strong>
          <small>확인 가능 {comparison.product.known_first_seen_count}개 기준</small>
        </article>
        <article className="stat-card">
          <span>사용 / 시연 포함</span>
          <strong>{formatPercent(comparison.demonstration.videos_with_use_or_demo_percent)}</strong>
          <small>평균 영상 비중 {formatPercent(comparison.demonstration.avg_combined_percent)}</small>
        </article>
        <article className="stat-card">
          <span>CTA 포함</span>
          <strong>{formatPercent(comparison.cta.present_percent)}</strong>
          <small>중앙 시작 {formatSeconds(comparison.cta.median_first_seen_seconds)}</small>
        </article>
      </div>

      <div className="two-column analysis-columns">
        <article className="panel">
          <div className="panel-heading compact-heading">
            <div><span className="section-kicker">첫 3초 공통점</span><h3>처음에 무엇을 보여줬나</h3></div>
          </div>
          <ComparisonCoverageBars items={comparison.first_three_seconds.materials} sampleSize={comparison.sample_size} emptyText="공통 화면 소재가 없습니다." />
          <div className="compare-action-list">
            {comparison.first_three_seconds.actions.slice(0, 6).map((item) => (
              <span key={item.name}><b>{item.name}</b> {item.video_count}/{comparison.sample_size}</span>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading compact-heading">
            <div><span className="section-kicker">전체 화면 소재</span><h3>몇 개 영상에서 반복됐나</h3></div>
          </div>
          <ComparisonCoverageBars items={comparison.materials} sampleSize={comparison.sample_size} emptyText="공통 화면 소재가 없습니다." />
        </article>
      </div>

      <div className="two-column analysis-columns">
        <article className="panel">
          <div className="panel-heading compact-heading">
            <div><span className="section-kicker">메시지 역할</span><h3>반복되는 구간 역할</h3></div>
          </div>
          <ComparisonCoverageBars items={comparison.message_roles} sampleSize={comparison.sample_size} emptyText="공통 역할이 없습니다." />
        </article>

        <article className="panel pattern-panel">
          <div className="panel-heading compact-heading">
            <div><span className="section-kicker">반복 제작 구조</span><h3>2~3단계 전이 패턴</h3></div>
            <span>2개 이상 영상 지지</span>
          </div>
          {comparison.common_patterns.length > 0 ? (
            <div className="pattern-list">
              {comparison.common_patterns.slice(0, 8).map((pattern) => (
                <div className="pattern-row" key={pattern.sequence.join("-")}>
                  <strong>{pattern.sequence.join(" → ")}</strong>
                  <span>{pattern.support_count}/{comparison.sample_size} · {formatPercent(pattern.support_percent)}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted-copy">아직 2개 이상 영상에서 반복된 전이 패턴이 없습니다.</p>}
        </article>
      </div>

      <article className="panel comparison-table-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">영상별 차이</span><h3>평균 뒤에 숨은 편차 확인</h3></div>
        </div>
        <div className="scene-table-wrap">
          <table className="comparison-table">
            <thead><tr><th>참고영상</th><th>구조</th><th>상품 첫 등장</th><th>상품 노출</th><th>사용/시연</th><th>CTA</th></tr></thead>
            <tbody>
              {comparison.videos.map((video) => (
                <tr key={video.id}>
                  <td><b>{video.label}</b></td>
                  <td>{video.structure_label}</td>
                  <td>{formatSeconds(video.product_first_seen_seconds)}</td>
                  <td>{formatPercent(video.product_visible_percent)}</td>
                  <td>{formatPercent(video.demonstration_percent)}</td>
                  <td>{formatSeconds(video.cta_first_seen_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [metrics, setMetrics] = useState<DerivedVideoMetrics | null>(null);
  const [savedReferences, setSavedReferences] = useState<SavedReference[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatedPrompt = useMemo(
    () => (analysis && metrics ? buildScriptPrompt(analysis, metrics) : ""),
    [analysis, metrics]
  );

  const comparison = useMemo(() => {
    if (savedReferences.length < 2) return null;
    return compareVideoAnalyses(
      savedReferences.map((reference) => ({
        id: reference.id,
        label: reference.id,
        url: reference.url,
        analysis: reference.analysis
      }))
    );
  }, [savedReferences]);

  const currentSaved = Boolean(
    url && savedReferences.some((reference) => reference.url === url.trim())
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

  function saveCurrentReference() {
    if (!analysis || !metrics) return;
    const normalizedUrl = url.trim();
    if (!normalizedUrl || savedReferences.some((reference) => reference.url === normalizedUrl)) return;
    let id = videoIdFromUrl(normalizedUrl);
    if (savedReferences.some((reference) => reference.id === id)) id = `${id}-${savedReferences.length + 1}`;
    setSavedReferences((current) => [...current, { id, url: normalizedUrl, analysis, metrics }]);
  }

  function removeReference(id: string) {
    setSavedReferences((current) => current.filter((reference) => reference.id !== id));
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
            <button
              key={item}
              className={`nav-item ${index === 0 ? "active" : ""}`}
              onClick={() => index === 2 && document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth" })}
            >
              <span>{["⌂", "▣", "⌁", "✎", "▤"][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>MVP 03</strong>
          <span>영상 역설계 · 다중 레퍼런스 비교</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">상품 숏폼 역설계</p>
            <h1>잘 된 영상들에서 실제 반복되는 것은?</h1>
          </div>
          <span className="status-pill">관찰 → 계산 → 비교</span>
        </header>

        <section className="search-panel">
          <div>
            <h2>참고영상을 하나씩 분석해 비교함에 모으세요.</h2>
            <p>각 영상은 따로 분석하고, 비교는 저장된 관찰 데이터만 계산하므로 추가 AI 호출이 없습니다.</p>
          </div>
          <form onSubmit={submit} className="url-form">
            <input aria-label="YouTube URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/shorts/..." />
            <button disabled={loading || !url.trim()}>{loading ? "분석 중..." : "영상 분석"}</button>
          </form>
          {error && <p className="error-box">{error}</p>}
        </section>

        <section className="reference-tray">
          <div className="reference-tray-heading">
            <div>
              <span className="section-kicker">비교함</span>
              <strong>{savedReferences.length}개 저장</strong>
            </div>
            <small>현재 브라우저 세션에서만 유지됩니다.</small>
          </div>
          {savedReferences.length > 0 ? (
            <div className="reference-chip-list">
              {savedReferences.map((reference) => (
                <div className="reference-chip" key={reference.id}>
                  <div><strong>{reference.id}</strong><span>{reference.analysis.structure_label}</span></div>
                  <button onClick={() => removeReference(reference.id)} aria-label={`${reference.id} 제거`}>×</button>
                </div>
              ))}
            </div>
          ) : <p className="muted-copy tray-empty">분석 결과에서 ‘비교함에 저장’을 누르면 여기에 쌓입니다.</p>}
        </section>

        {comparison && <ComparisonDashboard comparison={comparison} />}

        {!analysis && !loading && (
          <section className="empty-state">
            <div className="empty-icon">◎</div>
            <h3>첫 참고영상을 분석해주세요.</h3>
            <p>2개 이상을 비교함에 저장하면 첫 3초·화면 소재·시연·반복 제작 구조가 자동 집계됩니다.</p>
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
                <span className="section-kicker">현재 영상</span>
                <h2>{analysis.structure_label}</h2>
                <p>{analysis.summary}</p>
              </div>
              <div className="hero-actions">
                <button className="secondary-button save-reference-button" onClick={saveCurrentReference} disabled={currentSaved}>
                  {currentSaved ? "비교함에 저장됨" : "+ 비교함에 저장"}
                </button>
                <button className="secondary-button" onClick={() => setPromptOpen((value) => !value)}>
                  {promptOpen ? "프롬프트 닫기" : "이 구조로 프롬프트 만들기"}
                </button>
              </div>
            </section>

            <section className="stat-grid metric-stat-grid">
              <article className="stat-card emphasis-card"><span>상품 첫 등장</span><strong>{formatSeconds(metrics.product.first_seen_seconds)}</strong><small>관찰 구간 기준</small></article>
              <article className="stat-card"><span>상품 노출</span><strong>{formatPercent(metrics.product.visible_percent)}</strong><small>{metrics.product.visible_seconds}초 · {metrics.product.segment_count}구간</small></article>
              <article className="stat-card"><span>사용 / 시연</span><strong>{formatPercent(metrics.demonstration.combined_percent)}</strong><small>{metrics.demonstration.combined_seconds}초 · {metrics.demonstration.combined_segment_count}구간</small></article>
              <article className="stat-card"><span>CTA 시작</span><strong>{formatSeconds(metrics.cta.first_seen_seconds)}</strong><small>{metrics.cta.segment_count}구간</small></article>
            </section>

            <section className="first-three-panel panel">
              <div className="panel-heading"><div><span className="section-kicker">첫 3초</span><h3>시작을 무엇으로 만들었나</h3></div><span>제품 {metrics.first_three_seconds.product_visible ? "등장" : "미등장"}</span></div>
              <div className="first-three-grid">
                <div className="first-three-main">
                  <div className="big-signal"><span>첫 행동</span><strong>{metrics.first_three_seconds.actions.join(" · ") || "확인 불가"}</strong></div>
                  <div className="chip-group">{metrics.first_three_seconds.message_roles.slice(0, 5).map((item) => <span key={item.name}>{item.name}</span>)}</div>
                </div>
                <div><span className="mini-title">화면 소재</span><CoverageBars items={metrics.first_three_seconds.materials} emptyText="분류된 소재가 없습니다." /></div>
                <div><span className="mini-title">출연 요소</span><CoverageBars items={metrics.first_three_seconds.presenters} emptyText="출연 요소가 없습니다." /></div>
              </div>
            </section>

            <section className="two-column analysis-columns">
              <article className="panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">화면 구성</span><h3>무엇을 갖다 썼나</h3></div><span>복수 소재 동시 집계</span></div><CoverageBars items={metrics.materials} emptyText="화면 소재를 집계하지 못했습니다." /></article>
              <article className="panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">출연 방식</span><h3>누가 화면에 나오나</h3></div></div><CoverageBars items={metrics.presenters} emptyText="출연 요소를 집계하지 못했습니다." /></article>
            </section>

            <section className="three-column">
              <article className="panel compact-metric-panel"><span className="section-kicker">제품 사용</span><strong>{metrics.demonstration.direct_use_segment_count}회</strong><p>{metrics.demonstration.direct_use_seconds}초 동안 실제 사용·섭취·착용</p></article>
              <article className="panel compact-metric-panel"><span className="section-kicker">기능 시연</span><strong>{metrics.demonstration.direct_demo_segment_count}회</strong><p>{metrics.demonstration.direct_demo_seconds}초 동안 기능·작동을 직접 보여줌</p></article>
              <article className="panel compact-metric-panel"><span className="section-kicker">관찰 가능한 결과</span><strong>{metrics.demonstration.visually_observable_result_segment_count}회</strong><p>{metrics.demonstration.visually_observable_result_seconds}초 동안 결과 변화가 화면에서 확인됨</p></article>
            </section>

            <section className="two-column analysis-columns">
              <article className="panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">메시지 역할</span><h3>무슨 일을 하는 구간이 많나</h3></div></div><CoverageBars items={metrics.message_roles} emptyText="메시지 역할을 집계하지 못했습니다." /></article>
              <article className="panel evidence-panel">
                <div className="panel-heading compact-heading"><div><span className="section-kicker">주장과 근거</span><h3>말한 것과 보여준 것 분리</h3></div></div>
                <div className="evidence-summary">
                  <div><span>주장</span><strong>{metrics.claims_and_evidence.claim_count}개</strong></div>
                  <div><span>주장 포함 구간</span><strong>{metrics.claims_and_evidence.claim_segment_count}</strong></div>
                  <div className={metrics.claims_and_evidence.claim_segments_with_no_evidence > 0 ? "warning-number" : ""}><span>화면상 근거 없음</span><strong>{metrics.claims_and_evidence.claim_segments_with_no_evidence}</strong></div>
                  <div><span>결과 직접 확인</span><strong>{metrics.claims_and_evidence.claim_segments_with_visually_observable_result}</strong></div>
                </div>
                <CoverageBars items={metrics.claims_and_evidence.evidence_types} emptyText="근거 유형을 집계하지 못했습니다." />
              </article>
            </section>

            <section className="panel observation-panel">
              <div className="panel-heading"><div><span className="section-kicker">시간순 역설계</span><h3>실제로 무엇을 어떤 순서로 배치했나</h3></div><span>{analysis.observation_segments.length}개 관찰 구간</span></div>
              <div className="observation-list">
                {analysis.observation_segments.map((segment, index) => (
                  <article className="observation-row" key={`${segment.start_seconds}-${index}`}>
                    <div className="observation-time"><strong>{segment.start_seconds}–{segment.end_seconds}</strong><span>초</span></div>
                    <div className="observation-body">
                      <div className="observation-title-row"><strong>{segment.action.type}</strong><span className={`confidence-pill confidence-${segment.confidence}`}>{segment.confidence}</span></div>
                      <p>{segment.visual.description}</p>
                      <div className="chip-group soft-chips">{segment.visual.material_types.map((item) => <span key={item}>{item}</span>)}{segment.message_roles.map((item) => <span key={item}>{item}</span>)}</div>
                      {segment.action.description && <small>{segment.action.description}</small>}
                    </div>
                    <div className="observation-evidence">
                      <span className="mini-title">주장 / 근거</span>
                      {segment.claims.length > 0 ? <ul>{segment.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul> : <p className="muted-copy">명시적 주장 없음</p>}
                      <div className="chip-group evidence-chips">{segment.evidence.types.map((type) => <span key={type}>{type}</span>)}</div>
                      {segment.evidence.observable_result && <small>관찰 결과: {segment.evidence.observable_result}</small>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel scene-panel secondary-analysis">
              <div className="panel-heading"><div><span className="section-kicker">내용 흐름</span><h3>의미 단락으로 요약</h3></div><span>{analysis.scenes.length}개 단락</span></div>
              <div className="scene-table-wrap"><table><thead><tr><th>시간</th><th>화면</th><th>음성 / 자막</th><th>역할</th></tr></thead><tbody>{analysis.scenes.map((scene, index) => <tr key={`${scene.start_seconds}-${index}`}><td>{scene.start_seconds}~{scene.end_seconds}초</td><td>{scene.visual}</td><td><b>{scene.spoken_text || "발화 없음"}</b><span>{scene.on_screen_text || "화면 글자 없음"}</span></td><td><span className="purpose-chip">{scene.purpose}</span></td></tr>)}</tbody></table></div>
            </section>

            <section className="panel transcript-panel secondary-analysis"><div className="panel-heading"><div><span className="section-kicker">전체 대본</span><h3>영상에서 실제로 들린 내용</h3></div></div><p>{analysis.transcript.full || "명확한 음성 대본을 추출하지 못했습니다."}</p></section>

            {analysis.confidence_notes.length > 0 && <section className="confidence-box"><strong>분석 시 주의할 점</strong>{analysis.confidence_notes.map((note) => <span key={note}>• {note}</span>)}</section>}

            {promptOpen && (
              <section className="prompt-panel">
                <div className="panel-heading"><div><span className="section-kicker">실행용 프롬프트</span><h3>관찰 데이터로 AI에게 제작 지시하기</h3></div><button onClick={copyPrompt}>{copied ? "복사됨" : "전체 복사"}</button></div>
                <pre>{generatedPrompt}</pre>
                <p>현재 버튼은 단일 참고영상 기준입니다. 다중 레퍼런스 근거 기반 프롬프트는 다음 단계에서 별도로 생성합니다.</p>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
