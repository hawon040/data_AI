import { useSyncExternalStore } from "react";

/** 모바일 화면(폭 640px 이하)인지. 모바일은 Figma 디자인의 화면(src/mobile)을, 그보다 넓으면 기존 PC 화면을 쓴다. */
const QUERY = "(max-width: 640px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
