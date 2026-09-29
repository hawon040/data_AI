import { useEffect, useRef, useState } from "react";
import { topAttractionsOf } from "../lib/recommend";
import type { Region } from "../lib/types";

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;

function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  });
}

export function MapView({
  regions,
  highlightedCodes,
  selectedCode,
  onSelectRegion,
}: {
  regions: Region[];
  highlightedCodes: Set<string>;
  selectedCode?: string;
  onSelectRegion: (r: Region) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const attractionMarkersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(
    KAKAO_KEY ? "loading" : "no-key",
  );

  useEffect(() => {
    if (!KAKAO_KEY || !containerRef.current) return;
    let cancelled = false;
    loadKakaoSdk(KAKAO_KEY)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const center = new window.kakao.maps.LatLng(37.0, 127.8);
        mapRef.current = new window.kakao.maps.Map(containerRef.current, { center, level: 9 });
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    // 기존 마커 정리 후 다시 그린다.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current.clear();

    regions.forEach((region) => {
      const isHighlighted = highlightedCodes.size === 0 || highlightedCodes.has(region.code);
      const position = new window.kakao.maps.LatLng(region.lat, region.lng);
      const marker = new window.kakao.maps.Marker({
        position,
        opacity: isHighlighted ? 1 : 0.35,
      });
      marker.setMap(mapRef.current);
      window.kakao.maps.event.addListener(marker, "click", () => onSelectRegion(region));
      markersRef.current.set(region.code, marker);
    });
  }, [status, regions, highlightedCodes, onSelectRegion]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const region = selectedCode ? regions.find((r) => r.code === selectedCode) : undefined;
    if (!region) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(region.lat, region.lng));
    mapRef.current.setLevel(7);
  }, [status, selectedCode, regions]);

  // 선택된 지역 안의 관광지 마커 — 문서 4.3의 2단계 추천(지역 -> 관광지)을 지도에서 보여준다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;

    attractionMarkersRef.current.forEach((m) => m.setMap(null));
    attractionMarkersRef.current = [];
    infoWindowRef.current?.close();

    const region = selectedCode ? regions.find((r) => r.code === selectedCode) : undefined;
    if (!region) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new window.kakao.maps.InfoWindow({ removable: true });
    }

    topAttractionsOf(region, 5).forEach((attraction) => {
      const position = new window.kakao.maps.LatLng(attraction.lat, attraction.lng);
      const marker = new window.kakao.maps.Marker({
        position,
        map: mapRef.current,
        image: new window.kakao.maps.MarkerImage(
          "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="%2300e5c3" stroke="%230a0a0a" stroke-width="2"/></svg>',
            ),
          new window.kakao.maps.Size(16, 16),
        ),
      });
      window.kakao.maps.event.addListener(marker, "click", () => {
        infoWindowRef.current.setContent(
          `<div style="padding:6px 10px;font-size:12px;">${attraction.name} · 인기도 ${attraction.popularityScore}</div>`,
        );
        infoWindowRef.current.open(mapRef.current, marker);
      });
      attractionMarkersRef.current.push(marker);
    });
  }, [status, selectedCode, regions]);

  if (status === "no-key") {
    return (
      <div className="map-fallback">
        <p>
          지도를 보려면 카카오 개발자 센터에서 JavaScript 키를 발급받아{" "}
          <code>web/.env.local</code>에 <code>VITE_KAKAO_MAP_KEY</code>로 설정하세요.
        </p>
        <ul className="fallback-region-list">
          {regions.map((r) => (
            <li key={r.code}>
              {r.name} ({r.lat.toFixed(3)}, {r.lng.toFixed(3)})
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="map-fallback">
        카카오맵을 불러오지 못했습니다. API 키와 플랫폼(Web) 도메인 등록을 확인하세요.
      </div>
    );
  }

  return (
    <div className="map-view-wrap">
      <div ref={containerRef} className="map-view" />
      {status === "loading" && <div className="map-loading">지도를 불러오는 중…</div>}
    </div>
  );
}
