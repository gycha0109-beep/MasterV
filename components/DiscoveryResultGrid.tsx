"use client";

import {
  SEARCH_UX_STATUS_LABELS,
  getCandidateSearchUxStatus,
  getPlanSearchUxStatus,
  type SearchUxStatus
} from "@/lib/search-ux";
import type { OrchestrationPlan, SearchCandidate } from "@/lib/tiered-analysis";

type Props = {
  plan: OrchestrationPlan;
  analysisBusy: boolean;
  onAnalyzeCandidate: (candidate: SearchCandidate) => void | Promise<void>;
};

function statusClass(status: SearchUxStatus) {
  return `search-status search-status-${status.replaceAll("_", "-")}`;
}

export function DiscoveryResultGrid({ plan, analysisBusy, onAnalyzeCandidate }: Props) {
  const planStatus = getPlanSearchUxStatus(plan);
  return (
    <section className="discovery-results" id="search-results">
      <div className="discovery-summary">
        <div>
          <h3>‘{plan.query}’ 참고영상</h3>
          <p>후보를 먼저 훑고, 실제로 참고할 영상만 정밀 분석하세요.</p>
        </div>
        <div className="discovery-summary-status">
          <span className={statusClass(planStatus)}>{SEARCH_UX_STATUS_LABELS[planStatus]}</span>
          {!plan.diagnostics.coarse_runtime_allowed && plan.diagnostics.coarse_pending_live_count > 0 && (
            <span className={statusClass("limited")}>자동 빠른 분석 제한</span>
          )}
          <span className="discovery-count">{plan.diagnostics.candidate_count}개 후보</span>
        </div>
      </div>

      {plan.candidates.length === 0 ? (
        <section className="empty-state"><div className="empty-icon">◎</div><h3>조건에 맞는 후보가 없습니다.</h3><p>검색어를 조금 넓혀 다시 찾아보세요.</p></section>
      ) : (
        <div className="discovery-grid">
          {plan.candidates.map((planned, index) => {
            const candidate = planned.candidate;
            const status = getCandidateSearchUxStatus(planned, plan.diagnostics.coarse_runtime_allowed);
            const coarse = planned.coarse_analysis;
            return (
              <article className="discovery-card" key={candidate.source_id}>
                <div className="discovery-thumbnail">
                  {candidate.thumbnail_url ? <img src={candidate.thumbnail_url} alt="" /> : <div className="discovery-thumbnail-placeholder">▶</div>}
                  <span className="discovery-rank">#{index + 1}</span>
                </div>
                <div className="discovery-card-body">
                  <div className="discovery-card-topline">
                    <span className={statusClass(status)}>{SEARCH_UX_STATUS_LABELS[status]}</span>
                    <span className="discovery-count">{candidate.duration_seconds ? `${candidate.duration_seconds}초` : "길이 미확인"}</span>
                  </div>
                  <h4>{candidate.title || candidate.source_id}</h4>
                  <div className="discovery-meta"><span>{candidate.creator || "채널 미확인"}</span><span>조회 {candidate.native_metrics.view_count ?? "미확인"}</span></div>
                  <div className="discovery-quick">
                    {coarse ? (
                      <><strong>{coarse.primary_delivery_mode} · {coarse.confidence}</strong><span>훅: {coarse.hook_type || "미확인"}</span><span>{coarse.direct_demo_present ? "직접 시연 있음" : "직접 시연 없음"} · {coarse.cta_present ? "CTA 있음" : "CTA 없음"}</span></>
                    ) : status === "limited" ? (
                      <><strong>메타데이터만 사용 가능</strong><span>빠른 AI 분석은 현재 quality gate 때문에 자동 실행하지 않습니다.</span></>
                    ) : (
                      <><strong>{status === "queued" ? "빠른 분석 대기" : "아직 빠른 분석 없음"}</strong><span>메타데이터는 먼저 사용할 수 있습니다.</span></>
                    )}
                  </div>
                  <div className="discovery-card-actions">
                    <button disabled={analysisBusy} onClick={() => void onAnalyzeCandidate(candidate)}>{analysisBusy ? "분석 작업 중..." : "이 영상 정밀 분석"}</button>
                    <a href={candidate.canonical_url} target="_blank" rel="noreferrer">YouTube</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
