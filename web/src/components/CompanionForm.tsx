import { useState } from "react";
import { AGE_GROUPS, AGE_GROUP_LABELS, type AgeGroup, type Gender, type Person } from "../lib/types";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";

interface Props {
  onSubmit: (people: Person[], safetyFilters: SafetyDisplayFilters) => void;
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

export function CompanionForm({ onSubmit }: Props) {
  const [skipSelf, setSkipSelf] = useState(false);
  const [self, setSelf] = useState<Person>({ gender: "F", ageGroup: "20s" });
  const [companions, setCompanions] = useState<Person[]>([]);
  const [withChildren, setWithChildren] = useState(false);
  const [nightPlan, setNightPlan] = useState(false);

  const people = skipSelf ? companions : [self, ...companions];
  const withElderly = people.some((p) => p.ageGroup === "60plus");

  return (
    <form
      className="companion-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(people, { withChildren, withElderly, nightPlan });
      }}
    >
      <h2>누구와 떠나나요?</h2>

      <label className="skip-self">
        <input type="checkbox" checked={skipSelf} onChange={(e) => setSkipSelf(e.target.checked)} />
        성별·연령대 입력하지 않음 (전체 인기 기준으로 추천)
      </label>

      {!skipSelf && (
        <div className="field-group">
          <span className="field-label">나</span>
          <PersonPicker person={self} onChange={setSelf} removable={false} />
        </div>
      )}

      <div className="field-group">
        <span className="field-label">동행자</span>
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

      <div className="field-group checkboxes">
        <label>
          <input type="checkbox" checked={withChildren} onChange={(e) => setWithChildren(e.target.checked)} />
          아이 동반
        </label>
        <label>
          <input type="checkbox" checked={nightPlan} onChange={(e) => setNightPlan(e.target.checked)} />
          야간 일정 있음
        </label>
        {withElderly && <span className="auto-badge">고령자 동반 감지됨 — 응급 접근성 우선 표시</span>}
      </div>

      <button type="submit" className="submit-btn" disabled={people.length === 0}>
        추천받기
      </button>
    </form>
  );
}
