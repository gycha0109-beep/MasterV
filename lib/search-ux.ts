import type { OrchestrationPlan, PlannedCandidate } from "@/lib/tiered-analysis";

export type SearchUxStatus =
  | "unanalyzed"
  | "quick_partial"
  | "quick_complete"
  | "queued"
  | "limited";

export const SEARCH_UX_STATUS_LABELS: Record<SearchUxStatus, string> = {
  unanalyzed: "미분석",
  quick_partial: "빠른 분석 일부",
  quick_complete: "빠른 분석 완료",
  queued: "분석 대기",
  limited: "분석 제한됨"
};

export function getPlanSearchUxStatus(plan: OrchestrationPlan): SearchUxStatus {
  if (plan.phase === "coarse_partial") return "quick_partial";
  if (plan.phase === "coarse_ready") return "quick_complete";
  return "unanalyzed";
}

export function getCandidateSearchUxStatus(
  candidate: PlannedCandidate,
  coarseRuntimeAllowed: boolean
): SearchUxStatus {
  if (candidate.coarse_state === "cached_ready") return "quick_complete";
  if (candidate.coarse_state === "pending_live") return coarseRuntimeAllowed ? "queued" : "limited";
  return "unanalyzed";
}
