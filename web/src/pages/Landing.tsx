import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HERO_SLIDES as SEASONAL_SLIDES, heroSlideIndexForMonth, prefersReducedMotion } from "../lib/heroSlides";
import "./Landing.css";

const NAV_LINKS = [
  { path: "/service", label: "서비스" },
  { path: "/methodology", label: "방법론" },
  { path: "/validation", label: "검증 결과" },
] as const;

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenuOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenuOutside);
    window.addEventListener("keydown", closeMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenuOutside);
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [menuOpen]);

  return (
    <nav className="landing-nav" ref={menuRef}>
      <div className="nav-start">
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={menuOpen}
          aria-controls="landing-section-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link to="/" className="brand">
          <span className="brand-mark">T</span>
          <span className="brand-name">TourLink</span>
        </Link>
      </div>
      <Link to="/methodology" className="nav-safety-link">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3 19 6v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        안전 정보 안내
      </Link>
      {menuOpen && (
        <div className="section-menu" id="landing-section-menu">
          <p className="section-menu-heading">페이지 안내</p>
          {NAV_LINKS.map(({ path, label }, index) => (
            <Link
              className="section-menu-item"
              key={path}
              to={path}
              onClick={() => setMenuOpen(false)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [tickerPaused, setTickerPaused] = useState(false);
  const [slideState, setSlideState] = useState(() => ({
    active: heroSlideIndexForMonth(new Date().getMonth() + 1),
    outgoing: null as number | null,
  }));
  const { active: activeSlide, outgoing: outgoingSlide } = slideState;
  const destination = SEASONAL_SLIDES[activeSlide];

  useEffect(() => {
    if (!launching) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => navigate("/app"), reducedMotion ? 0 : 720);
    return () => window.clearTimeout(timer);
  }, [launching, navigate]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      setSlideState((current) => ({
        active: (current.active + 1) % SEASONAL_SLIDES.length,
        outgoing: current.active,
      }));
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (outgoingSlide === null) return;
    const timer = window.setTimeout(() => {
      setSlideState((current) =>
        current.outgoing === outgoingSlide ? { ...current, outgoing: null } : current,
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [outgoingSlide]);

  return (
    <div className="landing">
      <LandingNav />

      <div
        className="landing-marquee-viewport"
        role="region"
        aria-label="가고 싶은 관광지, 안전까지 확인하다"
      >
        <div className={`landing-marquee${tickerPaused ? " is-paused" : ""}`} aria-hidden="true">
          {[0, 1].map((copy) => (
            <div className="landing-marquee-panel" key={copy} aria-hidden={copy === 1}>
              <span className="landing-marquee-copy"># 가고 싶은 관광지, 안전까지 확인하다</span>
            </div>
          ))}
        </div>
        <button
          className="landing-marquee-toggle"
          type="button"
          onClick={() => setTickerPaused((paused) => !paused)}
          aria-label={tickerPaused ? "움직이는 문구 재생" : "움직이는 문구 멈춤"}
          aria-pressed={tickerPaused}
        >
          {tickerPaused ? "재생" : "멈춤"}
        </button>
      </div>

      <section className="hero" data-season={destination.season}>
        {outgoingSlide !== null && (
          <img
            key={SEASONAL_SLIDES[outgoingSlide].id}
            className="hero-seasonal-photo outgoing"
            src={SEASONAL_SLIDES[outgoingSlide].image}
            alt=""
            aria-hidden="true"
          />
        )}
        <img
          key={destination.id}
          className="hero-seasonal-photo"
          src={destination.image}
          alt=""
          aria-hidden="true"
        />
        <div className="hero-content">
          <h1 className="hero-title">
            어디로 떠날지,
            <br />
            얼마나 안전한지 한 번에
          </h1>
          <p className="hero-lead">
            날씨와 일행에 맞는 관광지를 추천하고, 가까운 응급실·대피소까지 함께 알려드려요.
          </p>
        <div className={`hero-actions${launching ? " is-launching" : ""}`}>
          <button
            className="pill-button primary trip-launch-button"
            onClick={() => setLaunching(true)}
            disabled={launching}
            aria-busy={launching}
          >
            관광지 추천받기
            <svg className="trip-car" viewBox="0 0 48 40" aria-hidden="true" focusable="false">
              <path className="trip-car-body" d="M7 25.5h34v7H7zM10 23l4.5-9h16l7.5 9v3H10z" />
              <path className="trip-car-window" d="m16.2 16-3.5 7h9v-7zm7.7 0v7h11.1l-5.8-7z" />
              <path className="trip-car-detail" d="M5 26h3m32 0h3" />
              <circle className="trip-car-wheel" cx="15" cy="33" r="4.2" />
              <circle className="trip-car-wheel" cx="34" cy="33" r="4.2" />
              <circle className="trip-car-wheel-core" cx="15" cy="33" r="1.5" />
              <circle className="trip-car-wheel-core" cx="34" cy="33" r="1.5" />
            </svg>
          </button>
        </div>
        </div>
        <div className="hero-seasonal-credit" aria-live="polite">
            <span>{destination.month}월 · {destination.location} · {destination.title}</span>
            <span>
              사진: {destination.creator} ·{" "}
              <a href={destination.sourceUrl} target="_blank" rel="noreferrer">사진 출처</a> ·{" "}
              <a href={destination.licenseUrl} target="_blank" rel="noreferrer">{destination.license}</a>
            </span>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-top">
          <div>
            <div className="brand">
              <div className="brand-mark small">T</div>
              <span className="brand-name">TourLink</span>
            </div>
            <p className="footer-desc">
              맞춤 관광지 추천부터 여행자 관점의 안전 정보까지.
              <br />
              날씨·일행 맞춤 관광지 추천과 가까운 응급실·대피소 안내
              <br />
              빅데이터와 AI 2조 프로젝트
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
