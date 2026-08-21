"use client";

import {
  SEARCH_UX_STATUS_LABELS,
  getCandidateSearchUxStatus,
  getPlanSearchUxStatus,
  type SearchUxStatus
} from "@/lib/search-ux";
import type { OrchestrationPlan, SearchCandidate } from "@/lib/tiered-analysis";
import styles from "@/components/DiscoverySearch.module.css";

type Props = {
  plan: OrchestrationPlan;
  analysisBusy: boolean;
  analyzingSourceId: string | null;
  onAnalyzeCandidate: (candidate: SearchCandidate) => void | Promise<void>;
};

const statusClasses: Record<SearchUxStatus, string> = {
  unanalyzed: styles.statusUnanalyzed,
  quick_partial: styles.statusQuickPartial,
  quick_complete: styles.statusQuickComplete,
  queued: styles.statusQueued,
  limited: styles.statusLimited
};

function statusClass(status: SearchUxStatus) {
  return `${styles.status} ${statusClasses[status]}`;
}

export function DiscoveryResultGrid({ plan, analysisBusy, analyzingSourceId, onAnalyzeCandidate }: Props) {
  const planStatus = getPlanSearchUxStatus(plan);
  return (
    <section className={styles.results} id="search-results">
      <div className={styles.summary}>
        <div><h3>‘{plan.query}’ 참고영상</h3><p>후보를 먼저 훑고, 실제로 참고할 영상만 정밀 분석하세요.</p></div>
        <div className={styles.summaryStatus}>
          <span className={statusClass(planStatus)}>{SEARCH_UX_STATUS_LABELS[planStatus]}</span>
          {!plan.diagnostics.coarse_runtime_allowed && plan.diagnostics.coarse_pending_live_count > 0 && <span className={statusClass("limited")}>자동 빠른 분석 제한</span>}
          <span className={styles.count}>{plan.diagnostics.candidate_count}개 후보</span>
        </div>
      </div>
      {plan.candidates.length === 0 ? (
        <section className="empty-state"><div className="empty-icon">◎</div><h3>조건에 맞는 후보가 없습니다.</h3><p>검색어를 조금 넓혀 다시 찾아보세요.</p></section>
      ) : (
        <div className={styles.grid}>
          {plan.candidates.map((planned, index) => {
            const candidate = planned.candidate;
            const status = getCandidateSearchUxStatus(planned, plan.diagnostics.coarse_runtime_allowed);
            const coarse = planned.coarse_analysis;
            const analyzingThis = analyzingSourceId === candidate.source_id;
            return (
              <article className={styles.card} key={candidate.source_id} aria-busy={analyzingThis || undefined}>
                <div className={styles.thumbnail}>
                  {candidate.thumbnail_url ? <img src={candidate.thumbnail_url} alt="" /> : <div className={styles.placeholder}>▶</div>}
                  <span className={styles.rank}>#{index + 1}</span>
                </div>
                <div className={styles.body}>
                  <div className={styles.topline}><span className={statusClass(status)}>{SEARCH_UX_STATUS_LABELS[status]}</span><span className={styles.count}>{candidate.duration_seconds ? `${candidate.duration_seconds}초` : "길이 미확인"}</span></div>
                  <h4>{candidate.title || candidate.source_id}</h4>
                  <div className={styles.meta}><span>{candidate.creator || "채널 미확인"}</span><span>조회 {candidate.native_metrics.view_count ?? "미확인"}</span></div>
                  <div className={styles.quick}>
                    {coarse ? <><strong>{coarse.primary_delivery_mode} · {coarse.confidence}</strong><span>훅: {coarse.hook_type || "미확인"}</span><span>{coarse.direct_demo_present ? "직접 시연 있음" : "직접 시연 없음"} · {coarse.cta_present ? "CTA 있음" : "CTA 없음"}</span></> : status === "limited" ? <><strong>메타데이터만 사용 가능</strong><span>빠른 AI 분석은 현재 quality gate 때문에 자동 실행하지 않습니다.</span></> : <><strong>{status === "queued" ? "빠른 분석 대기" : "아직 빠른 분석 없음"}</strong><span>메타데이터는 먼저 사용할 수 있습니다.</span></>}
                  </div>
                  <div className={styles.actions}><button disabled={analysisBusy} onClick={() => void onAnalyzeCandidate(candidate)}>{analyzingThis ? "이 영상 분석 중..." : analysisBusy ? "다른 영상 분석 중" : "이 영상 정밀 분석"}</button><a href={candidate.canonical_url} target="_blank" rel="noreferrer">YouTube</a></div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
