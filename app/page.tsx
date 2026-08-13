"use client";

import { FormEvent, useMemo, useState } from "react";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";
import type { GeminiRateLimitDiagnostic } from "@/lib/gemini-error";
import { compareVideoAnalyses } from "@/lib/reference-compare";
import {
  compileSingleVideoProductionGuide,
  EMPTY_PRODUCT_TRUTH,
  type ProductTruthInput
} from "@/lib/single-video-production";
import { AdvancedAnalysis } from "@/components/AdvancedAnalysis";
import { ComparisonDashboard } from "@/components/ComparisonDashboard";
import { SingleVideoSummary } from "@/components/SingleVideoSummary";
import { SingleVideoProductionGuide } from "@/components/SingleVideoProductionGuide";

type ApiResponse = {
  source?: { platform: string; url: string };
  analysis?: VideoAnalysis;
  derived_metrics?: DerivedVideoMetrics;
  error?: string;
  code?: string;
  rate_limit?: GeminiRateLimitDiagnostic | null;
};

type SavedReference = {
  id: string;
  url: string;
  analysis: VideoAnalysis;
  metrics: DerivedVideoMetrics;
};

const navItems = ["홈", "참고영상", "비교 분석", "제작안", "프롬프트"];

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
      : "AI 분석 요청 한도에 도달했습니다. 제한 상세를 확인해주세요.";
  }
  return message;
}

function rateLimitKindLabel(kind: GeminiRateLimitDiagnostic["kind"]) {
  if (kind === "RPM") return "RPM · 분당 요청 수";
  if (kind === "TPM") return "TPM · 분당 토큰 수";
  if (kind === "RPD") return "RPD · 일일 요청 수";
  return "UNKNOWN · 응답만으로 분류 불가";
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [analysisUrl, setAnalysisUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitDiagnostic, setRateLimitDiagnostic] = useState<GeminiRateLimitDiagnostic | null>(null);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [metrics, setMetrics] = useState<DerivedVideoMetrics | null>(null);
  const [savedReferences, setSavedReferences] = useState<SavedReference[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [productTruth, setProductTruth] = useState<ProductTruthInput>({ ...EMPTY_PRODUCT_TRUTH });

  const productionGuide = useMemo(
    () => (analysis && metrics ? compileSingleVideoProductionGuide(analysis, metrics, productTruth) : null),
    [analysis, metrics, productTruth]
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
    setRateLimitDiagnostic(null);
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
        setAnalysis(null);
        setMetrics(null);
        setAnalysisUrl("");
        setError(friendlyApiError(data.error || "분석에 실패했습니다."));
        setRateLimitDiagnostic(data.code === "GEMINI_RATE_LIMIT" ? data.rate_limit ?? null : null);
        return;
      }

      setAnalysis(data.analysis);
      setMetrics(data.derived_metrics);
      setAnalysisUrl(data.source?.url || requestedUrl);
    } catch (caught) {
      setAnalysis(null);
      setMetrics(null);
      setAnalysisUrl("");
      setRateLimitDiagnostic(null);
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
          {error && (
            <div className="error-box rate-limit-error">
              <p>{error}</p>
              {rateLimitDiagnostic && (
                <details className="rate-limit-details">
                  <summary>제한 상세</summary>
                  <dl>
                    <div><dt>제한 종류</dt><dd>{rateLimitKindLabel(rateLimitDiagnostic.kind)}</dd></div>
                    <div><dt>Quota metric</dt><dd>{rateLimitDiagnostic.metric ?? "응답에 없음"}</dd></div>
                    <div><dt>Quota ID</dt><dd>{rateLimitDiagnostic.quota_id ?? "응답에 없음"}</dd></div>
                    <div><dt>Limit</dt><dd>{rateLimitDiagnostic.limit ?? "응답에 없음"}</dd></div>
                    <div><dt>Retry after</dt><dd>{rateLimitDiagnostic.retry_after_seconds === null ? "응답에 없음" : `${rateLimitDiagnostic.retry_after_seconds}초`}</dd></div>
                    <div><dt>Model</dt><dd>{rateLimitDiagnostic.model ?? "응답에 없음"}</dd></div>
                    <div><dt>Upstream HTTP</dt><dd>{rateLimitDiagnostic.upstream_status ?? "응답에 없음"}</dd></div>
                  </dl>
                </details>
              )}
            </div>
          )}
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

            {promptOpen && productionGuide && (
              <SingleVideoProductionGuide
                guide={productionGuide}
                onProductTruthChange={setProductTruth}
              />
            )}

            {detailsOpen && <AdvancedAnalysis analysis={analysis} metrics={metrics} />}
          </div>
        )}
      </section>
    </main>
  );
}
