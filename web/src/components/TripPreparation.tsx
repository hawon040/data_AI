import { getPreparationTips, type TripPreferences } from "../lib/tripPreferences";
import { mergeTips } from "../lib/preparationTips";
import type { Attraction } from "../lib/types";

export function TripPreparation({
  attraction,
  preferences,
  extraTips = [],
}: {
  attraction: Attraction;
  preferences: TripPreferences;
  /** 날씨·미세먼지·편의시설 등 실시간 정보로 더하는 안내 (lib/preparationTips.ts에서 겹침을 정리해 넘긴다) */
  extraTips?: string[];
}) {
  const tips = mergeTips(getPreparationTips(attraction, preferences), extraTips);
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
