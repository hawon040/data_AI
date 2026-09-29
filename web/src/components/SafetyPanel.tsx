import { orderedSafetyIndicators, type SafetyDisplayFilters } from "../lib/safetyPriority";
import type { Region } from "../lib/types";

export function SafetyPanel({
  region,
  filters,
}: {
  region: Region;
  filters: SafetyDisplayFilters;
}) {
  const rows = orderedSafetyIndicators(region.safety, filters);

  return (
    <div className="safety-panel">
      <h3>{region.name} 안전 정보</h3>
      <div className="grade-row">
        <span className={`safety-badge grade-${region.safety.grade}`}>등급 {region.safety.grade}</span>
        <span className="rate">
          위해지수 {region.safety.ratePer100k.toFixed(1)}
          <span className="ci">
            (90% 구간 {region.safety.confidenceIntervalLow.toFixed(1)}–{region.safety.confidenceIntervalHigh.toFixed(1)})
          </span>
        </span>
      </div>

      <ul className="indicator-list">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="label">{row.label}</span>
            <span className="value">{row.value}</span>
          </li>
        ))}
      </ul>

      <p className="disclaimer">
        이 등급은 지역 평균이며 특정 장소나 개인의 위험을 뜻하지 않습니다. 안전도는 추천 순위에
        영향을 주지 않습니다.
      </p>
    </div>
  );
}
