import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEASONAL_DESTINATIONS, type SeasonalDestination } from "../lib/seasonalDestinations";
import "./Landing.css";

const NAV_LINKS = [
  { path: "/service", label: "서비스" },
  { path: "/methodology", label: "방법론" },
  { path: "/validation", label: "검증 결과" },
] as const;
type MonthlySlide = SeasonalDestination & { month: number };

const SEASONAL_SLIDES: MonthlySlide[] = [
  {
    ...SEASONAL_DESTINATIONS.winter[1],
    month: 1,
    id: "january-buramsan-snow",
    timing: "불암산 · 한겨울 설경",
    location: "서울특별시 노원구",
    title: "불암산 눈 덮인 능선",
    summary: "눈으로 덮인 불암산의 겨울 능선이에요.",
    image: "/seasonal/kogl-buramsan-winter-optimized.jpg",
    imageAlt: "눈 쌓인 불암산의 겨울 산 능선",
    creator: "서울특별시 노원구",
    license: "공공누리 제1유형",
    licenseUrl: "https://www.kogl.or.kr/info/licenseType1.do",
    sourceUrl: "https://www.kogl.or.kr/recommend/recommendDivDetail.do?recommendIdx=59887",
  },
  {
    ...SEASONAL_DESTINATIONS.winter[1],
    month: 2,
    id: "february-taebaeksan-rime",
    timing: "태백산 · 상고대",
    location: "강원특별자치도 태백시",
    title: "태백산 겨울 상고대",
    summary: "나뭇가지마다 서리가 내려앉은 태백산의 겨울 풍경이에요.",
    image: "/seasonal/taebaeksan-winter-landscape.jpg",
    imageAlt: "상고대와 눈으로 덮인 태백산 능선",
    creator: "Franguiche",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Parc_National_Taebaeksan_en_hiver.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.spring[0],
    month: 3,
    id: "march-jinhae-blossom",
    timing: "진해 · 봄 벚꽃",
    location: "경상남도 창원시 진해구",
    title: "진해 벚꽃길",
    summary: "벚꽃이 피어나기 시작하는 진해의 봄 풍경이에요.",
    image: "/seasonal/jinhae-spring-panorama.jpg",
    imageAlt: "벚꽃으로 뒤덮인 진해의 봄 풍경",
  },
  {
    ...SEASONAL_DESTINATIONS.spring[0],
    month: 4,
    id: "april-korean-cherry-blossom",
    timing: "한국의 벚꽃 · 봄 절정",
    location: "대한민국",
    title: "벚꽃 터널",
    summary: "화사한 벚꽃이 터널처럼 이어지는 봄 풍경이에요.",
    image: "/seasonal/korean-cherry-blossom-panorama.jpg",
    imageAlt: "분홍빛 벚꽃이 하늘을 덮은 봄 풍경",
    creator: "Ckim777",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Korean_Cherry_Blossom.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.spring[0],
    month: 5,
    id: "may-ansan-blossom",
    timing: "안산 · 봄 산책길",
    location: "경기도 안산시",
    title: "안산 벚꽃 산책길",
    summary: "운하 곁에 벚꽃이 이어지는 안산의 봄 풍경이에요.",
    image: "/seasonal/ansan-spring-panorama.jpg",
    imageAlt: "운하를 따라 벚꽃이 핀 안산의 봄 풍경",
    creator: "Ken Eckert",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Korean_Cherry_Blossoms_in_Ansan.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.summer[1],
    month: 6,
    id: "june-jeju-coast",
    timing: "제주 · 초여름 해안",
    location: "제주특별자치도",
    title: "제주 푸른 해안",
    summary: "초록빛 해안과 푸른 바다가 펼쳐지는 제주의 초여름 풍경이에요.",
    image: "/seasonal/jeju-summer-coast-landscape.jpg",
    imageAlt: "푸른 바다와 초록빛 해안이 이어지는 제주 풍경",
    creator: "Sgroey",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Black_sand_beach_Jeju.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.summer[1],
    month: 7,
    id: "july-jungmun-beach",
    timing: "중문 · 한여름 바다",
    location: "제주특별자치도 서귀포시",
    title: "중문 색달해변",
    summary: "검은 화산암과 푸른 물결이 어우러지는 한여름 해변이에요.",
    image: "/seasonal/jungmun-summer-beach.jpg",
    imageAlt: "제주 중문 색달해변의 바다와 검은 화산암",
    creator: "Giuseppe Milo",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Jungmun_Saekdal_Beach_South_Korea_Seascape_Photography_(255046171).jpeg",
  },
  {
    ...SEASONAL_DESTINATIONS.summer[1],
    month: 8,
    id: "august-daebudo-coast",
    timing: "대부도 · 여름 해안",
    location: "경기도 안산시 대부도",
    title: "대부도 여름 바다",
    summary: "넓게 펼쳐진 바닷가와 푸른 숲이 어우러진 여름 풍경이에요.",
    image: "/seasonal/daebudo-summer-coast-39.jpg",
    imageAlt: "대부도의 바다와 숲이 이어지는 여름 풍경",
    creator: "UserLPiotrus",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Daebudo_summer_2016_39.JPG",
  },
  {
    ...SEASONAL_DESTINATIONS.autumn[1],
    month: 9,
    id: "september-naejangsan-autumn",
    timing: "내장산 · 초가을 단풍",
    location: "전북특별자치도 정읍시",
    title: "내장산 단풍 케이블카",
    summary: "단풍이 물들기 시작하는 내장산의 초가을 풍경이에요.",
    image: "/seasonal/naejangsan-autumn.jpg",
    imageAlt: "초가을 단풍으로 물들기 시작한 내장산",
    creator: "Jeongtaeyoung",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Naejangsan_Mountain_cable_car.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.autumn[1],
    month: 10,
    id: "october-chiak-autumn",
    timing: "치악산 · 단풍 절정",
    location: "강원특별자치도 원주시",
    title: "치악산 가을 단풍",
    summary: "산자락을 황금빛과 붉은빛으로 물들인 치악산의 가을 풍경이에요.",
    image: "/seasonal/chiak-mountain-autumn-foliage.jpg",
    imageAlt: "황금빛 단풍이 산자락을 덮은 치악산",
    creator: "Sohyeon Bak",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Fall_Foliage_of_Chiak_Mountain.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.autumn[1],
    month: 11,
    id: "november-naejangsan-maples",
    timing: "내장산 · 늦가을 단풍",
    location: "전북특별자치도 정읍시",
    title: "내장산 붉은 단풍",
    summary: "붉은 단풍이 물과 정자를 감싸는 늦가을 풍경이에요.",
    image: "/seasonal/naejangsan-autumn-landscape.jpg",
    imageAlt: "내장산 정자와 붉게 물든 늦가을 단풍",
    creator: "Tung Thanh Dang",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Naejangsan_Pavilion_2.jpg",
  },
  {
    ...SEASONAL_DESTINATIONS.winter[1],
    month: 12,
    id: "december-taebaeksan-snow",
    timing: "태백산 · 겨울 설경",
    location: "강원특별자치도 태백시",
    title: "눈 덮인 태백산",
    summary: "눈이 내려앉은 태백산 능선의 겨울 풍경이에요.",
    image: "/seasonal/taebaeksan-mountain.jpg",
    imageAlt: "눈으로 덮인 태백산의 겨울 풍경",
    creator: "칼빈500",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:태백산눈2019(AMJ).jpg",
  },
];

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
  const [tickerPaused, setTickerPaused] = useState(false);
  const [slideState, setSlideState] = useState(() => {
    const currentMonth = new Date().getMonth() + 1;
    const index = SEASONAL_SLIDES.findIndex((destination) => destination.month === currentMonth);
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
