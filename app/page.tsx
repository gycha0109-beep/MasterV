"use client";

import { FormEvent, useMemo, useState } from "react";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";
import type { GeminiRateLimitDiagnostic } from "@/lib/gemini-error";
import { compareVideoAnalyses } from "@/lib/reference-compare";
import { referenceLibraryRecordToComparisonInput } from "@/lib/reference-library";
import {
  compileSingleVideoProductionGuide,
  EMPTY_PRODUCT_TRUTH,
  type ProductTruthInput
} from "@/lib/single-video-production";
import type { SearchCandidate } from "@/lib/tiered-analysis";
import { usePersistentReferenceLibrary } from "@/lib/use-persistent-reference-library";
import { AdvancedAnalysis } from "@/components/AdvancedAnalysis";
import { ComparisonDashboard } from "@/components/ComparisonDashboard";
import { DiscoverySearch } from "@/components/DiscoverySearch";
import { ReferenceLibraryAccount } from "@/components/ReferenceLibraryAccount";
import { SingleVideoSummary } from "@/components/SingleVideoSummary";
import { SingleVideoProductionGuide } from "@/components/SingleVideoProductionGuide";

type AnalysisExecution = {
  cache_key: string;
  provenance: "cache" | "replay" | "live";
};

type ApiResponse = {
  source?: { platform: string; source_id: string; url: string };
  analysis?: VideoAnalysis;
  derived_metrics?: DerivedVideoMetrics;
  execution?: AnalysisExecution;
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
  const [analysisExecution, setAnalysisExecution] = useState<AnalysisExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [libraryActionError, setLibraryActionError] = useState("");
  const [rateLimitDiagnostic, setRateLimitDiagnostic] = useState<GeminiRateLimitDiagnostic | null>(null);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [metrics, setMetrics] = useState<DerivedVideoMetrics | null>(null);
  const [sessionReferences, setSessionReferences] = useState<SavedReference[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [productTruth, setProductTruth] = useState<ProductTruthInput>({ ...EMPTY_PRODUCT_TRUTH });
  const persistent = usePersistentReferenceLibrary();
  const persistentMode = persistent.status === "ready";

  const productionGuide = useMemo(
    () => (analysis && metrics ? compileSingleVideoProductionGuide(analysis, metrics, productTruth) : null),
    [analysis, metrics, productTruth]
  );

  const displayReferences = useMemo(() => {
    if (persistentMode) {
      return persistent.records.map((record) => ({
        id: record.source.source_id,
        url: record.source.canonical_url,
        analysis: record.analysis
      }));
    }
    return sessionReferences.map((reference) => ({
      id: reference.id,
      url: reference.url,
      analysis: reference.analysis
    }));
  }, [persistentMode, persistent.records, sessionReferences]);

  const comparison = useMemo(() => {
    if (persistentMode) {
      if (persistent.records.length < 2) return null;
      return compareVideoAnalyses(persistent.records.map(referenceLibraryRecordToComparisonInput));
    }
    if (sessionReferences.length < 2) return null;
    return compareVideoAnalyses(
      sessionReferences.map((reference) => ({
        id: reference.id,
        label: reference.id,
        url: reference.url,
        analysis: reference.analysis
      }))
    );
  }, [persistentMode, persistent.records, sessionReferences]);

  const currentSaved = Boolean(
    analysisUrl && displayReferences.some((reference) => reference.url === analysisUrl)
  );

  async function analyzeRequestedUrl(requestedUrl: string, sourceId: string | null = null) {
    setLoading(true);
    setAnalyzingSourceId(sourceId);
    setError("");
    setLibraryActionError("");
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
        setAnalysisExecution(null);
        setError(friendlyApiError(data.error || "분석에 실패했습니다."));
        setRateLimitDiagnostic(data.code === "GEMINI_RATE_LIMIT" ? data.rate_limit ?? null : null);
        requestAnimationFrame(() => document.getElementById("direct-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        return;
      }

      setAnalysis(data.analysis);
      setMetrics(data.derived_metrics);
      setAnalysisUrl(data.source?.url || requestedUrl);
      setAnalysisExecution(data.execution ?? null);
      setProductTruth({ ...EMPTY_PRODUCT_TRUTH });
      requestAnimationFrame(() => document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (caught) {
      setAnalysis(null);
      setMetrics(null);
      setAnalysisUrl("");
      setAnalysisExecution(null);
      setRateLimitDiagnostic(null);
      const message = caught instanceof Error ? caught.message : "분석에 실패했습니다.";
      setError(friendlyApiError(message));
      requestAnimationFrame(() => document.getElementById("direct-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } finally {
      setLoading(false);
      setAnalyzingSourceId(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requestedUrl = url.trim();
    if (!requestedUrl) return;
    await analyzeRequestedUrl(requestedUrl);
  }

  async function analyzeCandidate(candidate: SearchCandidate) {
    setUrl(candidate.canonical_url);
    await analyzeRequestedUrl(candidate.canonical_url, candidate.source_id);
  }

  async function saveCurrentReference() {
    if (!analysis || !metrics || !analysisUrl) return;
    setLibraryActionError("");

    if (persistentMode) {
      if (!analysisExecution?.cache_key || !analysisExecution.provenance) {
        setLibraryActionError("이 분석 결과에는 영속 저장에 필요한 실행 provenance가 없습니다. 다시 분석해주세요.");
        return;
      }
      try {
        await persistent.save({
          url: analysisUrl,
          label: videoIdFromUrl(analysisUrl),
          analysis,
          analysis_cache_key: analysisExecution.cache_key,
          analysis_provenance: analysisExecution.provenance
        });
      } catch (caught) {
        setLibraryActionError(caught instanceof Error ? caught.message : "보관함 저장에 실패했습니다.");
      }
      return;
    }

    if (sessionReferences.some((reference) => reference.url === analysisUrl)) return;
    let id = videoIdFromUrl(analysisUrl);
    if (sessionReferences.some((reference) => reference.id === id)) id = `${id}-${sessionReferences.length + 1}`;
    setSessionReferences((current) => [...current, { id, url: analysisUrl, analysis, metrics }]);
  }

  async function removeReference(id: string) {
    setLibraryActionError("");
    if (persistentMode) {
      try {
        await persistent.remove(id);
      } catch (caught) {
        setLibraryActionError(caught instanceof Error ? caught.message : "보관함 삭제에 실패했습니다.");
      }
      return;
    }
    setSessionReferences((current) => current.filter((reference) => reference.id !== id));
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
              onClick={() => {
                if (index === 1) document.getElementById("discovery-search")?.scrollIntoView({ behavior: "smooth" });
                if (index === 2) document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span>{["⌂", "▣", "⌁", "✎", "▤"][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>MVP 05</strong>
          <span>탐색은 먼저 · 정밀 분석은 선택한 영상만</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">상품 숏폼 역설계</p>
            <h1>참고영상을 찾고, 필요한 것만 깊게 분석합니다.</h1>
          </div>
          <span className="status-pill">탐색 → 빠른 구조 → 정밀 분석</span>
        </header>

        <DiscoverySearch analysisBusy={loading} analyzingSourceId={analyzingSourceId} onAnalyzeCandidate={analyzeCandidate} />

        <section className="search-panel" id="direct-analysis" style={{ marginTop: 16, scrollMarginTop: 24 }}>
          <div>
            <h2>URL을 이미 알고 있다면 바로 정밀 분석하세요.</h2>
            <p>키워드 탐색을 거치지 않고 기존 단일 영상 Deep 분석을 그대로 사용할 수 있습니다.</p>
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

        <ReferenceLibraryAccount
          configured={persistent.configured}
          status={persistent.status}
          email={persistent.session?.user.email}
          error={persistent.error}
          notice={persistent.notice}
          onSignIn={persistent.signIn}
          onSignUp={persistent.signUp}
          onSignOut={persistent.signOut}
        />

        <section className="reference-tray">
          <div className="reference-tray-heading">
            <div>
              <span className="section-kicker">비교함</span>
              <strong>{displayReferences.length}개 저장</strong>
            </div>
            <small>{persistentMode ? "Supabase 보관함 · 새로고침 후에도 유지" : "현재 브라우저 세션에서만 유지"}</small>
          </div>
          {libraryActionError && <p className="error-box">{libraryActionError}</p>}
          {displayReferences.length > 0 ? (
            <div className="reference-chip-list">
              {displayReferences.map((reference) => (
                <div className="reference-chip" key={reference.id}>
                  <div><strong>{reference.id}</strong><span>{reference.analysis.structure_label}</span></div>
                  <button onClick={() => void removeReference(reference.id)} aria-label={`${reference.id} 제거`}>×</button>
                </div>
              ))}
            </div>
          ) : <p className="muted-copy tray-empty">정밀 분석 결과에서 ‘비교함에 저장’을 누르면 여기에 쌓입니다.</p>}
        </section>

        {comparison && <ComparisonDashboard comparison={comparison} />}

        {!analysis && !loading && (
          <section className="empty-state">
            <div className="empty-icon">◎</div>
            <h3>검색 결과에서 후보를 고르거나 URL을 직접 분석해주세요.</h3>
            <p>탐색은 먼저 보고, Deep 분석은 실제로 참고할 영상에만 사용합니다.</p>
          </section>
        )}

        {loading && (
          <section className="empty-state loading-state">
            <div className="spinner" />
            <h3>선택한 영상의 화면과 음성을 정밀 분석하고 있습니다.</h3>
            <p>검색 후보 전체가 아니라 지금 선택한 영상 한 개만 Deep 분석합니다.</p>
          </section>
        )}

        {analysis && metrics && (
          <div className="results" id="analysis-result" style={{ scrollMarginTop: 24 }}>
            <SingleVideoSummary
              analysis={analysis}
              metrics={metrics}
              currentSaved={currentSaved}
              promptOpen={promptOpen}
              detailsOpen={detailsOpen}
              onSave={() => void saveCurrentReference()}
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
