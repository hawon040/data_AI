import { Link, useNavigate } from "react-router-dom";
import { LandingNav } from "./Landing";
import { SAFETY_GRADES, SAFETY_GRADE_LABELS } from "../lib/safetyGrades";
import "./Landing.css";

const STATS = [
  { value: "2.5배", label: "추천 정확도 (인기도 단독 대비)" },
  { value: "68.3%", label: "동행자 전원 만족 비율" },
  { value: "22%", label: "안전지수 오차 감소" },
  { value: "10개", label: "시범 권역 (충청·강원)" },
];

const FEATURES = [
  {
    num: "01",
    title: "동행자 교집합 추천",
    desc: "동행자 각각의 특화지수 중 최솟값을 기준으로, 모두가 평균 이상으로 만족하는 여행지만 골라낸다.",
    tag: "COMPANION MATCH",
  },
  {
    num: "02",
    title: "여행자 관점 안전지수",
    desc: "거주 인구가 아닌 관광객 체류를 반영한 유효인구로 보정 — 5단계 등급과 신뢰구간으로 투명하게 공개한다.",
    tag: "SAFETY INDEX",
  },
  {
    num: "03",
    title: "여행 중 실시간 모드",
    desc: "현재 위치 기준으로 지금 근처의 추천과 시간대별 안전 정보, 기상특보를 함께 띄운다.",
    tag: "IN-TRIP (예정)",
  },
  {
    num: "04",
    title: "광고 없는 추천 원칙",
    desc: "리뷰나 협찬이 아니라 통신 데이터로 집계한 실제 이동만을 근거로 한다. 돈으로 순위를 바꿀 수 없다.",
    tag: "NO ADS",
  },
];

const INFO_PAGES = {
  service: {
    eyebrow: "TRAVEL SERVICE",
    title: "여행에 필요한 것만, 한눈에",
    description: "가고 싶은 곳을 찾고, 방문 전에 지역 안전 정보까지 살펴보세요.",
  },
  methodology: {
    eyebrow: "SAFETY METHODOLOGY",
    title: "관광지에서 안전까지",
    description:
      "먼저 취향에 맞는 관광지를 찾고, 방문 전에 그 지역의 안전 정보를 참고할 수 있습니다. 안전 등급은 참고 정보이며 관광지 추천 순위를 결정하지 않습니다.",
  },
  validation: {
    eyebrow: "PROJECT RESULTS",
    title: "데이터로 확인한 추천",
    description: "추천 방식과 안전 지표 산출을 가상 지역 시뮬레이션으로 검토했습니다.",
  },
} as const;

export type LandingInfoSection = keyof typeof INFO_PAGES;

export function LandingInfo({ section }: { section: LandingInfoSection }) {
  const navigate = useNavigate();
  const page = INFO_PAGES[section];

  return (
    <div className="landing">
      <LandingNav />
      <main className="landing-info-page">
        <Link className="info-back-link" to="/">
          ← 메인으로
        </Link>
        <header className="landing-info-heading">
          <p className="eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </header>

        {section === "service" && (
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature-card" key={feature.num}>
                <div className="feature-accent" />
                <div className="feature-head">
                  <span className="feature-tag">{feature.tag}</span>
                  <span className="feature-num">{feature.num}</span>
                </div>
                <h2>{feature.title}</h2>
                <p>{feature.desc}</p>
              </article>
            ))}
          </div>
        )}

        {section === "methodology" && (
          <div className="landing-methodology-content">
            <ol className="method-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>관광지 추천</strong>
                  <p>동행자 연령대 선호와 관광지 인기도를 바탕으로 후보를 제안합니다.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>지역 안전 정보</strong>
                  <p>여행자 체류를 고려한 지역 안전 지표와 5단계 등급을 보여줍니다. 1등급이 가장 안전하고, 5등급은 안전하지 않음을 뜻합니다.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>참고 후 선택</strong>
                  <p>관광 정보를 살펴보고 일정과 취향에 맞춰 여행지를 선택합니다.</p>
                </div>
              </li>
            </ol>
            <section className="safety-grade-guide" aria-labelledby="safety-grade-guide-title">
              <div className="safety-grade-guide-heading">
                <h2 id="safety-grade-guide-title">안전등급 기준</h2>
                <span aria-label="위로 갈수록 안전">↑ 위로 갈수록 안전</span>
              </div>
              <ol className="safety-grade-pyramid" aria-label="안전등급은 위로 갈수록 더 안전합니다">
                {SAFETY_GRADES.map((grade) => (
                  <li className={`safety-grade-level safety-grade-level-${grade}`} key={grade}>
                    <strong>{grade}등급</strong>
                    <span>{SAFETY_GRADE_LABELS[grade]}</span>
                  </li>
                ))}
              </ol>
              <p className="safety-grade-caveat">
                등급은 지역 단위 지표를 바탕으로 한 참고 정보이며, 특정 장소나 개인의 안전을 보장하지 않습니다.
              </p>
            </section>
            <p className="methodology-note">현재 방문·안전 지표는 시범용 샘플 데이터입니다.</p>
          </div>
        )}

        {section === "validation" && (
          <>
            <div className="stats-band landing-info-stats" aria-label="프로젝트 핵심 지표">
              {STATS.map((stat) => (
                <article className="stat-cell" key={stat.label}>
                  <div className="stat-value">{stat.value}</div>
                  <div className="stat-label">{stat.label}</div>
                </article>
              ))}
            </div>
            <p className="validation-caveat">
              시뮬레이션 결과이며 실제 지역의 성과나 안전을 보장하지 않습니다.
            </p>
          </>
        )}

        <div className="landing-info-cta">
          <p>취향에 맞는 여행지를 추천받고, 지역 안전 정보도 함께 확인하세요.</p>
          <button className="pill-button primary" onClick={() => navigate("/app")}>
            관광지 추천받기
          </button>
        </div>
      </main>
    </div>
  );
}
