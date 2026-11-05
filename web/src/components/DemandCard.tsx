import type { MapPlaces } from "../lib/nationalData";

/** 시군구별 관광서비스 수요지수 — 사람이 몰리는 곳을 미리 보는 혼잡도 참고 지표. */
export function DemandCard({ demand }: { demand: NonNullable<MapPlaces["demand"]> }) {
  const rows = demand.rows.slice(0, 5);
  const max = Math.max(...demand.rows.map((row) => row.value), demand.areaTotal ?? 0);
  return (
    <section className="demand-card" aria-labelledby="demand-card-heading">
      <h3 id="demand-card-heading">관광 수요 높은 시군구</h3>
      <p className="demand-note">
        {demand.baseYm.slice(0, 4)}년 {Number(demand.baseYm.slice(4))}월 {demand.areaName} 관광서비스 수요지수 ·
        높을수록 사람이 많이 몰려요
      </p>
      <ol>
        {rows.map((row) => (
          <li key={row.code}>
            <span className="demand-rank">{row.rank}</span>
            <span className="demand-name">{row.name}</span>
            <span className="demand-bar" aria-hidden="true">
              <span style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            <span className="demand-value">{row.value.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <p className="nsp-source">출처: 한국관광공사 한국관광데이터랩 관광수요지수.</p>
    </section>
  );
}
