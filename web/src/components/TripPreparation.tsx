import { TRANSPORT_OPTIONS, type TripPreferences } from "../lib/tripPreferences";
import type { Checklist } from "../lib/checklist";

/** 여행 준비물 체크리스트 — 공통 → 지역 → 관광지 3단계 (lib/checklist.ts의 buildChecklist 결과를 그린다) */
export function TripPreparation({ preferences, checklist }: { preferences: TripPreferences; checklist: Checklist }) {
  const transport = TRANSPORT_OPTIONS.find((option) => option.value === preferences.transport)?.label ?? "";

  return (
    <section className="trip-preparation" aria-labelledby="trip-preparation-heading">
      <div className="trip-preparation-heading">
        <div>
          <p className="field-label">여행 체크리스트 · 참고용</p>
          <h3 id="trip-preparation-heading">
            {preferences.duration === "day" ? "당일치기" : "1박 이상"} 준비
            {checklist.scopeLabel && <span className="scope-chip">{checklist.scopeLabel}</span>}
          </h3>
        </div>
        <span className="transport-chip">{transport} 기준</span>
      </div>
      {checklist.sections.map((section, index) => (
        <div key={section.title} className="trip-preparation-section">
          {checklist.sections.length > 1 && (
            <p className="trip-preparation-section-title">{index === 0 ? "공통" : section.title}</p>
          )}
          <ul>
            {section.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      ))}
      {checklist.hint && <p className="trip-preparation-hint">{checklist.hint}</p>}
      <p className="trip-preparation-note">
        준비물과 이동 정보는 일반 안내예요. 운영 시간·교통편·날씨를 출발 전에 다시 확인해 주세요.
      </p>
    </section>
  );
}
