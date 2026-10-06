import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEASONAL_DESTINATIONS } from "../lib/seasonalDestinations";
import { getSeason } from "../lib/tripPreferences";
import "./Landing.css";

const NAV_LINKS = [
  { path: "/service", label: "서비스" },
  { path: "/methodology", label: "방법론" },
  { path: "/validation", label: "검증 결과" },
] as const;
const SEASONAL_SLIDES = Object.values(SEASONAL_DESTINATIONS).flat();

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
          <span className="brand-name">TrueTrip</span>
        </Link>
      </div>
      <Link to="/methodology" className="nav-safety-link">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3 19 6v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        안전지수 안내
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
          <div className="section-menu-divider" />
          <Link
            className="section-menu-item section-menu-about"
            to="/about"
            onClick={() => setMenuOpen(false)}
          >
            <span>정보</span>
            <span>구현 방식 &amp; 신뢰성</span>
          </Link>
        </div>
      )}
    </nav>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [slideState, setSlideState] = useState(() => {
    const currentSeason = getSeason(new Date().getMonth() + 1);
    const index = SEASONAL_SLIDES.findIndex((destination) => destination.season === currentSeason);
    return { active: Math.max(index, 0), outgoing: null as number | null };
  });
  const { active: activeSlide, outgoing: outgoingSlide } = slideState;
  const destination = SEASONAL_SLIDES[activeSlide];

  useEffect(() => {
    if (!launching) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => navigate("/app"), reducedMotion ? 0 : 720);
    return () => window.clearTimeout(timer);
  }, [launching, navigate]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setSlideState((current) => ({
        active: (current.active + 1) % SEASONAL_SLIDES.length,
        outgoing: current.active,
      }));
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (outgoingSlide === null) return;
    const timer = window.setTimeout(() => {
      setSlideState((current) =>
        current.outgoing === outgoingSlide ? { ...current, outgoing: null } : current,
      );
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [outgoingSlide]);

  return (
    <div className="landing">
      <LandingNav />

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
        <div className="hero-seasonal-wash" aria-hidden="true" />
        <h1>
          가고 싶은 관광지,
          <br />
          <span className="gradient-text">안전까지 확인하다</span>
        </h1>
        <div className={`hero-actions${launching ? " is-launching" : ""}`}>
          <button
            className="pill-button primary trip-launch-button"
            onClick={() => setLaunching(true)}
            disabled={launching}
            aria-busy={launching}
          >
            관광지 추천받기
          </button>
          <button
            className="trip-car-button"
            type="button"
            onClick={() => setLaunching(true)}
            disabled={launching}
            aria-label="자동차로 관광지 추천받기"
            aria-busy={launching}
          >
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
        <div className="hero-seasonal-credit" aria-live="polite">
            <span>{destination.location} · {destination.title}</span>
            <span>
              사진: {destination.creator} ·{" "}
              <a href={destination.sourceUrl} target="_blank" rel="noreferrer">{destination.license}</a>
            </span>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-top">
          <div>
            <div className="brand">
              <div className="brand-mark small">T</div>
              <span className="brand-name">TrueTrip</span>
            </div>
            <p className="footer-desc">
              맞춤 관광지 추천부터 여행자 관점의 안전 정보까지.
              <br />
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
