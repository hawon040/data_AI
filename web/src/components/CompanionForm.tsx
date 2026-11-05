import { useState } from "react";
import { AGE_GROUPS, AGE_GROUP_LABELS, type AgeGroup, type Gender, type Person, type Region } from "../lib/types";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import {
  getSeason,
  PURPOSE_OPTIONS,
  SEASON_LABELS,
  STYLE_OPTIONS,
  TRANSPORT_OPTIONS,
  type TripPreferences,
} from "../lib/tripPreferences";

interface Props {
  onSubmit: (people: Person[], safetyFilters: SafetyDisplayFilters) => void;
  regions: Region[];
  /** 전국 데이터에 있는 시도 목록 — 맞춤 추천 시범 지역이 없는 시도도 지도에서 볼 수 있게 한다. */
  provinces?: string[];
  preferences: TripPreferences;
  onPreferencesChange: (preferences: TripPreferences) => void;
}

function PersonPicker({
  person,
  onChange,
  onRemove,
  removable,
}: {
  person: Person;
  onChange: (p: Person) => void;
  onRemove?: () => void;
  removable: boolean;
}) {
  return (
    <div className="person-picker">
      <select
        value={person.gender}
        onChange={(e) => onChange({ ...person, gender: e.target.value as Gender })}
      >
        <option value="F">여성</option>
        <option value="M">남성</option>
      </select>
      <select
        value={person.ageGroup}
        onChange={(e) => onChange({ ...person, ageGroup: e.target.value as AgeGroup })}
      >
        {AGE_GROUPS.map((ag) => (
          <option key={ag} value={ag}>
            {AGE_GROUP_LABELS[ag]}
          </option>
        ))}
      </select>
      {removable && (
        <button type="button" className="remove-btn" onClick={onRemove} aria-label="동행자 삭제">
          ×
        </button>
      )}
    </div>
  );
}

export function CompanionForm({ onSubmit, regions, provinces: allProvinces = [], preferences, onPreferencesChange }: Props) {
  const [skipSelf, setSkipSelf] = useState(false);
  const [self, setSelf] = useState<Person>({ gender: "F", ageGroup: "20s" });
  const [companions, setCompanions] = useState<Person[]>([]);
  const [withChildren, setWithChildren] = useState(false);
  const [nightPlan, setNightPlan] = useState(false);

  const people = skipSelf ? companions : [self, ...companions];
  const withElderly = people.some((p) => p.ageGroup === "60plus");
  const provinces = [...new Set([...allProvinces, ...regions.map((region) => region.province)])];
  const pilotProvinces = new Set(regions.map((region) => region.province));
  const availableRegions = regions.filter(
    (region) => preferences.province === "all" || region.province === preferences.province,
  );
  const season = getSeason(preferences.month);

  function updatePreference<K extends keyof TripPreferences>(key: K, value: TripPreferences[K]) {
    onPreferencesChange({
      ...preferences,
      [key]: value,
      ...(key === "province" ? { regionCode: "all" } : {}),
    });
  }

  return (
    <form
      className="companion-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(people, { withChildren, withElderly, nightPlan });
      }}
    >
      <h2>누구와 떠나나요?</h2>

      <div className="companion-form-body">
        <section className="companion-form-conditions" aria-labelledby="trip-conditions-heading">
          <h3 className="form-section-title" id="trip-conditions-heading">여행 조건</h3>
          <div className="travel-filter-grid">
            <label>
              <span className="field-title">
                여행 월
                <span className="season-indicator" data-season={season}>{SEASON_LABELS[season]} 테마</span>
              </span>
              <select
                id="travel-month"
                value={preferences.month}
                onChange={(e) => updatePreference("month", Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <option key={month} value={month}>{month}월</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-title">여행 목적</span>
              <select value={preferences.purpose} onChange={(e) => updatePreference("purpose", e.target.value as TripPreferences["purpose"])}>
                {PURPOSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="field-title">여행 스타일</span>
              <select value={preferences.style} onChange={(e) => updatePreference("style", e.target.value as TripPreferences["style"])}>
                {STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="field-title">도</span>
              <select value={preferences.province} onChange={(e) => updatePreference("province", e.target.value)}>
                <option value="all">전국</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}{pilotProvinces.has(province) ? " · 맞춤 추천" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-title">시·군·구</span>
              <select value={preferences.regionCode} onChange={(e) => updatePreference("regionCode", e.target.value)}>
                <option value="all">전체</option>
                {availableRegions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}
              </select>
            </label>
            <label>
              <span className="field-title">교통편</span>
              <select value={preferences.transport} onChange={(e) => updatePreference("transport", e.target.value as TripPreferences["transport"])}>
                {TRANSPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="field-title">추천 순서</span>
              <select value={preferences.ranking} onChange={(e) => updatePreference("ranking", e.target.value as TripPreferences["ranking"])}>
                <option value="companion">연령대·동행 선호</option>
                <option value="popular">전체 인기 순</option>
              </select>
            </label>
            <fieldset className="duration-field">
              <legend className="field-title">여행 일정</legend>
              <div className="segmented">
                <label>
                  <input type="radio" name="trip-duration" checked={preferences.duration === "day"} onChange={() => updatePreference("duration", "day")} />
                  <span>당일치기</span>
                </label>
                <label>
                  <input type="radio" name="trip-duration" checked={preferences.duration === "overnight"} onChange={() => updatePreference("duration", "overnight")} />
                  <span>1박 이상</span>
                </label>
              </div>
            </fieldset>
          </div>
          <p className="form-hint" title="맞춤 추천은 시범 지역(충남·충북·강원)만 제공하고, 지도에는 전국 관광지·대피소를 보여줘요.">
            <span aria-hidden="true">i</span>
            맞춤 추천 <strong>충남·충북·강원</strong> · 지도는 <strong>전국</strong>
          </p>
        </section>

        <section className="companion-form-people" aria-labelledby="trip-people-heading">
          <h3 className="form-section-title" id="trip-people-heading">동행 정보</h3>
          <div className="people-row">
            {!skipSelf && (
              <div className="self-field">
                <span className="field-title">나</span>
                <PersonPicker person={self} onChange={setSelf} removable={false} />
              </div>
            )}
            <div className="companions-field">
              <span className="field-title">동행자 {companions.length > 0 && `${companions.length}명`}</span>
              <div className="companion-list">
                {companions.map((c, i) => (
                  <PersonPicker
                    key={i}
                    person={c}
                    removable
                    onChange={(p) => setCompanions(companions.map((c2, j) => (i === j ? p : c2)))}
                    onRemove={() => setCompanions(companions.filter((_, j) => j !== i))}
                  />
                ))}
                <button
                  type="button"
                  className="add-companion"
                  onClick={() => setCompanions([...companions, { gender: "M", ageGroup: "20s" }])}
                >
                  + 동행자 추가
                </button>
              </div>
            </div>
          </div>

          <div className="checkboxes">
            <label>
              <input type="checkbox" checked={skipSelf} onChange={(e) => setSkipSelf(e.target.checked)} />
              내 성별·연령 생략
            </label>
            <label>
              <input type="checkbox" checked={withChildren} onChange={(e) => setWithChildren(e.target.checked)} />
              아이 동반
            </label>
            <label>
              <input type="checkbox" checked={nightPlan} onChange={(e) => setNightPlan(e.target.checked)} />
              야간 일정
            </label>
          </div>
          {withElderly && <p className="auto-badge">고령자 동반 감지됨 — 응급 접근성 우선 표시</p>}

          <button type="submit" className="submit-btn" disabled={people.length === 0}>
            추천받기
          </button>
        </section>
      </div>
    </form>
  );
}
