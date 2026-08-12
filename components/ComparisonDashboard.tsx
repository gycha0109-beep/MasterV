import type { CrossVideoCoverageMetric, ReferenceComparisonResult } from "@/lib/reference-compare";

function formatSeconds(value: number | null) {
  return value === null ? "확인 불가" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
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
      {items.slice(0, 6).map((item) => (
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

export function ComparisonDashboard({ comparison }: { comparison: ReferenceComparisonResult }) {
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
