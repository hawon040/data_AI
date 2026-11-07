import type { WeatherExclusion } from "../lib/weatherExclusions";

/** 날씨 때문에 추천에서 빠진 관광지를 이유와 함께 접어서 보여 준다. */
export function WeatherExcludedList({ items }: { items: WeatherExclusion[] }) {
  if (items.length === 0) return null;
  return (
    <details className="weather-excluded">
      <summary>날씨 때문에 제외된 곳 {items.length}곳</summary>
      <ul>
        {items.map((item) => (
          <li key={`${item.regionCode}-${item.attraction.name}`}>
            <strong>{item.attraction.name}</strong>
            <span className="weather-excluded-region">{item.regionName}</span>
            <span className="weather-excluded-reason">{item.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
