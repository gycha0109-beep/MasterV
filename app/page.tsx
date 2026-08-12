"use client";

import { FormEvent, useMemo, useState } from "react";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";
import { compareVideoAnalyses } from "@/lib/reference-compare";
import { AdvancedAnalysis } from "@/components/AdvancedAnalysis";
import { ComparisonDashboard } from "@/components/ComparisonDashboard";
import { SingleVideoSummary } from "@/components/SingleVideoSummary";

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

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
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

function friendlyApiError(message: string) {
  if (/429|quota|rate.?limit|resource_exhausted/i.test(message)) {
    const match = message.match(/retry in\s+([\d.]+)s/i);
    const seconds = match ? Math.ceil(Number(match[1])) : null;
    return seconds
      ? `AI 분석 요청이 잠시 제한되었습니다. 약 ${seconds}초 후 다시 시도해주세요.`
      : "AI 분석 요청 한도에 잠시 도달했습니다. 잠시 후 다시 시도해주세요.";
  }
  return message;
}

function buildScriptPrompt(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const firstThreeMaterials = metrics.first_three_seconds.materials.slice(0, 3)
    .map((item) => `${item.name} ${formatPercent(item.percent)}`)
    .join(", ") || "뚜렷한 소재 분류 없음";
  const topMaterials = metrics.materials.slice(0, 4)
    .map((item) => `${item.name} ${formatPercent(item.percent)}`)
    .join(", ");
  const topRoles = metrics.message_roles.slice(0, 5)
    .map((item) => item.name)
    .join(" → ");

  return `상품 숏폼 광고 대본과 촬영 구성을 새로 작성하라.\n\n아래 내용은 실제 참고영상에서 관찰한 화면과 행동을 집계한 결과다. 특정 문장이나 장면을 그대로 복사하지 말고, 제작 구조만 참고하라.\n\n- 전체 내용 구조: ${analysis.structure_label}\n- 첫 3초 화면 소재: ${firstThreeMaterials}\n- 첫 3초 행동: ${metrics.first_three_seconds.actions.join(", ") || "확인 불가"}\n- 첫 3초 메시지 역할: ${metrics.first_three_seconds.message_roles.map((item) => item.name).join(", ") || "확인 불가"}\n- 제품 첫 등장: ${metrics.product.first_seen_seconds ?? "확인 불가"}초\n- 제품 화면 노출: ${formatPercent(metrics.product.visible_percent)}\n- 주요 화면 소재: ${topMaterials || "확인 불가"}\n- 사용/시연 구간: ${metrics.demonstration.combined_segment_count}개, 총 ${metrics.demonstration.combined_seconds}초 (${formatPercent(metrics.demonstration.combined_percent)})\n- 화면으로 결과가 직접 확인되는 구간: ${metrics.demonstration.visually_observable_result_segment_count}개\n- 주요 메시지 역할: ${topRoles || "확인 불가"}\n- CTA 시작: ${metrics.cta.first_seen_seconds ?? "확인 불가"}초\n\n요구사항:\n1. 세로형 숏폼 기준으로 시간대별 화면, 행동, 음성, 자막, 장면 목적을 작성한다.\n2. 첫 3초는 위 참고영상의 시작 구조를 참고하되 문구와 장면을 복제하지 않는다.\n3. 설명만 늘어놓지 말고 실제 상품 사용이나 기능 시연이 필요한 구간을 명시한다.\n4. 상품 사진, 상품페이지, 직접 촬영 등 어떤 소재가 필요한지 각 구간마다 표시한다.\n5. 광고 문구의 주장과 화면에서 실제 확인 가능한 결과를 구분한다.\n6. 확인되지 않은 효능, 수치, 후기, 성능을 만들어내지 않는다.\n7. 마지막에 필요한 촬영 소재 체크리스트를 붙인다.`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [analysisUrl, setAnalysisUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [metrics, setMetrics] = useState<DerivedVideoMetrics | null>(null);
  const [savedReferences, setSavedReferences] = useState<SavedReference[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    analysisUrl && savedReferences.some((reference) => reference.url === analysisUrl)
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requestedUrl = url.trim();
    setLoading(true);
    setError("");
    setPromptOpen(false);
    setDetailsOpen(false);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: requestedUrl })
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.analysis || !data.derived_metrics) {
        throw new Error(friendlyApiError(data.error || "분석에 실패했습니다."));
      }

      setAnalysis(data.analysis);
      setMetrics(data.derived_metrics);
      setAnalysisUrl(data.source?.url || requestedUrl);
    } catch (caught) {
      setAnalysis(null);
      setMetrics(null);
      setAnalysisUrl("");
      const message = caught instanceof Error ? caught.message : "분석에 실패했습니다.";
      setError(friendlyApiError(message));
    } finally {
      setLoading(false);
    }
  }

  function saveCurrentReference() {
    if (!analysis || !metrics || !analysisUrl) return;
    if (savedReferences.some((reference) => reference.url === analysisUrl)) return;
    let id = videoIdFromUrl(analysisUrl);
    if (savedReferences.some((reference) => reference.id === id)) id = `${id}-${savedReferences.length + 1}`;
    setSavedReferences((current) => [...current, { id, url: analysisUrl, analysis, metrics }]);
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
          <strong>MVP 05</strong>
          <span>핵심만 먼저 · 상세는 필요할 때</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">상품 숏폼 역설계</p>
            <h1>참고영상에서 쓸 만한 제작 방식을 찾습니다.</h1>
          </div>
          <span className="status-pill">분석 → 비교 → 제작</span>
        </header>

        <section className="search-panel">
          <div>
            <h2>참고영상을 하나씩 분석해 비교함에 모으세요.</h2>
            <p>한 영상은 핵심만 빠르게 보고, 여러 개를 저장하면 공통 제작 방식을 비교합니다.</p>
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
            <p>한 영상에서는 제작 구조만 빠르게 보고, 2개 이상부터 공통점을 비교합니다.</p>
          </section>
        )}

        {loading && (
          <section className="empty-state loading-state">
            <div className="spinner" />
            <h3>영상의 화면과 음성을 함께 분해하고 있습니다.</h3>
            <p>보여줄 결과는 핵심만 정리하고, 세부 데이터는 상세 분석에 보관합니다.</p>
          </section>
        )}

        {analysis && metrics && (
          <div className="results">
            <SingleVideoSummary
              analysis={analysis}
              metrics={metrics}
              currentSaved={currentSaved}
              promptOpen={promptOpen}
              detailsOpen={detailsOpen}
              onSave={saveCurrentReference}
              onTogglePrompt={() => setPromptOpen((value) => !value)}
              onToggleDetails={() => setDetailsOpen((value) => !value)}
            />

            {promptOpen && (
              <section className="prompt-panel">
                <div className="panel-heading"><div><span className="section-kicker">실행용 프롬프트</span><h3>이 영상의 제작 구조만 참고하기</h3></div><button onClick={copyPrompt}>{copied ? "복사됨" : "전체 복사"}</button></div>
                <pre>{generatedPrompt}</pre>
                <p>특정 문구나 장면을 복제하지 않고 관찰된 제작 구조만 전달합니다.</p>
              </section>
            )}

            {detailsOpen && <AdvancedAnalysis analysis={analysis} metrics={metrics} />}
          </div>
        )}
      </section>
    </main>
  );
}
