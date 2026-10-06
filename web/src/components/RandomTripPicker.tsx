import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCandidatePool,
  candidateKey,
  pickFresh,
  projectToKoreaMap,
  tripReason,
  type TripCandidate,
} from "../lib/randomTrip";
import { safetyGradeLabel } from "../lib/safetyGrades";
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<TripCandidate | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pool = useMemo(() => buildCandidatePool(regions, people), [regions, people]);

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

  return (
    <section className="random-trip" aria-label="랜덤 여행">
      <h3>랜덤 여행 · 펜 던지기</h3>
      <p className="rt-note">
        시범 지역의 관광지 중 한 곳을 무작위로 뽑아요. 안전 정보는 뽑힌 여행지에서 확인할 수 있어요.
      </p>

      <div className="rt-board" role="img" aria-label={`대한민국 지도에 후보 관광지 ${pool.length}곳을 표시했습니다`}>
        <div className="rt-map-canvas">
          <img className="rt-map-image" src="/korea-map.svg" alt="" />
          {pool.map((c) => {
            const pos = projectToKoreaMap(c.attraction.lat, c.attraction.lng);
            const selected = result != null && candidateKey(result) === candidateKey(c);
            return (
              <span
                key={candidateKey(c)}
                className={`rt-pin${selected ? " selected" : ""}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              />
            );
          })}
        </div>
        <span className="rt-map-credit">대한민국 지도 · 후보 관광지</span>
      </div>

      <p className="rt-count" aria-live="polite">
        {pool.length > 0
          ? `전국 시범 지역 후보 ${pool.length}곳${people.length === 0 ? " · 동행자를 입력하면 연령대 선호가 반영돼요" : ""}`
          : "추천할 관광지가 없어요."}
      </p>

      <button type="button" className="submit-btn" onClick={throwPen} disabled={pool.length === 0 || phase === "throwing"}>
        {phase === "idle" ? "펜 던지기" : phase === "throwing" ? "던지는 중…" : "다시 던지기"}
      </button>

      {phase === "done" && result && (
        <div className="rt-result">
          <div className="rt-result-head">
            <strong>{result.attraction.name}</strong>
            <span className={`safety-badge grade-${result.region.safety.grade}`}>
              {safetyGradeLabel(result.region.safety.grade)}
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
