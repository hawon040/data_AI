import { useEffect, useMemo, useRef, useState } from "react";
import {
  GRADE_LABEL,
  buildCandidatePool,
  candidateKey,
  pickFresh,
  projectToBoard,
  tripReason,
  type TripCandidate,
} from "../lib/randomTrip";
import type { Attraction, Person, Region } from "../lib/types";
import "./RandomTripPicker.css";

type Phase = "idle" | "throwing" | "done";

const THROW_MS = 900;

function throwDuration(): number {
  // 모션 줄이기 설정을 켠 사용자는 애니메이션 없이 거의 바로 결과를 본다.
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 150 : THROW_MS;
}

export function RandomTripPicker({
  regions,
  people,
  onPick,
}: {
  regions: Region[];
  /** 동행자 정보 — 비어 있으면 인기 지표만으로 가중치를 준다. */
  people: Person[];
  /** 뽑힌 결과를 지도·상세 패널에 반영하기 위한 콜백. */
  onPick: (region: Region, attraction: Attraction) => void;
}) {
  const [maxGrade, setMaxGrade] = useState(2);
  const [province, setProvince] = useState("all");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<TripCandidate | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const provinces = useMemo(() => [...new Set(regions.map((r) => r.province))], [regions]);
  const pool = useMemo(
    () => buildCandidatePool(regions, people, { maxGrade, province }),
    [regions, people, maxGrade, province],
  );
  const positions = useMemo(() => projectToBoard(pool), [pool]);

  const resetResult = () => {
    window.clearTimeout(timer.current);
    setPhase("idle");
    setResult(null);
    setSeen(new Set());
  };

  const throwPen = () => {
    if (phase === "throwing") return;
    const picked = pickFresh(pool, seen);
    if (!picked) return;
    setResult(picked);
    setSeen((prev) => new Set(prev).add(candidateKey(picked)));
    setPhase("throwing");
    timer.current = window.setTimeout(() => {
      setPhase("done");
      onPick(picked.region, picked.attraction);
    }, throwDuration());
  };

  const target = result ? positions.get(candidateKey(result)) : undefined;
  const penStyle =
    phase === "idle" || !target
      ? { left: "92%", top: "112%", transform: "rotate(-35deg)" }
      : { left: `${target.x}%`, top: `${target.y}%`, transform: "rotate(-55deg)" };

  return (
    <section className="random-trip" aria-label="랜덤 여행">
      <h3>랜덤 여행 · 펜 던지기</h3>
      <p className="rt-note">안전 등급 조건을 통과한 관광지 중에서 운에 맡겨 한 곳을 뽑아요.</p>

      <div className="rt-filters">
        <label>
          <span className="field-label">안전 등급</span>
          <select
            value={maxGrade}
            onChange={(e) => {
              setMaxGrade(Number(e.target.value));
              resetResult();
            }}
          >
            {[1, 2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {g}등급 이내 ({GRADE_LABEL[g]})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">지역</span>
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              resetResult();
            }}
          >
            <option value="all">전체</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rt-board" aria-hidden="true">
        {pool.map((c) => {
          const pos = positions.get(candidateKey(c));
          if (!pos) return null;
          return <span key={candidateKey(c)} className="rt-pin" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} />;
        })}
        <span className={`rt-pen ${phase}`} style={penStyle} />
      </div>

      <p className="rt-count" aria-live="polite">
        {pool.length > 0
          ? `후보 ${pool.length}곳${people.length === 0 ? " · 동행자를 입력하면 연령대 선호가 반영돼요" : ""}`
          : "조건에 맞는 관광지가 없어요. 안전 등급 범위를 넓히거나 지역을 바꿔 보세요."}
      </p>

      <button type="button" className="submit-btn" onClick={throwPen} disabled={pool.length === 0 || phase === "throwing"}>
        {phase === "idle" ? "펜 던지기" : phase === "throwing" ? "던지는 중…" : "다시 던지기"}
      </button>

      {phase === "done" && result && (
        <div className="rt-result">
          <div className="rt-result-head">
            <strong>{result.attraction.name}</strong>
            <span className={`safety-badge grade-${result.region.safety.grade}`}>
              {GRADE_LABEL[result.region.safety.grade]}
            </span>
          </div>
          <div className="rt-result-meta">
            {result.region.province} {result.region.name} · {result.attraction.category}
          </div>
          <p className="rt-result-reason">{tripReason(result, people)}</p>
          <p className="rt-result-hint">지도와 아래 상세 정보에서 길찾기를 확인할 수 있어요.</p>
        </div>
      )}
    </section>
  );
}
