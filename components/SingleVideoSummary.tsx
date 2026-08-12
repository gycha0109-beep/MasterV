import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { DerivedVideoMetrics } from "@/lib/derived-metrics";

type Props = {
  analysis: VideoAnalysis;
  metrics: DerivedVideoMetrics;
  currentSaved: boolean;
  promptOpen: boolean;
  detailsOpen: boolean;
  onSave: () => void;
  onTogglePrompt: () => void;
  onToggleDetails: () => void;
};

function formatSeconds(value: number | null) {
  return value === null ? "확인 불가" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function demoLabel(percent: number) {
  if (percent >= 45) return "시연 중심";
  if (percent >= 15) return "시연 포함";
  return "설명 중심";
}

function buildTakeaways(analysis: VideoAnalysis, metrics: DerivedVideoMetrics) {
  const positive: string[] = [];
  const firstRoles = metrics.first_three_seconds.message_roles.map((item) => item.name).join(" ");
  const topMaterial = metrics.materials[0];

  if (/문제/.test(firstRoles)) {
    positive.push("첫 부분에서 사용자의 문제나 불편을 먼저 보여줍니다.");
  }
  if (metrics.product.first_seen_seconds !== null && metrics.product.first_seen_seconds <= 3) {
    positive.push("상품이 초반 3초 안에 등장해 무엇을 소개하는지 빠르게 알 수 있습니다.");
  }
  if (metrics.demonstration.combined_percent >= 45) {
    positive.push("설명보다 실제 사용이나 기능 시연을 보여주는 비중이 높은 영상입니다.");
  } else if (metrics.demonstration.combined_segment_count >= 2) {
    positive.push("설명 사이에 실제 사용이나 기능 시연을 반복해서 끼워 넣습니다.");
  }
  if (metrics.demonstration.direct_demo_segment_count >= 3) {
    positive.push("제품 특징을 하나의 긴 설명이 아니라 여러 개의 짧은 시연 장면으로 나눠 보여줍니다.");
  }
  if (topMaterial?.name === "직접촬영" && topMaterial.percent >= 50) {
    positive.push("상품 페이지보다 직접 촬영한 화면을 중심 소재로 사용합니다.");
  }
  if (metrics.demonstration.visually_observable_result_segment_count >= 2) {
    positive.push("말로만 설명하지 않고 화면에서 직접 확인되는 결과 장면을 여러 번 배치합니다.");
  }

  if (positive.length < 3) {
    positive.push(`전체 흐름은 ${analysis.structure_label} 순서로 진행됩니다.`);
  }

  const warning = metrics.claims_and_evidence.claim_segments_with_no_evidence > 0
    ? `일부 주장 ${metrics.claims_and_evidence.claim_segments_with_no_evidence}개 구간은 이 영상 화면만으로 근거를 확인하기 어렵습니다.`
    : null;

  return { positive: positive.slice(0, 4), warning };
}

export function SingleVideoSummary({
  analysis,
  metrics,
  currentSaved,
  promptOpen,
  detailsOpen,
  onSave,
  onTogglePrompt,
  onToggleDetails
}: Props) {
  const topMaterial = metrics.materials[0]?.name;
  const topPresenter = metrics.presenters[0]?.name;
  const firstThree =
    metrics.first_three_seconds.message_roles.slice(0, 2).map((item) => item.name).join(" → ") ||
    metrics.first_three_seconds.actions.slice(0, 2).join(" → ") ||
    "시작 방식 확인 필요";
  const takeaways = buildTakeaways(analysis, metrics);
  const timeline = analysis.observation_segments.slice(0, 8);
  const hiddenCount = Math.max(0, analysis.observation_segments.length - timeline.length);
  const duration = analysis.duration_seconds ?? metrics.basis_duration_seconds;
  const badges = [
    topMaterial,
    topPresenter ? `${topPresenter} 중심` : null,
    demoLabel(metrics.demonstration.combined_percent),
    `${Math.round(duration)}초`
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="single-summary">
      <section className="simple-hero">
        <div className="simple-hero-copy">
          <span className="section-kicker">이 영상은 이렇게 만들었습니다</span>
          <h2>{analysis.summary}</h2>
          <div className="summary-badges">
            {badges.map((badge) => <span key={badge}>{badge}</span>)}
          </div>
        </div>
        <div className="summary-signals">
          <div><span>첫 3초</span><strong>{firstThree}</strong></div>
          <div><span>상품 첫 등장</span><strong>{formatSeconds(metrics.product.first_seen_seconds)}</strong></div>
          <div><span>CTA</span><strong>{formatSeconds(metrics.cta.first_seen_seconds)}</strong></div>
        </div>
      </section>

      <section className="simple-grid">
        <article className="panel compact-timeline-panel">
          <div className="simple-section-heading">
            <div><span className="section-kicker">영상 구성</span><h3>어떤 순서로 만들었나</h3></div>
            <small>{analysis.observation_segments.length}개 관찰 구간</small>
          </div>
          <div className="recipe-list">
            {timeline.map((segment, index) => {
              const role = segment.message_roles[0] || segment.action.type;
              return (
                <div className="recipe-row" key={`${segment.start_seconds}-${index}`}>
                  <span className="recipe-time">{segment.start_seconds}–{segment.end_seconds}초</span>
                  <div>
                    <strong>{role}</strong>
                    <p>{segment.visual.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && <p className="detail-hint">상세 분석에서 {hiddenCount}개 구간을 더 볼 수 있습니다.</p>}
        </article>

        <article className="panel takeaways-panel">
          <div className="simple-section-heading">
            <div><span className="section-kicker">참고할 점</span><h3>이 영상에서 가져갈 만한 것</h3></div>
          </div>
          <div className="takeaway-list">
            {takeaways.positive.map((item) => (
              <div className="takeaway-item" key={item}><span>✓</span><p>{item}</p></div>
            ))}
            {takeaways.warning && (
              <div className="takeaway-item takeaway-warning"><span>!</span><p>{takeaways.warning}</p></div>
            )}
          </div>
        </article>
      </section>

      <section className="summary-actions">
        <button className="primary-action" onClick={onSave} disabled={currentSaved}>
          {currentSaved ? "비교함에 저장됨" : "비교함에 저장"}
        </button>
        <button className="plain-action" onClick={onTogglePrompt}>
          {promptOpen ? "제작 프롬프트 닫기" : "이 영상만 참고해 제작 프롬프트"}
        </button>
        <button className="plain-action detail-action" onClick={onToggleDetails}>
          {detailsOpen ? "상세 분석 닫기" : "상세 분석 보기"}
        </button>
      </section>
    </div>
  );
}
