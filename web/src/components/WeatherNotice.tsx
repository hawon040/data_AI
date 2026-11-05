import type { WeatherDecision } from "../lib/weatherRules";

export function WeatherNotice({ decision, weatherLabel }: { decision: WeatherDecision; weatherLabel: string }) {
  const mode = decision.indoorOnly
    ? "실내 위주로 추천해요"
    : decision.excludedTerrains.length > 0
      ? "바다·산·계곡을 빼고 추천해요"
      : "실내·야외를 함께 추천해요";

  return (
    <section
      className={`weather-notice${decision.indoorOnly || decision.excludedTerrains.length > 0 ? " is-caution" : ""}`}
      aria-labelledby="weather-notice-heading"
    >
      <p className="field-label">방문일 날씨 · {weatherLabel} (시연용)</p>
      <h3 id="weather-notice-heading">{mode}</h3>
      {decision.reasons.length > 0 && (
        <ul>
          {decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      {decision.notices.map((notice) => (
        <p key={notice} className="weather-notice-note">{notice}</p>
      ))}
    </section>
  );
}
