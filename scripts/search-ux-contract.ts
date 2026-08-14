import {
  SEARCH_UX_STATUS_LABELS,
  getCandidateSearchUxStatus,
  getPlanSearchUxStatus
} from "../lib/search-ux";
import type { OrchestrationPlan, PlannedCandidate, SearchCandidate } from "../lib/tiered-analysis";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const candidate: SearchCandidate = {
  source: "youtube",
  source_id: "yt:A",
  canonical_url: "https://www.youtube.com/watch?v=A",
  creator: "Creator A",
  native_metrics: { search_rank: 1 },
  source_metadata: {}
};

function planned(coarse_state: PlannedCandidate["coarse_state"]): PlannedCandidate {
  return { candidate, coarse_state };
}

function plan(phase: OrchestrationPlan["phase"]): OrchestrationPlan {
  return {
    query: "umbrella",
    phase,
    candidates: [],
    coarse_clusters: [],
    deep_representative_source_ids: [],
    coarse_live_batches: [],
    diagnostics: {
      candidate_count: 0,
      coarse_cached_count: 0,
      coarse_pending_live_count: 0,
      coarse_deferred_count: 0,
      coarse_runtime_allowed: false,
      deep_representative_count: 0,
      gemini_requests_executed: 0
    }
  };
}

assert(getPlanSearchUxStatus(plan("metadata_ready")) === "unanalyzed", "metadata phase must remain usable as unanalyzed results");
assert(getPlanSearchUxStatus(plan("coarse_partial")) === "quick_partial", "partial coarse evidence must surface as quick partial");
assert(getPlanSearchUxStatus(plan("coarse_ready")) === "quick_complete", "complete coarse evidence must surface as quick complete");
assert(getCandidateSearchUxStatus(planned("cached_ready"), false) === "quick_complete", "cached coarse must be shown as quick complete even while live runtime is blocked");
assert(getCandidateSearchUxStatus(planned("pending_live"), false) === "limited", "pending candidate under blocked quality gate must be shown as limited");
assert(getCandidateSearchUxStatus(planned("pending_live"), true) === "queued", "pending candidate under enabled runtime must be shown as queued");
assert(getCandidateSearchUxStatus(planned("deferred"), false) === "unanalyzed", "deferred candidate must remain unanalyzed");
assert(SEARCH_UX_STATUS_LABELS.limited === "분석 제한됨", "Korean limited status label mismatch");

console.log("SEARCH_UX_CONTRACT_PASS");
