import { useState } from "react";
import { getUsageConsent, sendUsageEvent, type UsageResult } from "../lib/usageApi";
import { AGE_GROUP_LABELS, type Person } from "../lib/types";

const RESULT_MESSAGE: Record<UsageResult, string> = {
  saved: "기록했어요. 다음 추천에 반영돼요.",
  duplicate: "오늘은 이미 이 관광지를 평가했어요.",
  skipped: "기록에 참여하지 않아 저장하지 않았어요.",
  limited: "요청이 많아 잠시 후 다시 시도해 주세요.",
  unavailable: "지금은 기록을 저장할 수 없어요.",
};

const personLabel = (person: Person) => `${AGE_GROUP_LABELS[person.ageGroup]} ${person.gender === "F" ? "여성" : "남성"}`;

/** 다녀온 뒤 별점(1~5)을 남기는 칸. 동의한 사용자에게만 보인다. */
export function RatingBox({ people, regionCode, attraction }: { people: Person[]; regionCode: string; attraction: string }) {
  const [who, setWho] = useState(0);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (people.length === 0 || getUsageConsent() !== "agreed") return null;

  const submit = async () => {
    if (score === 0 || sending) return;
    setSending(true);
    const result = await sendUsageEvent({
      kind: "rating", regionCode, attraction, person: people[who], personIndex: who, score,
    });
    setMessage(RESULT_MESSAGE[result]);
    setSending(false);
  };

  return (
    <div className="rating-box">
      <p className="rb-title">다녀왔다면 평가해 주세요</p>
      {people.length > 1 && (
        <label className="rb-who">
          평가하는 사람
          <select value={who} onChange={(event) => setWho(Number(event.target.value))}>
            {people.map((person, index) => (
              <option key={index} value={index}>{personLabel(person)}</option>
            ))}
          </select>
        </label>
      )}
      <div className="rb-stars" role="radiogroup" aria-label="별점">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            aria-label={`${value}점`}
            className={value <= score ? "on" : ""}
            onClick={() => setScore(value)}
          >
            ★
          </button>
        ))}
      </div>
      <button type="button" className="pill-mini" disabled={score === 0 || sending} onClick={submit}>
        평가 보내기
      </button>
      {message && <p className="ad-hint" role="status">{message}</p>}
    </div>
  );
}
