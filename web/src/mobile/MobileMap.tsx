import { useEffect, useRef, useState } from "react";
import { KAKAO_MAP_KEY as KAKAO_KEY, loadKakaoSdk } from "../lib/kakaoMapSdk";

export interface MobileMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** me: 내 위치(파란 점), selected: 고른 지역(강조 라벨), region: 추천 지역 */
  tone: "me" | "selected" | "region";
}

/**
 * 모바일 지도 영역(Figma 02·03·04). 카카오맵 키가 있으면 지도를, 없으면 라벨 목록을 보여 준다.
 * 위치 정보는 이 브라우저 안에서만 쓰고 서버로 보내지 않는다.
 */
export function MobileMap({
  center,
  level,
  markers,
  onMyLocation,
  onWholeKorea,
  locating = false,
  height = 420,
  accuracy = null,
}: {
  center: { lat: number; lng: number };
  level: number;
  markers: MobileMapMarker[];
  onMyLocation?: () => void;
  onWholeKorea?: () => void;
  locating?: boolean;
  height?: number;
  /** 내 위치의 오차 반경(coords.accuracy, m). 지도에 반투명 원으로 그린다 */
  accuracy?: { lat: number; lng: number; radius: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(KAKAO_KEY ? "loading" : "no-key");

  useEffect(() => {
    if (!KAKAO_KEY || !containerRef.current) return;
    let cancelled = false;
    loadKakaoSdk(KAKAO_KEY)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    return () => {
      cancelled = true;
    };
    // 지도는 한 번만 만든다. 중심·확대는 아래 effect가 따라간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    mapRef.current.setLevel(level);
    mapRef.current.panTo(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [status, center.lat, center.lng, level]);

  // 부모가 렌더마다 새 배열을 줘도 내용이 같으면 다시 그리지 않는다.
  const markersKey = JSON.stringify(markers);
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    const current: MobileMapMarker[] = JSON.parse(markersKey);
    overlaysRef.current = current.map((marker) => {
      const el = document.createElement("div");
      el.className = marker.tone === "me" ? "m-pin-me" : `m-pin-label m-pin-${marker.tone}`;
      if (marker.tone !== "me") el.textContent = marker.label;
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(marker.lat, marker.lng),
        content: el,
        yAnchor: marker.tone === "me" ? 0.5 : 1.1,
        xAnchor: 0.5,
      });
      overlay.setMap(mapRef.current);
      return overlay;
    });
  }, [status, markersKey]);

  // 내 위치 오차 원: 반경이 바뀌거나 위치가 바뀌면 다시 그린다.
  const accuracyKey = accuracy ? `${accuracy.lat},${accuracy.lng},${accuracy.radius}` : "";
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    if (!accuracyKey) return;
    const [lat, lng, radius] = accuracyKey.split(",").map(Number);
    circleRef.current = new window.kakao.maps.Circle({
      center: new window.kakao.maps.LatLng(lat, lng),
      radius,
      strokeWeight: 1,
      strokeColor: "#2f6fed",
      strokeOpacity: 0.6,
      fillColor: "#2f6fed",
      fillOpacity: 0.12,
    });
    circleRef.current.setMap(mapRef.current);
  }, [status, accuracyKey]);

  function zoom(delta: number) {
    if (status === "ready" && mapRef.current) mapRef.current.setLevel(mapRef.current.getLevel() + delta);
  }

  return (
    <div className="m-map" style={{ height }} role="region" aria-label="지도">
      <div ref={containerRef} className="m-map-canvas" />
      {status !== "ready" && (
        <div className="m-map-fallback" role="status">
          <p>
            {status === "loading"
              ? "지도를 불러오는 중…"
              : status === "error"
                ? "지도를 불러오지 못했어요."
                : "지도 키가 설정되지 않아 지도를 표시하지 못해요."}
          </p>
          {accuracy && <p>내 위치 오차 약 {Math.round(accuracy.radius).toLocaleString("ko-KR")}m</p>}
          <ul>
            {markers
              .filter((marker) => marker.tone !== "me")
              .map((marker) => (
                <li key={marker.id}>{marker.label}</li>
              ))}
          </ul>
        </div>
      )}
      {onWholeKorea && (
        <button type="button" className="m-map-chip m-map-top-left" onClick={onWholeKorea}>
          대한민국 전체 보기
        </button>
      )}
      {status === "ready" && (
        <div className="m-map-zoom">
          <button type="button" aria-label="확대" onClick={() => zoom(-1)}>
            +
          </button>
          <button type="button" aria-label="축소" onClick={() => zoom(1)}>
            −
          </button>
        </div>
      )}
      {onMyLocation && (
        <button type="button" className="m-map-chip m-map-bottom-right" onClick={onMyLocation} disabled={locating}>
          {locating ? "위치 확인 중…" : "◎ 내 위치"}
        </button>
      )}
    </div>
  );
}
