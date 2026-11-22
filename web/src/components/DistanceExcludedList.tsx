import { formatDistance, type DistanceExclusion } from "../lib/origin";

/** 도보·자전거 거리 기준 때문에 추천에서 빠진 관광지를 접어서 보여 준다(날씨 제외 목록과 같은 모양). */
export function DistanceExcludedList({ items, limitKm }: { items: DistanceExclusion[]; limitKm: number | null }) {
  if (items.length === 0) return null;
  return (
    <details className="weather-excluded">
      <summary>거리 때문에 제외된 곳 {items.length}곳</summary>
      <ul>
        {items.map((item) => (
          <li key={`${item.regionCode}-${item.attraction.name}`}>
            <strong>{item.attraction.name}</strong>
            <span className="weather-excluded-region">{item.regionName}</span>
            <span className="weather-excluded-reason">
              {formatDistance(item.km)}{limitKm != null && ` → ${limitKm}km 초과`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
