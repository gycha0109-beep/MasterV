import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { CoverageMetric, DerivedVideoMetrics } from "@/lib/derived-metrics";

function formatSeconds(value: number | null) {
  return value === null ? "확인 불가" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}초`;
}

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function CoverageBars({ items, emptyText }: { items: CoverageMetric[]; emptyText: string }) {
  if (items.length === 0) return <p className="muted-copy">{emptyText}</p>;

  return (
    <div className="coverage-list">
      {items.slice(0, 6).map((item) => (
        <div className="coverage-row" key={item.name}>
          <div className="coverage-label">
            <strong>{item.name}</strong>
            <span>{item.seconds}초 · {item.segment_count}구간</span>
          </div>
          <div className="coverage-track" aria-label={`${item.name} ${item.percent}%`}>
            <span style={{ width: `${Math.min(100, item.percent)}%` }} />
          </div>
          <b>{formatPercent(item.percent)}</b>
        </div>
      ))}
    </div>
  );
}

export function AdvancedAnalysis({ analysis, metrics }: { analysis: VideoAnalysis; metrics: DerivedVideoMetrics }) {
  return (
    <section className="advanced-analysis-shell" id="advanced-analysis">
      <div className="advanced-analysis-heading">
        <div>
          <span className="section-kicker">상세 분석</span>
          <h2>분석 근거와 세부 지표</h2>
          <p>기본 화면에서 숨긴 원시 관찰·비율·주장/근거·대본을 확인합니다.</p>
        </div>
        <span>고급 보기</span>
      </div>

      <section className="stat-grid metric-stat-grid">
        <article className="stat-card emphasis-card"><span>상품 첫 등장</span><strong>{formatSeconds(metrics.product.first_seen_seconds)}</strong><small>판매 제품 관찰 구간 기준</small></article>
        <article className="stat-card"><span>상품 노출</span><strong>{formatPercent(metrics.product.visible_percent)}</strong><small>{metrics.product.visible_seconds}초 · {metrics.product.segment_count}구간</small></article>
        <article className="stat-card"><span>사용 / 시연</span><strong>{formatPercent(metrics.demonstration.combined_percent)}</strong><small>{metrics.demonstration.combined_seconds}초 · {metrics.demonstration.combined_segment_count}구간</small></article>
        <article className="stat-card"><span>CTA 시작</span><strong>{formatSeconds(metrics.cta.first_seen_seconds)}</strong><small>{metrics.cta.segment_count}구간</small></article>
      </section>

      <section className="first-three-panel panel">
        <div className="panel-heading"><div><span className="section-kicker">첫 3초</span><h3>시작을 무엇으로 만들었나</h3></div><span>판매 제품 {metrics.first_three_seconds.product_visible ? "등장" : "미등장"}</span></div>
        <div className="first-three-grid">
          <div className="first-three-main">
            <div className="big-signal"><span>첫 행동</span><strong>{metrics.first_three_seconds.actions.join(" · ") || "확인 불가"}</strong></div>
            <div className="chip-group">{metrics.first_three_seconds.message_roles.slice(0, 5).map((item) => <span key={item.name}>{item.name}</span>)}</div>
          </div>
          <div><span className="mini-title">화면 소재</span><CoverageBars items={metrics.first_three_seconds.materials} emptyText="분류된 소재가 없습니다." /></div>
          <div><span className="mini-title">출연 요소</span><CoverageBars items={metrics.first_three_seconds.presenters} emptyText="출연 요소가 없습니다." /></div>
        </div>
      </section>

      <section className="two-column analysis-columns">
        <article className="panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">화면 구성</span><h3>무엇을 갖다 썼나</h3></div><span>복수 소재 동시 집계</span></div><CoverageBars items={metrics.materials} emptyText="화면 소재를 집계하지 못했습니다." /></article>
        <article className="panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">출연 방식</span><h3>누가 화면에 나오나</h3></div></div><CoverageBars items={metrics.presenters} emptyText="출연 요소를 집계하지 못했습니다." /></article>
      </section>

      <section className="three-column">
        <article className="panel compact-metric-panel"><span className="section-kicker">제품 사용</span><strong>{metrics.demonstration.direct_use_segment_count}회</strong><p>{metrics.demonstration.direct_use_seconds}초 동안 실제 사용·섭취·착용</p></article>
        <article className="panel compact-metric-panel"><span className="section-kicker">기능 시연</span><strong>{metrics.demonstration.direct_demo_segment_count}회</strong><p>{metrics.demonstration.direct_demo_seconds}초 동안 기능·작동을 직접 보여줌</p></article>
        <article className="panel compact-metric-panel"><span className="section-kicker">판매 제품 결과</span><strong>{metrics.demonstration.visually_observable_result_segment_count}회</strong><p>{metrics.demonstration.visually_observable_result_seconds}초 동안 판매 제품에서 직접 확인되는 결과</p></article>
      </section>

      {metrics.demonstration.contextual_or_comparison_result_segment_count > 0 && (
        <section className="confidence-box">
          <strong>비교·예시 결과 별도 집계</strong>
          <span>• 판매 제품 성능으로 합산하지 않은 결과 장면 {metrics.demonstration.contextual_or_comparison_result_segment_count}개 · {metrics.demonstration.contextual_or_comparison_result_seconds}초</span>
        </section>
      )}

      <section className="two-column analysis-columns">
        <article className="panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">메시지 역할</span><h3>무슨 일을 하는 구간이 많나</h3></div></div><CoverageBars items={metrics.message_roles} emptyText="메시지 역할을 집계하지 못했습니다." /></article>
        <article className="panel evidence-panel">
          <div className="panel-heading compact-heading"><div><span className="section-kicker">주장과 근거</span><h3>말한 것과 보여준 것 분리</h3></div></div>
          <div className="evidence-summary">
            <div><span>주장</span><strong>{metrics.claims_and_evidence.claim_count}개</strong></div>
            <div><span>주장 포함 구간</span><strong>{metrics.claims_and_evidence.claim_segment_count}</strong></div>
            <div className={metrics.claims_and_evidence.claim_segments_with_no_evidence > 0 ? "warning-number" : ""}><span>화면상 근거 없음</span><strong>{metrics.claims_and_evidence.claim_segments_with_no_evidence}</strong></div>
            <div><span>판매 제품 결과 직접 확인</span><strong>{metrics.claims_and_evidence.claim_segments_with_visually_observable_result}</strong></div>
          </div>
          <CoverageBars items={metrics.claims_and_evidence.evidence_types} emptyText="근거 유형을 집계하지 못했습니다." />
          <div style={{ marginTop: 20 }}>
            <span className="mini-title">근거 적용 범위</span>
            <CoverageBars items={metrics.claims_and_evidence.evidence_scopes} emptyText="근거 범위를 집계하지 못했습니다." />
          </div>
        </article>
      </section>

      <section className="panel observation-panel">
        <div className="panel-heading"><div><span className="section-kicker">시간순 역설계</span><h3>실제로 무엇을 어떤 순서로 배치했나</h3></div><span>{analysis.observation_segments.length}개 관찰 구간</span></div>
        <div className="observation-list">
          {analysis.observation_segments.map((segment, index) => (
            <article className="observation-row" key={`${segment.start_seconds}-${index}`}>
              <div className="observation-time"><strong>{segment.start_seconds}–{segment.end_seconds}</strong><span>초</span></div>
              <div className="observation-body">
                <div className="observation-title-row"><strong>{segment.scene_purpose}</strong><span className={`confidence-pill confidence-${segment.confidence}`}>{segment.confidence}</span></div>
                <p>{segment.visual.description}</p>
                <div className="chip-group soft-chips"><span>{segment.visual.subject_role}</span>{segment.visual.material_types.map((item) => <span key={item}>{item}</span>)}{segment.message_roles.map((item) => <span key={item}>{item}</span>)}</div>
                {segment.action.description && <small>{segment.action.type}: {segment.action.description}</small>}
              </div>
              <div className="observation-evidence">
                <span className="mini-title">주장 / 근거</span>
                {segment.claims.length > 0 ? <ul>{segment.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul> : <p className="muted-copy">명시적 주장 없음</p>}
                <div className="chip-group evidence-chips"><span>{segment.evidence.scope}</span>{segment.evidence.types.map((type) => <span key={type}>{type}</span>)}</div>
                <small>판매 제품 주장 근거: {segment.evidence.supports_selling_product_claim ? "예" : "아니오"}</small>
                {segment.evidence.observable_result && <small>관찰 결과: {segment.evidence.observable_result}</small>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel scene-panel secondary-analysis">
        <div className="panel-heading"><div><span className="section-kicker">내용 흐름</span><h3>의미 단락으로 요약</h3></div><span>{analysis.scenes.length}개 단락</span></div>
        <div className="scene-table-wrap"><table><thead><tr><th>시간</th><th>화면</th><th>음성 / 자막</th><th>역할</th></tr></thead><tbody>{analysis.scenes.map((scene, index) => <tr key={`${scene.start_seconds}-${index}`}><td>{scene.start_seconds}~{scene.end_seconds}초</td><td>{scene.visual}</td><td><b>{scene.spoken_text || "발화 없음"}</b><span>{scene.on_screen_text || "화면 글자 없음"}</span></td><td><span className="purpose-chip">{scene.purpose}</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="panel transcript-panel secondary-analysis"><div className="panel-heading"><div><span className="section-kicker">전체 대본</span><h3>영상에서 실제로 들린 내용</h3></div></div><p>{analysis.transcript.full || "명확한 음성 대본을 추출하지 못했습니다."}</p></section>

      {analysis.confidence_notes.length > 0 && <section className="confidence-box"><strong>분석 시 주의할 점</strong>{analysis.confidence_notes.map((note) => <span key={note}>• {note}</span>)}</section>}
    </section>
  );
}