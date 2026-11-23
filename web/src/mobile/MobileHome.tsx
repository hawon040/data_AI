import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { HERO_SLIDES, heroSlideIndexForMonth, prefersReducedMotion } from "../lib/heroSlides";
import { MobileHeader } from "./MobileHeader";
import "./mobile.css";

const SLIDE_MS = 6000;

const PROVINCES = [...new Set(SAMPLE_REGIONS.map((region) => region.province))];

const STORIES = [
  { tag: "여행 준비", title: "떠나기 전, 날씨부터 확인해요", body: "강수 소식이 있다면 실내 일정도 함께 준비하세요.", to: "/app" },
  { tag: "안전 가이드", title: "낯선 곳에서도 안전하게 여행하기", body: "주변 응급실과 대피소 위치를 미리 확인해요.", to: "/service" },
  { tag: "여행 아이디어", title: "바다를 보며 즐기는 카페 여행", body: "해변 카페거리에서 여유로운 시간을 가져요.", to: "/app" },
  { tag: "이동 가이드", title: "길찾기는 간편하게, 여행은 가볍게", body: "장소와 안전 정보를 확인하고 길찾기를 시작해요.", to: "/app" },
] as const;

/** 모바일 01 홈 (Figma). 폭 640px 이하에서 "/"에 보인다. */
export function MobileHome() {
  const navigate = useNavigate();
  const [province, setProvince] = useState("all");
  const [duration, setDuration] = useState<"day" | "overnight">("day");
  // 메인 사진: PC 랜딩과 같은 계절 사진(lib/heroSlides.ts). 이번 달 사진부터 6초마다 넘긴다.
  const [slideIndex, setSlideIndex] = useState(() => heroSlideIndexForMonth(new Date().getMonth() + 1));
  const [paused, setPaused] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);
  const autoplay = !paused && !reducedMotion;
  const slide = HERO_SLIDES[slideIndex];
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % HERO_SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [autoplay]);

  return (
    <div className="m-shell m-home">
      <MobileHeader />

      <section className="m-hero" aria-labelledby="m-hero-title">
        <img key={slide.id} className="m-hero-photo" src={slide.image} alt="" aria-hidden="true" />
        <div className="m-hero-text">
          <h1 id="m-hero-title">
            여행을 떠나요
            <br />
            안전하고 즐겁게
          </h1>
          <p>
            떠나기 전엔 어디로 갈지, 도착해선 어디로 피할지. TourLink가 둘 다 알려 드려요.
          </p>
          <Link to="/app" className="m-hero-button">
            관광지 추천받기
          </Link>
        </div>
        <div className="m-hero-foot">
          <p className="m-hero-credit" aria-live={autoplay ? "off" : "polite"}>
            <span>
              {slide.month}월 · {slide.title}
            </span>
            <span>
              사진: {slide.creator} ·{" "}
              <a href={slide.sourceUrl} target="_blank" rel="noreferrer">
                출처
              </a>{" "}
              ·{" "}
              <a href={slide.licenseUrl} target="_blank" rel="noreferrer">
                {slide.license}
              </a>
            </span>
          </p>
          {!reducedMotion && (
            <button
              type="button"
              className="m-hero-pause"
              aria-pressed={paused}
              aria-label={paused ? "사진 넘기기 다시 시작" : "사진 넘기기 멈춤"}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "▶ 재생" : "❚❚ 멈춤"}
            </button>
          )}
        </div>
      </section>

      <section className="m-section" aria-labelledby="m-finder-title">
        <h2 id="m-finder-title" className="m-section-title">
          여행 찾기
        </h2>
        <form
          className="m-card m-finder"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(`/app?province=${encodeURIComponent(province)}&duration=${duration}`);
          }}
        >
          <p className="m-eyebrow">TRIP FINDER</p>
          <h3>
            이번 여행,
            <br />
            어디로 떠날까요?
          </h3>
          <div className="m-finder-row">
            <label>
              <span className="m-visually-hidden">지역</span>
              <select value={province} onChange={(event) => setProvince(event.target.value)}>
                <option value="all">전국</option>
                {PROVINCES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="m-visually-hidden">일정</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value as "day" | "overnight")}>
                <option value="day">당일치기</option>
                <option value="overnight">1박 이상</option>
              </select>
            </label>
          </div>
          <button type="submit" className="m-dark-button">
            나에게 맞는 여행 추천받기 →
          </button>
        </form>
      </section>

      <section className="m-section" aria-labelledby="m-stories-title">
        <div className="m-section-head">
          <h2 id="m-stories-title" className="m-section-title">
            여행 소식
          </h2>
          <Link to="/service" className="m-more">
            more ›
          </Link>
        </div>
        <div className="m-stories">
          {STORIES.map((story) => (
            <article key={story.title} className="m-card m-story">
              <p className="m-eyebrow">{story.tag}</p>
              <h3>{story.title}</h3>
              <p className="m-story-body">{story.body}</p>
              <Link to={story.to} className="m-story-link">
                자세히 보기 →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <MobileFooter />
    </div>
  );
}

export function MobileFooter() {
  return (
    <footer className="m-footer">
      <strong>TourLink</strong>
      <p>안전 정보는 참고용이에요. 출발 전 최신 정보를 확인하고, 긴급 상황에는 119로 연락해 주세요.</p>
    </footer>
  );
}
