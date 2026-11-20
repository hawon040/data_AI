import { useState } from "react";
import { Link } from "react-router-dom";

const MENU = [
  { to: "/", label: "홈" },
  { to: "/app", label: "여행 추천" },
  { to: "/service", label: "안전 정보 안내" },
  { to: "/methodology", label: "추천 방법" },
  { to: "/validation", label: "검증 결과" },
] as const;

/** 모바일 공통 머리글: 로고와 ☰ 메뉴. showNav면 장소·길찾기 화면처럼 아래에 바로가기 두 개를 둔다. */
export function MobileHeader({ showNav = false }: { showNav?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="m-header">
      <div className="m-header-bar">
        <Link to="/" className="m-logo">
          TourLink
        </Link>
        <button
          type="button"
          className="m-menu-button"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          ☰
        </button>
      </div>
      {open && (
        <nav className="m-menu" aria-label="메뉴">
          {MENU.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      {showNav && (
        <nav className="m-subnav" aria-label="바로가기">
          <Link to="/app">여행 추천</Link>
          <Link to="/service">안전 정보 안내</Link>
        </nav>
      )}
    </header>
  );
}
