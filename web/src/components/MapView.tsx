import { useEffect, useRef, useState } from "react";
import { topAttractionsOf } from "../lib/recommend";
import type { Attraction, Person, Region } from "../lib/types";

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
  onSelectAttraction,
  people = [],
  liveAttractions = [],
}: {
  regions: Region[];
  highlightedCodes: Set<string>;
  selectedCode?: string;
  onSelectRegion: (r: Region) => void;
  onSelectAttraction: (a: Attraction) => void;
  /** 동행자 정보 — 지역 안 관광지 순위에도 연령대 선호도를 반영하기 위해 받는다. */
  people?: Person[];
  /** 카카오 카테고리 검색으로 실시간으로 찾은 주변 장소 — 큐레이션 마커와 다른
   * 색으로 지도에 함께 찍어 "지도에 더 다양한 값"을 보여준다. */
  liveAttractions?: Attraction[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const attractionMarkersRef = useRef<any[]>([]);
  const attractionLabelsRef = useRef<any[]>([]);
  const liveMarkersRef = useRef<any[]>([]);
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

  // 선택된 지역 안의 관광지 마커 + 이름 라벨 — 문서 4.3의 2단계 추천(지역 ->
  // 관광지)을 지도에서 실제 장소 이름까지 보여준다. 순위는 동행자 연령대
  // 선호도(attractionMatchScore)까지 반영한 매치 점수 기준이다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;

    attractionMarkersRef.current.forEach((m) => m.setMap(null));
    attractionMarkersRef.current = [];
    attractionLabelsRef.current.forEach((o) => o.setMap(null));
    attractionLabelsRef.current = [];

    const region = selectedCode ? regions.find((r) => r.code === selectedCode) : undefined;
    if (!region) return;

    topAttractionsOf(region, people, 6).forEach(({ attraction }, i) => {
      const position = new window.kakao.maps.LatLng(attraction.lat, attraction.lng);
      const marker = new window.kakao.maps.Marker({
        position,
        map: mapRef.current,
        image: new window.kakao.maps.MarkerImage(
          "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${i === 0 ? "%234f7fff" : "%2300e5c3"}" stroke="%230a0a0a" stroke-width="2"/></svg>`,
            ),
          new window.kakao.maps.Size(20, 20),
        ),
      });

      // 이름표를 항상 띄워서 클릭하지 않아도 실제 장소명이 바로 보이게 한다.
      const label = new window.kakao.maps.CustomOverlay({
        position,
        yAnchor: -0.3,
        content: `<div style="background:rgba(10,10,10,0.88);color:#f0f0f0;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${attraction.name}</div>`,
      });
      label.setMap(mapRef.current);
      attractionLabelsRef.current.push(label);

      window.kakao.maps.event.addListener(marker, "click", () => onSelectAttraction(attraction));
      attractionMarkersRef.current.push(marker);
    });
  }, [status, selectedCode, regions, people, onSelectAttraction]);

  // 카카오 카테고리 검색으로 실시간으로 찾은 주변 장소 — 큐레이션 마커(파랑/틸)와
  // 구분되는 주황 점으로 찍어 지도 위 관광지 데이터의 다양성을 넓힌다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;

    liveMarkersRef.current.forEach((m) => m.setMap(null));
    liveMarkersRef.current = [];

    liveAttractions.forEach((attraction) => {
      const position = new window.kakao.maps.LatLng(attraction.lat, attraction.lng);
      const marker = new window.kakao.maps.Marker({
        position,
        map: mapRef.current,
        image: new window.kakao.maps.MarkerImage(
          "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="%23e07a3a" stroke="%230a0a0a" stroke-width="1.5"/></svg>`,
            ),
          new window.kakao.maps.Size(14, 14),
        ),
      });
      window.kakao.maps.event.addListener(marker, "click", () => onSelectAttraction(attraction));
      liveMarkersRef.current.push(marker);
    });
  }, [status, liveAttractions, onSelectAttraction]);

  if (status === "no-key" || status === "error") {
    const shown = highlightedCodes.size > 0 ? regions.filter((r) => highlightedCodes.has(r.code)) : regions;
    return (
      <div className="map-fallback">
        <p>
          {status === "no-key" ? (
            <>
              지도를 보려면 카카오 개발자 센터에서 JavaScript 키를 발급받아{" "}
              <code>web/.env.local</code>에 <code>VITE_KAKAO_MAP_KEY</code>로 설정하세요.
            </>
          ) : (
            "카카오맵을 불러오지 못했습니다. API 키와 플랫폼(Web) 도메인 등록을 확인하세요."
          )}{" "}
          지도가 없어도 추천된 실제 장소는 아래에서 볼 수 있습니다.
        </p>
        <ul className="fallback-region-list">
          {shown.map((r) => {
            const top = topAttractionsOf(r, people, 4);
            return (
              <li key={r.code}>
                <strong>{r.name}</strong>
                {top.length > 0 && (
                  <>
                    {" — "}
                    {top.map(({ attraction }, i) => (
                      <span key={attraction.name}>
                        {i > 0 && ", "}
                        <button
                          type="button"
                          className="fallback-attraction-link"
                          onClick={() => onSelectAttraction(attraction)}
                        >
                          {attraction.name}
                        </button>
                      </span>
                    ))}
                  </>
                )}
              </li>
            );
          })}
        </ul>
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
