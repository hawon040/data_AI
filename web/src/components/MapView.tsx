import { useEffect, useRef, useState } from "react";
import { topAttractionsOf } from "../lib/recommend";
import type { MapSelection, MedicalPlace, NationalShelter, NationalSpot, PetPlace } from "../lib/nationalData";
import type { Attraction, Person, Region } from "../lib/types";

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;

function dotImage(svg: string, size: number) {
  return new window.kakao.maps.MarkerImage(
    "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    new window.kakao.maps.Size(size, size),
  );
}

function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=clusterer&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  });
}

type FallbackTab = "spot" | "pet" | "medical";
const FALLBACK_LIMIT = 30;

/**
 * 지도 키가 없을 때 쓰는 장소 목록. 지도 마커 대신 '관광지 / 반려동물 동반 / 의료관광' 탭으로 나누고,
 * 항목을 누르면 마커를 눌렀을 때와 같은 onSelectPlace를 불러 같은 상세 패널이 열린다.
 */
function FallbackPlaceTabs({
  spots,
  pets,
  medical,
  province,
  onSelectPlace,
}: {
  spots: NationalSpot[];
  pets: PetPlace[];
  medical: MedicalPlace[];
  province: string;
  onSelectPlace?: (selection: MapSelection) => void;
}) {
  const [tab, setTab] = useState<FallbackTab>("spot");
  const tabs: { id: FallbackTab; label: string; count: number }[] = [
    { id: "spot", label: "관광지", count: spots.length },
    { id: "pet", label: "반려동물 동반", count: pets.length },
    { id: "medical", label: "의료관광", count: medical.length },
  ];
  if (tabs.every((t) => t.count === 0)) return null;
  const active = tabs.find((t) => t.id === tab && t.count > 0) ?? tabs.find((t) => t.count > 0)!;

  return (
    <>
      <div className="segmented is-three fallback-tabs" role="tablist" aria-label="목록 종류">
        {tabs.map((t) => (
          <label key={t.id} aria-disabled={t.count === 0}>
            <input
              type="radio"
              name="fallback-tab"
              role="tab"
              aria-selected={active.id === t.id}
              checked={active.id === t.id}
              disabled={t.count === 0}
              onChange={() => setTab(t.id)}
            />
            <span>
              {t.label} {t.count.toLocaleString("ko-KR")}
            </span>
          </label>
        ))}
      </div>
      {province === "all" && pets.length === 0 && (
        <p className="fallback-tab-hint">도를 고르면 반려동물 동반 장소가 보여요</p>
      )}
      {active.id === "spot" && (
        <>
          <p className="fallback-national-heading">
            전국 관광지 {spots.length.toLocaleString("ko-KR")}곳 (수용인원 많은 순)
          </p>
          <ul className="fallback-region-list">
            {[...spots]
              .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
              .slice(0, FALLBACK_LIMIT)
              .map((spot) => (
                <li key={`${spot.name}-${spot.lat}`}>
                  <button
                    type="button"
                    className="fallback-attraction-link"
                    onClick={() => onSelectPlace?.({ type: "spot", place: spot })}
                  >
                    {spot.name}
                  </button>{" "}
                  — {spot.province} {spot.district}
                </li>
              ))}
          </ul>
        </>
      )}
      {active.id === "pet" && (
        <>
          <p className="fallback-national-heading">
            반려동물 동반 장소 {pets.length.toLocaleString("ko-KR")}곳
            {pets.length > FALLBACK_LIMIT && ` 중 ${FALLBACK_LIMIT}곳`} (한국관광공사 반려동물 동반여행)
          </p>
          <ul className="fallback-region-list">
            {pets.slice(0, FALLBACK_LIMIT).map((place) => (
              <li key={place.contentId || `${place.name}-${place.lat}`}>
                <button
                  type="button"
                  className="fallback-attraction-link"
                  onClick={() => onSelectPlace?.({ type: "pet", place })}
                >
                  {place.name}
                </button>{" "}
                — {[place.kind, place.address].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {active.id === "medical" && (
        <>
          <p className="fallback-national-heading">
            의료관광 기관 {medical.length.toLocaleString("ko-KR")}곳 (한국관광공사 의료관광정보)
          </p>
          <ul className="fallback-region-list">
            {medical.slice(0, FALLBACK_LIMIT).map((place) => (
              <li key={place.contentId || `${place.name}-${place.lat}`}>
                <button
                  type="button"
                  className="fallback-attraction-link"
                  onClick={() => onSelectPlace?.({ type: "medical", place })}
                >
                  {place.name}
                </button>{" "}
                — {place.address}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function MapView({
  regions,
  highlightedCodes,
  selectedCode,
  onSelectRegion,
  onSelectAttraction,
  people = [],
  liveAttractions = [],
  nationalSpots = [],
  shelters = [],
  pets = [],
  medical = [],
  province = "all",
  selectedPlace = null,
  onSelectPlace,
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
  /** 전국관광지정보표준데이터 — 선택한 시도(또는 전국)의 관광지를 클러스터로 찍는다. */
  nationalSpots?: NationalSpot[];
  /** 지진해일대피소 — 시도를 고르면 그 시도의 대피소를 함께 찍는다. */
  shelters?: NationalShelter[];
  /** 반려동물 동반여행 장소 — 시도를 고르면 클러스터로 찍는다. */
  pets?: PetPlace[];
  /** 의료 관광기관 */
  medical?: MedicalPlace[];
  /** 입력 폼에서 고른 도("all"이면 전국) */
  province?: string;
  selectedPlace?: { name: string; lat: number; lng: number } | null;
  onSelectPlace?: (selection: MapSelection) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const attractionMarkersRef = useRef<any[]>([]);
  const attractionLabelsRef = useRef<any[]>([]);
  const liveMarkersRef = useRef<any[]>([]);
  const clustererRef = useRef<any>(null);
  const petClustererRef = useRef<any>(null);
  const medicalMarkersRef = useRef<any[]>([]);
  const shelterMarkersRef = useRef<any[]>([]);
  const selectedSpotMarkerRef = useRef<any>(null);
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

  // 전국 관광지 — 수가 많아 클러스터로 묶고, 시도를 고르면 그 범위로 지도를 맞춘다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const { kakao } = window;
    clustererRef.current ??= new kakao.maps.MarkerClusterer({
      map: mapRef.current,
      averageCenter: true,
      minLevel: 9,
      styles: [{
        width: "36px",
        height: "36px",
        background: "rgba(53, 99, 217, 0.85)",
        border: "2px solid #fff",
        borderRadius: "50%",
        color: "#fff",
        textAlign: "center",
        fontWeight: "700",
        fontSize: "12px",
        lineHeight: "32px",
      }],
    });
    clustererRef.current.clear();

    const image = dotImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#3563d9" stroke="#fff" stroke-width="2"/></svg>`,
      14,
    );
    const markers = nationalSpots.map((spot) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(spot.lat, spot.lng),
        image,
        title: spot.name,
      });
      kakao.maps.event.addListener(marker, "click", () => onSelectPlace?.({ type: "spot", place: spot }));
      return marker;
    });
    clustererRef.current.addMarkers(markers);

    const provinces = new Set(nationalSpots.map((spot) => spot.province));
    if (nationalSpots.length > 0 && provinces.size === 1) {
      const bounds = new kakao.maps.LatLngBounds();
      nationalSpots.forEach((spot) => bounds.extend(new kakao.maps.LatLng(spot.lat, spot.lng)));
      mapRef.current.setBounds(bounds, 40, 40, 40, 40);
    }
  }, [status, nationalSpots, onSelectPlace]);

  // 반려동물 동반 장소 — 서울처럼 수천 곳인 시도도 있어 별도 클러스터로 묶는다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const { kakao } = window;
    petClustererRef.current ??= new kakao.maps.MarkerClusterer({
      map: mapRef.current,
      averageCenter: true,
      minLevel: 7,
      styles: [{
        width: "30px",
        height: "30px",
        background: "rgba(224, 122, 58, 0.88)",
        border: "2px solid #fff",
        borderRadius: "50%",
        color: "#fff",
        textAlign: "center",
        fontWeight: "700",
        fontSize: "11px",
        lineHeight: "26px",
      }],
    });
    petClustererRef.current.clear();
    const image = dotImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="#e07a3a" stroke="#fff" stroke-width="1.5"/></svg>`,
      12,
    );
    petClustererRef.current.addMarkers(
      pets.map((place) => {
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(place.lat, place.lng),
          image,
          title: `반려동물 동반 · ${place.name}`,
        });
        kakao.maps.event.addListener(marker, "click", () => onSelectPlace?.({ type: "pet", place }));
        return marker;
      }),
    );
  }, [status, pets, onSelectPlace]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    medicalMarkersRef.current.forEach((m) => m.setMap(null));
    const image = dotImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="4" fill="#d6455d" stroke="#fff" stroke-width="1.5"/><path d="M8 4.5v7M4.5 8h7" stroke="#fff" stroke-width="2"/></svg>`,
      16,
    );
    medicalMarkersRef.current = medical.map((place) => {
      const marker = new window.kakao.maps.Marker({
        map: mapRef.current,
        position: new window.kakao.maps.LatLng(place.lat, place.lng),
        image,
        title: `의료 관광 · ${place.name}`,
      });
      window.kakao.maps.event.addListener(marker, "click", () => onSelectPlace?.({ type: "medical", place }));
      return marker;
    });
  }, [status, medical, onSelectPlace]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    shelterMarkersRef.current.forEach((m) => m.setMap(null));
    const image = dotImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><rect x="2" y="2" width="10" height="10" rx="2" fill="#0f9d6b" stroke="#fff" stroke-width="2"/></svg>`,
      14,
    );
    shelterMarkersRef.current = shelters.map(
      (shelter) =>
        new window.kakao.maps.Marker({
          map: mapRef.current,
          position: new window.kakao.maps.LatLng(shelter.lat, shelter.lng),
          image,
          title: `지진해일대피소 · ${shelter.name}`,
        }),
    );
  }, [status, shelters]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    selectedSpotMarkerRef.current?.setMap(null);
    selectedSpotMarkerRef.current = null;
    if (!selectedPlace) return;
    const position = new window.kakao.maps.LatLng(selectedPlace.lat, selectedPlace.lng);
    selectedSpotMarkerRef.current = new window.kakao.maps.CustomOverlay({
      map: mapRef.current,
      position,
      yAnchor: 1.6,
      content: `<div style="background:#172033;color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${selectedPlace.name.replace(/[<>&]/g, "")}</div>`,
    });
    mapRef.current.setLevel(Math.min(mapRef.current.getLevel(), 7));
    mapRef.current.panTo(position);
  }, [status, selectedPlace]);

  if (status === "no-key" || status === "error") {
    const shown = highlightedCodes.size > 0 ? regions.filter((r) => highlightedCodes.has(r.code)) : regions;
    return (
      <div className="map-fallback">
        {/* 지도 키 설정 방법은 web/README.md에 있다. 사용자에게는 개발자용 안내를 보여 주지 않는다. */}
        <p className="map-fallback-message">지도를 불러오지 못했어요. 아래 목록에서 장소를 확인하세요.</p>
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
        <FallbackPlaceTabs
          spots={nationalSpots}
          pets={pets}
          medical={medical}
          province={province}
          onSelectPlace={onSelectPlace}
        />
      </div>
    );
  }

  return (
    <div className="map-view-wrap">
      <div ref={containerRef} className="map-view" />
      {status === "ready" && (nationalSpots.length > 0 || shelters.length > 0) && (
        <div className="map-legend" aria-hidden="true">
          <span><i className="legend-spot" />관광지 {nationalSpots.length}</span>
          {shelters.length > 0 && <span><i className="legend-shelter" />지진해일대피소 {shelters.length}</span>}
          {pets.length > 0 && <span><i className="legend-pet" />반려동물 동반 {pets.length}</span>}
          {medical.length > 0 && <span><i className="legend-medical" />의료 관광 {medical.length}</span>}
          <span><i className="legend-pick" />맞춤 추천 관광지</span>
        </div>
      )}
      {status === "loading" && <div className="map-loading">지도를 불러오는 중…</div>}
    </div>
  );
}
