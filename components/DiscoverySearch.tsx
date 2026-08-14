"use client";

import { FormEvent, useState } from "react";
import type { OrchestrationPlan, SearchCandidate } from "@/lib/tiered-analysis";
import { DiscoveryResultGrid } from "@/components/DiscoveryResultGrid";

type DiscoveryApiResponse = {
  orchestration?: { plan: OrchestrationPlan };
  error?: string;
  code?: string;
};

type DiscoverySearchProps = {
  analysisBusy: boolean;
  onAnalyzeCandidate: (candidate: SearchCandidate) => void | Promise<void>;
};

function friendlyDiscoveryError(data: DiscoveryApiResponse) {
  if (data.code === "YOUTUBE_DISCOVERY_NOT_CONFIGURED") {
    return "YouTube 키워드 검색이 아직 서버에 설정되지 않았습니다. URL 직접 분석은 계속 사용할 수 있습니다.";
  }
  if (data.code === "YOUTUBE_DISCOVERY_QUOTA") {
    return "YouTube 검색 요청 한도에 도달했습니다. URL 직접 분석은 계속 사용할 수 있습니다.";
  }
  return data.error || "YouTube 참고영상 검색에 실패했습니다.";
}

export function DiscoverySearch({ analysisBusy, onAnalyzeCandidate }: DiscoverySearchProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<OrchestrationPlan | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requestedQuery = query.trim();
    if (!requestedQuery) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/discover/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: requestedQuery })
      });
      const data = (await response.json()) as DiscoveryApiResponse;
      if (!response.ok || !data.orchestration) {
        setPlan(null);
        setError(friendlyDiscoveryError(data));
        return;
      }
      setPlan(data.orchestration.plan);
    } catch (caught) {
      setPlan(null);
      setError(caught instanceof Error ? caught.message : "YouTube 참고영상 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="search-panel discovery-search-panel" id="discovery-search">
        <div>
          <h2>키워드로 참고영상을 찾아보세요.</h2>
          <p>검색 결과는 AI 정밀 분석을 기다리지 않고 먼저 보여줍니다. 저장된 빠른 구조가 있으면 함께 표시합니다.</p>
        </div>
        <form onSubmit={submit} className="keyword-form">
          <input aria-label="YouTube 검색어" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: sunscreen review, portable umbrella" />
          <button disabled={loading || !query.trim()}>{loading ? "검색 중..." : "참고영상 찾기"}</button>
        </form>
        <p className="discovery-note">키워드 탐색 자체는 Gemini를 호출하지 않습니다. 정밀 분석은 결과에서 직접 선택할 때만 시작됩니다.</p>
        {loading && <div className="discovery-loading"><div className="spinner" /><span>YouTube 후보와 저장된 빠른 분석 상태를 불러오고 있습니다.</span></div>}
        {error && <div className="error-box discovery-error"><p>{error}</p></div>}
      </section>
      {plan && <DiscoveryResultGrid plan={plan} analysisBusy={analysisBusy} onAnalyzeCandidate={onAnalyzeCandidate} />}
    </>
  );
}
