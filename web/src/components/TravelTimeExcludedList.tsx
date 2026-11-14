import { formatDuration, type TravelTimeExclusion } from "../lib/travelTime";
import { formatKm } from "../lib/origin";

/** 최대 이동 시간 때문에 추천에서 빠진 관광지를 접어서 보여 준다(날씨·거리 제외 목록과 같은 모양). */
export function TravelTimeExcludedList({ items, maxHours }: { items: TravelTimeExclusion[]; maxHours: number | null }) {
  if (items.length === 0) return null;
  return (
    <details className="weather-excluded">
      <summary>이동 시간 때문에 제외된 곳 {items.length}곳</summary>
      <ul>
        {items.map((item) => (
          <li key={`${item.regionCode}-${item.attraction.name}`}>
            <strong>{item.attraction.name}</strong>
            <span className="weather-excluded-region">{item.regionName}</span>
            <span className="weather-excluded-reason">
              {formatKm(item.km)} · {formatDuration(item.hours)}{maxHours != null && ` → ${maxHours}시간 초과`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
