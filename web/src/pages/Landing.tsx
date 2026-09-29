import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Landing.css";

const NAV_LINKS = ["서비스", "방법론", "검증 결과"];

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

export function Landing() {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState<number | null>(null);

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand">
          <div className="brand-mark">T</div>
          <span className="brand-name">TrueTrip</span>
        </div>
        <div className="nav-links">
          {NAV_LINKS.map((link) => (
            <a key={link} href={`#${link}`}>
              {link}
            </a>
          ))}
        </div>
        <div className="nav-actions">
          <Link to="/about" className="pill-button ghost compact">
            구현 방식 &amp; 신뢰성
          </Link>
          <button className="pill-button primary compact" onClick={() => navigate("/app")}>
            추천받으러 가기
          </button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-glow glow-blue" />
        <div className="hero-glow glow-teal" />
        <h1>
          같이 가는 모두가 만족할 여행지를,
          <br />
          <span className="gradient-text">진짜 이동 데이터</span>로 찾는다
        </h1>
        <p className="hero-sub">
          성별·연령이 다른 동행자도 모두 평균 이상으로 찾는 곳만 추천하고,
          <br />
          여행 중엔 지금 필요한 안전 정보까지 함께 보여준다.
        </p>
        <div className="hero-actions">
          <button className="pill-button primary" onClick={() => navigate("/app")}>
            지금 추천받기
          </button>
          <a className="pill-button ghost" href="#방법론">
            방법론 알아보기
          </a>
        </div>
      </section>

      <section className="stats-band">
        {STATS.map((s, i) => (
          <div key={s.label} className="stat-cell" style={{ borderRight: i < 3 ? "1px solid var(--border)" : "none" }}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
        <p className="stats-caveat">
          참값을 아는 가상 지역으로 측정한 방법론 검증 수치입니다 (몬테카를로 시뮬레이션). 실제 지역 결과가 아닙니다.
        </p>
      </section>

      <section id="서비스" className="features">
        <div className="section-head">
          <div className="eyebrow">OUR APPROACH</div>
          <h2>네 가지 핵심 기능</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.num}
              className={`feature-card${activeFeature === i ? " active" : ""}`}
              onMouseEnter={() => setActiveFeature(i)}
              onMouseLeave={() => setActiveFeature(null)}
            >
              <div className="feature-accent" />
              <div className="feature-head">
                <span className="feature-tag">{f.tag}</span>
                <span className="feature-num">{f.num}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="방법론" className="methodology">
        <div className="methodology-glow" />
        <div className="methodology-inner">
          <div className="eyebrow teal">METHODOLOGY</div>
          <h2>
            안전도 산출의
            <br />
            새로운 기준
          </h2>
          <p>
            거주 인구를 분모로 쓰면 관광객이 몰리는 지역의 위험이 과대평가된다. 관광객 체류를
            반영한 유효인구, 범죄 심각도·노출도 결합, 경험적 베이즈 축소까지 — 세 가지 보정을
            거쳐야 여행자 관점의 안전도가 된다.
          </p>
          <a className="pill-button teal-btn" href="#검증 결과">
            검증 결과 보기 →
          </a>
        </div>
      </section>

      <section id="검증 결과" className="validation">
        <div className="section-head">
          <div className="eyebrow">VALIDATED BY SIMULATION</div>
          <h2>오차 검증 요약</h2>
        </div>
        <div className="validation-rows">
          {[
            { title: "추천 방식", detail: "특화지수 × 로그 규모 결합", result: "정밀도 0.842 (인기도 단독 0.333)" },
            { title: "동행자 교집합", detail: "최솟값 방식", result: "동행자 전원 만족 68.3% (대표자 1인 24.5%)" },
            { title: "안전도 분모", detail: "수정 유효인구", result: "RMSE 7.8 (거주인구만 10.2, 이전 이중계산 19.1)" },
            { title: "3개년 평균 + 베이즈 축소", detail: "소규모 지역 보정", result: "소규모 지역 RMSE 약 15%p 추가 감소" },
          ].map((row, i) => (
            <div key={row.title} className="validation-row">
              <span className="v-num">0{i + 1}</span>
              <h3>{row.title}</h3>
              <span className="v-detail">{row.detail}</span>
              <span className="v-result">{row.result}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-glow" />
        <div>
          <h2>
            내 동행에 맞는 여행지,
            <br />
            지금 찾아볼까요?
          </h2>
          <p>성별·연령대만 입력하면 바로 확인할 수 있습니다.</p>
        </div>
        <button className="pill-button primary" onClick={() => navigate("/app")}>
          추천받으러 가기
        </button>
      </section>

      <footer className="landing-footer">
        <div className="footer-top">
          <div>
            <div className="brand">
              <div className="brand-mark small">T</div>
              <span className="brand-name">TrueTrip</span>
            </div>
            <p className="footer-desc">
              성·연령 방문 데이터 기반 맞춤 관광지 추천 플랫폼
              <br />
              관광 노출 보정 안전지수 — 창업 도전 프로젝트
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>샘플 데이터 기반 데모입니다. 실제 서비스가 아닙니다.</span>
          <span>DATA-DRIVEN · NO ADS</span>
        </div>
      </footer>
    </div>
  );
}
