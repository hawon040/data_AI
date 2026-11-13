import { getPreparationTips, TRANSPORT_OPTIONS, type TripPreferences } from "../lib/tripPreferences";
import { CHECKLIST_HINT, mergeTips, type TipGroup } from "../lib/preparationTips";
import type { Attraction } from "../lib/types";

export function TripPreparation({
  attraction,
  preferences,
  extraTips = [],
}: {
  attraction: Attraction;
  preferences: TripPreferences;
  /** 날씨·미세먼지·편의시설 등 실시간 정보로 더하는 안내 (lib/preparationTips.ts에서 겹침을 정리해 넘긴다) */
  extraTips?: (string | TipGroup)[];
}) {
  const tips = mergeTips(getPreparationTips(attraction, preferences), extraTips);
  const transport = TRANSPORT_OPTIONS.find((option) => option.value === preferences.transport)?.label ?? "";

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

/** 추천을 받았지만 관광지를 아직 고르지 않았을 때 체크리스트 자리에 보이는 안내 */
export function TripPreparationHint() {
  return (
    <section className="trip-preparation is-hint" aria-label="여행 체크리스트 안내">
      <p className="field-label">여행 체크리스트 · 참고용</p>
      <p className="trip-preparation-hint">{CHECKLIST_HINT}</p>
    </section>
  );
}
