import { getPreparationTips, type TripPreferences } from "../lib/tripPreferences";
import type { Attraction } from "../lib/types";

export function TripPreparation({
  attraction,
  preferences,
}: {
  attraction: Attraction;
  preferences: TripPreferences;
}) {
  const tips = getPreparationTips(attraction, preferences);
  const transport = {
    "public-transit": "대중교통",
    "tour-bus": "관광버스",
    car: "자가용",
    walking: "도보·자전거",
  }[preferences.transport];

  return (
    <section className="trip-preparation" aria-labelledby="trip-preparation-heading">
      <div className="trip-preparation-heading">
        <div>
          <p className="field-label">여행 체크리스트 · 참고용</p>
          <h3 id="trip-preparation-heading">{preferences.duration === "day" ? "당일치기" : "1박 이상"} 준비</h3>
        </div>
        <span className="transport-chip">{transport} 기준</span>
      </div>
      <ul>
        {tips.map((tip) => <li key={tip}>{tip}</li>)}
      </ul>
      <p className="trip-preparation-note">
        준비물과 이동 정보는 일반 안내예요. 운영 시간·교통편·날씨를 출발 전에 다시 확인해 주세요.
      </p>
    </section>
  );
}
