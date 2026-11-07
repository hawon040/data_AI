import { Link, useNavigate } from "react-router-dom";
import { LandingNav } from "./Landing";
import "./Landing.css";

const STATS = [
  { value: "2.1배", label: "추천 정밀도 (인기순 대비)", note: "가상 지역 시뮬레이션 100회 평균" },
  { value: "97.8%", label: "동행자 전원 만족 비율", note: "최솟값 방식" },
  { value: "600/600", label: "파이썬·웹앱 수식 계산 일치", note: "최대 오차 3.9×10⁻¹⁶" },
  {
    value: "128위",
    label: "가중치만 바꿔도 흔들린 안전 순위 폭 (250곳 중)",
    note: "그래서 점수 대신 대비·대응 정보로 전환",
  },
];

const FEATURES = [
  {
    num: "01",
    title: "일행 모두가 만족하는 추천",
    desc: "일행 각자의 선호 중 가장 낮은 값을 기준으로, 누구도 소외되지 않는 여행지를 고릅니다.",
    tag: "COMPANION MATCH",
  },
  {
    num: "02",
    title: "대비 정보",
    desc: "관광지에서 가까운 응급실·대피소·관광안내소와, 관광지 유형별 주의사항·준비물을 보여 줍니다.",
    tag: "PREPAREDNESS",
  },
  {
    num: "03",
    title: "날씨 맞춤 추천",
    desc: "비·눈·추위·더위·미세먼지·기상특보가 있으면 실내 장소를 먼저 추천합니다. 어르신·아이와 함께면 기준을 더 엄격하게 적용합니다.",
    tag: "WEATHER",
  },
  {
    num: "04",
    title: "광고 없는 추천",
    desc: "공공데이터만 근거로 하며, 광고나 협찬으로 순위를 바꾸지 않습니다.",
    tag: "NO ADS",
  },
];

const INFO_PAGES = {
  service: {
    eyebrow: "TRAVEL SERVICE",
    title: "여행에 필요한 것만, 한눈에",
    description: "가고 싶은 곳을 찾고, 방문 전에 날씨와 가까운 응급실·대피소까지 살펴보세요.",
  },
  methodology: {
    eyebrow: "METHODOLOGY",
    title: "추천에서 대비·대응까지",
    description:
      "먼저 일행과 날씨에 맞는 관광지를 고르고, 방문 전에 가까운 응급실·대피소와 날씨 변화에 대비합니다.",
  },
  validation: {
    eyebrow: "PROJECT RESULTS",
    title: "데이터로 확인한 추천",
    description: "추천 방식과 수식 계산을 가상 지역 시뮬레이션과 교차 계산으로 검토했습니다.",
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
                  <p>일행 구성·관심사·날씨로 후보를 고릅니다.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>대비</strong>
                  <p>가까운 응급실·대피소·관광안내소와 유형별 주의사항을 확인합니다.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>대응</strong>
                  <p>방문일 예보와 기상특보에 따라 실내 대안을 함께 보여 줍니다.</p>
                </div>
              </li>
            </ol>
            <p className="methodology-note">
              안전 정보는 참고용이며 특정 장소나 개인의 안전을 보장하지 않습니다. 기상 정보는 기상청·에어코리아 발표를 따릅니다.
            </p>
          </div>
        )}

        {section === "validation" && (
          <>
            <div className="stats-band landing-info-stats" aria-label="프로젝트 핵심 지표">
              {STATS.map((stat) => (
                <article className="stat-cell" key={stat.label}>
                  <div className="stat-value">{stat.value}</div>
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-note">{stat.note}</div>
                </article>
              ))}
            </div>
            <p className="validation-caveat">
              시뮬레이션은 정답을 아는 가상 지역으로 방식 간 차이를 확인한 실험이며, 실제 지역의 정확도가 아닙니다.
            </p>
          </>
        )}

        <div className="landing-info-cta">
          <p>날씨와 일행에 맞는 여행지를 추천받고, 가까운 응급실·대피소도 함께 확인하세요.</p>
          <button className="pill-button primary" onClick={() => navigate("/app")}>
            관광지 추천받기
          </button>
        </div>
      </main>
    </div>
  );
}
