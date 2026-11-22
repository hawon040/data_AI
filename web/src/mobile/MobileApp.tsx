import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AccessibilityInfo } from "../components/AccessibilityInfo";
import { CompanionForm } from "../components/CompanionForm";
import { DistanceExcludedList } from "../components/DistanceExcludedList";
import { MapAreaPicker } from "../components/MapAreaPicker";
import { RandomTripPicker } from "../components/RandomTripPicker";
import { TravelTimeExcludedList } from "../components/TravelTimeExcludedList";
import { WarningBanner } from "../components/WarningBanner";
import { WeatherExcludedList } from "../components/WeatherExcludedList";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { SIGUNGU } from "../data/sigungu";
import { attractionMeta, categoryChips } from "../lib/cardInfo";
import { buildChecklist, type Checklist, type ChecklistFocus } from "../lib/checklist";
import { kakaoDirectionsUrl } from "../lib/kakaoLocal";
import { toAccessSummary, useAttractionAccessMap, type AccessParty } from "../lib/liveAccess";
import { worstOf } from "../lib/liveWeather";
import { NATIONWIDE, type MapArea } from "../lib/mapArea";
import {
  effectiveRanking,
  formatKm,
  haversineKm,
  isLowAccuracy,
  locateCurrentPosition,
  LOW_ACCURACY_MESSAGE,
  nearestAttractionKm,
  NEEDS_ORIGIN_MESSAGE,
  NO_NEARBY_MESSAGE,
  type Origin,
} from "../lib/origin";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import { FAR_DAY_TRIP_BADGE, isFarForDayTrip, travelHours, travelLabel } from "../lib/travelTime";
import {
  allowedForParty,
  DEFAULT_TRIP_PREFERENCES,
  TRANSPORT_OPTIONS,
  tripSeason,
  type TripPreferences,
} from "../lib/tripPreferences";
import { AGE_GROUP_LABELS, type Attraction, type Person, type Region } from "../lib/types";
import { useTripEngine } from "../lib/useTripEngine";
import { weatherBrief, type WeatherBrief } from "../lib/weatherBrief";
import { INDOOR_RETRY_LABEL } from "../lib/weatherExclusions";
import { MobileFooter } from "./MobileHome";
import { MobileHeader } from "./MobileHeader";
import { MobileMap, type MobileMapMarker } from "./MobileMap";
import "./mobile.css";

type View = "map" | "region" | "results" | "place" | "done";
const VIEWS: View[] = ["map", "region", "results", "place", "done"];

/** 출발지(내 위치·직접 고른 곳)가 없을 때 지도 중심으로만 쓰는 예시 위치(서울 중구). 거리 계산에는 쓰지 않는다. */
const SAMPLE_POSITION = { lat: 37.5641, lng: 126.9979 };
const KOREA_CENTER = { lat: 36.3, lng: 127.8 };

function transportLabel(transport: TripPreferences["transport"]): string {
  return TRANSPORT_OPTIONS.find((option) => option.value === transport)?.label ?? "";
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${year}. ${month}. ${day}.`;
}

function durationLabel(preferences: TripPreferences): string {
  return preferences.duration === "day" ? "당일치기" : `${preferences.nights}박`;
}

/** "지도에서 볼 지역"의 지도 중심·확대 수준. 시·도는 시군구 대표점의 평균, 시·군·구는 그 대표점. */
function areaView(area: MapArea): { center: { lat: number; lng: number }; level: number } {
  const rows = SIGUNGU[area.province] ?? [];
  const district = rows.find(([name]) => name === area.district);
  if (district) return { center: { lat: district[1], lng: district[2] }, level: 8 };
  if (rows.length === 0) return { center: KOREA_CENTER, level: 13 };
  const lat = rows.reduce((sum, row) => sum + row[1], 0) / rows.length;
  const lng = rows.reduce((sum, row) => sum + row[2], 0) / rows.length;
  return { center: { lat, lng }, level: 10 };
}

/**
 * 모바일 02~07 (Figma): 지도 → 추천 지역 → 추천 결과 → 장소·안전 정보 → 카카오맵 이동 확인 → 완료.
 * 화면 단계는 주소의 ?v= 로 두어 브라우저 뒤로 가기가 한 단계씩 돌아간다.
 * 출발지는 하나다: 지도의 "◎ 내 위치"(허용 시) 또는 여행 조건에서 직접 고른 시·군·구. 거리·도보·자전거 거르기에 같이 쓴다.
 * 위치는 이 브라우저 안에서만 쓰고, 길찾기 클릭·평가 같은 이용 기록은 어디에도 보내거나 저장하지 않는다.
 */
export function MobileApp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const weatherDemo = searchParams.get("demo") === "weather";

  const [people, setPeople] = useState<Person[] | null>(null);
  const [safetyFilters, setSafetyFilters] = useState<SafetyDisplayFilters>({
    withChildren: false,
    withElderly: false,
    nightPlan: false,
  });
  const [tripPreferences, setTripPreferences] = useState<TripPreferences>(() => {
    // 홈의 "여행 찾기"에서 고른 일정을 이어받는다(지역은 아래 '지도에서 볼 지역'으로).
    const duration = searchParams.get("duration");
    return { ...DEFAULT_TRIP_PREFERENCES, duration: duration === "overnight" ? "overnight" : "day" };
  });
  // "지도에서 볼 지역": 추천 결과 지도만 옮기고 추천은 바꾸지 않는다(PC와 같다). 홈에서 고른 시·도로 시작한다.
  const [mapArea, setMapArea] = useState<MapArea>(() => {
    const province = searchParams.get("province");
    return province && SIGUNGU[province] ? { province, district: "all" } : NATIONWIDE;
  });
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [attraction, setAttraction] = useState<Attraction | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [indoorRetry, setIndoorRetry] = useState(false);
  const [rankingTouched, setRankingTouched] = useState(false);

  // 출발지 하나: ◎ 내 위치(gps) 또는 직접 고른 시·군·구(district).
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const ranking = effectiveRanking({
    stored: tripPreferences.ranking,
    touched: rankingTouched,
    hasOrigin: origin != null,
    duration: tripPreferences.duration,
  });
  const engine = useTripEngine({ people, safetyFilters, tripPreferences, weatherDemo, origin, indoorRetry, ranking });
  const {
    recommendations,
    exploreRecommendations,
    weatherDecisions,
    regionWeather,
    weatherLoading,
    weatherPreset,
    weatherRestricted,
    weatherApplied,
    distance,
    distanceExclusions,
    travelExclusions,
    weatherExclusions,
    purposeEmptyItems,
    excludedByRegion,
  } = engine;

  const requested = searchParams.get("v") as View | null;
  const featuredRegion: Region =
    recommendations[0]?.region ?? [...SAMPLE_REGIONS].sort((a, b) => b.totalVisitors - a.totalVisitors)[0];
  const selectedRegion = SAMPLE_REGIONS.find((region) => region.code === regionCode) ?? null;
  const allItems = [...recommendations, ...exploreRecommendations];
  const selectedItem = allItems.find((item) => item.region.code === selectedRegion?.code) ?? null;

  // 필요한 값이 없는 단계는 지도로 돌려보낸다(새로고침 등).
  let view: View = requested && VIEWS.includes(requested) ? requested : "map";
  if (view === "region" && !selectedRegion) view = "map";
  if (view === "results" && people == null) view = "map";
  if ((view === "place" || view === "done") && (!attraction || !selectedRegion)) view = "map";

  const go = useCallback(
    (next: View) => {
      setDirectionsOpen(false);
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          params.set("v", next);
          return params;
        },
        { replace: false },
      );
      window.scrollTo({ top: 0 });
    },
    [setSearchParams],
  );

  const clearSelection = () => {
    setRegionCode(null);
    setAttraction(null);
  };

  /** ◎ 내 위치: 허용하면 그 위치가 출발지가 된다(직접 고른 출발지를 바꾼다). */
  async function locate() {
    setLocationNotice(null);
    setLocating(true);
    const result = await locateCurrentPosition();
    setLocating(false);
    if (result.ok) {
      setOrigin(result.origin);
      clearSelection();
      if (view === "region") go("map");
    } else {
      setLocationNotice(
        "위치를 가져오지 못했어요. 아래 여행 조건의 '출발지'에서 시·군·구를 직접 골라 주세요. 지금 지도는 예시 위치(서울 중구)예요.",
      );
    }
  }

  function openPlace(region: Region, spot: Attraction) {
    setRegionCode(region.code);
    setAttraction(spot);
    go("place");
  }

  // 지도에 쓰는 날씨(일정 중 가장 나쁜 값). 시연 모드면 예시 날씨.
  const weatherOf = (code: string) => (weatherDemo ? weatherPreset.weather : regionWeather[code]?.worst ?? null);
  /** 결과 카드·장소 상세의 날씨 한 줄(하늘·기온·강수확률·미세먼지). 판정 문장과 별개로 항상 보여 준다. */
  const briefOf = (code: string): WeatherBrief => weatherBrief(regionWeather[code], weatherDemo ? weatherPreset.weather : null);
  const { withElderly, withChildren } = safetyFilters;
  const party: AccessParty = useMemo(() => ({ withElderly, withChildren }), [withElderly, withChildren]);
  const cardAttractions = (region: Region) =>
    allItems.find((item) => item.region.code === region.code)?.topAttractions.map(({ attraction: a }) => a) ?? [];

  // 무장애 편의 정보(한국관광공사, PC와 같은 lib/liveAccess.ts): 결과 카드 배지·장소 상세 칸·준비물 한 줄. 추천 순서는 바꾸지 않는다.
  const accessTargets = useMemo(() => {
    const byName = new Map<string, Attraction>();
    if (people != null) {
      for (const item of [...recommendations, ...exploreRecommendations]) {
        for (const { attraction: a } of item.topAttractions) byName.set(a.name, a);
      }
    }
    if (attraction) byName.set(attraction.name, attraction);
    return [...byName.values()];
  }, [people, recommendations, exploreRecommendations, attraction]);
  const accessMap = useAttractionAccessMap(accessTargets, party);
  const accessBadge = (spot: Attraction) => toAccessSummary(spot.name, accessMap[spot.name]).hasInfo;
  /** 준비물: 결과 화면은 공통, 장소 상세는 공통 → 지역 → 관광지 순서로 쌓는다. */
  const checklistFor = (focus: ChecklistFocus): Checklist => {
    const focusRegion = focus.kind === "common" ? null : focus.region;
    return buildChecklist({
      preferences: tripPreferences,
      party,
      commonWeather: worstOf(
        recommendations.map(({ region }) => weatherOf(region.code)).filter((w): w is NonNullable<typeof w> => w != null),
      ),
      regionWeather: focusRegion ? weatherOf(focusRegion.code) : null,
      regionWeatherTips: focusRegion && !weatherDemo ? regionWeather[focusRegion.code]?.tips ?? [] : [],
      // PC와 같이 어르신(60대 이상)·아이 동반일 때만 필요한 시설 한 줄을 넣는다.
      accessTip:
        focus.kind === "attraction" && (withElderly || withChildren)
          ? toAccessSummary(focus.attraction.name, accessMap[focus.attraction.name]).prepTip
          : null,
      travelHours: !origin
        ? null
        : focus.kind === "attraction"
          ? travelHours(haversineKm(origin, focus.attraction), tripPreferences.transport)
          : focus.kind === "region"
            ? (() => {
                const item = allItems.find((i) => i.region.code === focus.region.code);
                const km = item ? nearestAttractionKm(item, origin) : null;
                return km != null ? travelHours(km, tripPreferences.transport) : null;
              })()
            : null,
      focus,
    });
  };

  const base = origin ?? SAMPLE_POSITION;
  const originMarkerLabel = origin ? (origin.source === "gps" ? "현재 위치" : `출발지 · ${origin.label}`) : "현재 위치 · 서울 중구 (예시)";
  const mapMarkers = ((): MobileMapMarker[] => {
    if (view === "results") {
      const markers: MobileMapMarker[] = recommendations.map((item) => ({
        id: item.region.code,
        lat: item.region.lat,
        lng: item.region.lng,
        label: item.region.name,
        tone: "region" as const,
      }));
      if (origin) markers.push({ id: "me", lat: origin.lat, lng: origin.lng, label: originMarkerLabel, tone: "me" });
      return markers;
    }
    const markers: MobileMapMarker[] = [];
    if (view === "region" && selectedRegion) {
      markers.push({
        id: selectedRegion.code,
        lat: selectedRegion.lat,
        lng: selectedRegion.lng,
        label: `${selectedRegion.name} · 추천 지역`,
        tone: "selected",
      });
    } else {
      markers.push({ id: "me", lat: base.lat, lng: base.lng, label: originMarkerLabel, tone: "me" });
      markers.push({ id: "me-label", lat: base.lat, lng: base.lng, label: originMarkerLabel, tone: "region" });
    }
    return markers;
  })();
  const accuracyCircle =
    origin?.source === "gps" && origin.accuracy != null ? { lat: origin.lat, lng: origin.lng, radius: origin.accuracy } : null;
  const lowAccuracy = isLowAccuracy(origin);
  const accuracyNotice = lowAccuracy && origin?.accuracy != null && (
    <p className="m-status m-warning" role="status">
      {LOW_ACCURACY_MESSAGE} (오차 {formatKm(origin.accuracy / 1000)}). 아래 &apos;출발지&apos;에서 시·군·구를
      직접 고르면 더 정확해요.
    </p>
  );

  const form = (
    <div id="m-form" className="m-form">
      <CompanionForm
        regions={SAMPLE_REGIONS}
        preferences={{ ...tripPreferences, ranking }}
        weatherDemo={weatherDemo}
        origin={origin}
        onOriginChange={(next) => {
          setOrigin(next);
          setLocationNotice(null);
          clearSelection();
        }}
        showOriginLocate={false}
        onPreferencesChange={(preferences) => {
          if (preferences.ranking !== ranking) setRankingTouched(true);
          setTripPreferences(preferences);
          setIndoorRetry(false);
          clearSelection();
        }}
        onSubmit={(next, filters) => {
          setPeople(next);
          setSafetyFilters(filters);
          clearSelection();
          go("results");
        }}
      />
      {origin?.source === "gps" && <p className="m-hint m-hint-small">출발지: 현재 위치(◎ 내 위치). 다른 곳에서 출발하면 위에서 시·군·구를 골라 주세요.</p>}
    </div>
  );
  const season = tripSeason(tripPreferences);

  if (view === "done" && attraction && selectedRegion) {
    return (
      <div className="m-shell" data-season={season}>
        <MobileHeader showNav />
        <main className="m-main">
          <Breadcrumb current="길찾기 실행 완료" />
          <DirectionsDone
            attraction={attraction}
            region={selectedRegion}
            preferences={tripPreferences}
            onBackToResults={() => go("results")}
            onBackToPlace={() => go("place")}
          />
        </main>
        <MobileFooter />
      </div>
    );
  }

  if (view === "place" && attraction && selectedRegion) {
    const decision = weatherDecisions[selectedRegion.code];
    const km = origin ? haversineKm(origin, attraction) : null;
    const checklist = checklistFor({
      kind: "attraction",
      region: selectedRegion,
      attractions: cardAttractions(selectedRegion),
      attraction,
    });
    return (
      <div className="m-shell" data-season={season}>
        <MobileHeader showNav />
        <main className="m-main">
          <Breadcrumb current="장소 상세" />
          <PlaceScreen
            attraction={attraction}
            region={selectedRegion}
            preferences={tripPreferences}
            distanceLabel={km != null ? `출발지에서 ${travelLabel(km, tripPreferences.transport)}` : null}
            weather={
              people == null
                ? null
                : weatherLoading
                  ? "loading"
                  : { brief: briefOf(selectedRegion.code), summary: decision?.summary ?? null }
            }
            party={party}
            checklist={checklist}
            onBack={() => go("results")}
            onDirections={() => setDirectionsOpen(true)}
          />
        </main>
        <MobileFooter />
        {directionsOpen && (
          <DirectionsModal
            attraction={attraction}
            region={selectedRegion}
            onClose={() => setDirectionsOpen(false)}
            onOpen={() => {
              window.open(kakaoDirectionsUrl(attraction.name, attraction.lat, attraction.lng), "_blank", "noopener");
              setDirectionsOpen(false);
              go("done");
            }}
          />
        )}
      </div>
    );
  }

  if (view === "results" && people != null) {
    const ageLabels = people.length
      ? people.map((person) => AGE_GROUP_LABELS[person.ageGroup]).join(" · ")
      : "연령대 입력 없음";
    const resultsMap = areaView(mapArea);
    const emptyMessage =
      distance.limitKm != null && origin && weatherApplied.length > 0
        ? NO_NEARBY_MESSAGE
        : weatherRestricted
          ? "방문일 날씨 기준에 맞는 관광지가 이 조건에는 없어요. 목적을 넓히거나 다른 날짜를 골라 보세요."
          : "현재 조건에 맞는 여행지가 없어요. 목적이나 스타일을 넓혀 보세요.";
    // 기상특보 배너(PC와 같은 WarningBanner): 추천 지역마다 그 시군구 특보, 없으면 같은 시도 인근 시군 특보.
    // 시연 모드는 예시 날씨 하나를 모든 지역에 쓰므로 1위 지역 하나만 보여 준다. 같은 인근 특보는 한 번만 보여 준다.
    const warningRegions = weatherDemo ? recommendations.slice(0, 1) : recommendations;
    const shownNearby = new Set<string>();
    const warningBanners = warningRegions.flatMap(({ region }) => {
      const days = regionWeather[region.code]?.days ?? [];
      const here = weatherDemo
        ? weatherPreset.weather.warnings.map((kind) => `${kind}특보`)
        : [...new Set(days.flatMap((day) => day.warningsHere))];
      const nearby = weatherDemo ? [] : [...new Set(days.flatMap((day) => day.warningsNearby))];
      if (here.length === 0) {
        const key = `${region.province}|${nearby.join(",")}`;
        if (nearby.length === 0 || shownNearby.has(key)) return [];
        shownNearby.add(key);
      }
      return [
        <WarningBanner
          key={region.code}
          regionName={region.name}
          here={here}
          nearby={nearby}
          terrainExcluded={(weatherDecisions[region.code]?.excludedTerrains.length ?? 0) > 0}
          nameNearby
        />,
      ];
    });
    return (
      <div className="m-shell" data-season={season}>
        <MobileHeader />
        <main className="m-main">
          <h1 className="m-page-title">여행 추천 결과</h1>
          {warningBanners.length > 0 && (
            <div className="m-warnings" aria-label="기상특보">
              {warningBanners}
            </div>
          )}
          <section className="m-card m-summary" aria-label="여행 조건 요약">
            <strong>
              {formatDate(tripPreferences.visitDate)} · {durationLabel(tripPreferences)}
            </strong>
            <p>
              {origin ? `출발 ${origin.label}` : "출발지 미정"} · {transportLabel(tripPreferences.transport)} · {ageLabels}
            </p>
            <button
              type="button"
              className="m-soft-button"
              onClick={() => document.getElementById("m-form")?.scrollIntoView({ behavior: "smooth" })}
            >
              여행 조건 확인·변경 ↓
            </button>
          </section>

          <div className="m-area-picker">
            <MapAreaPicker area={mapArea} onChange={setMapArea} />
          </div>
          <MobileMap center={resultsMap.center} level={resultsMap.level} markers={mapMarkers} height={200} />

          {weatherLoading && <p className="m-status" role="status">방문일 날씨를 확인하는 중…</p>}
          {distance.needsOrigin && (
            <p className="m-status m-warning" role="status">
              {NEEDS_ORIGIN_MESSAGE}. 지도 화면의 ◎ 내 위치를 누르거나 아래 &apos;출발지&apos;를 골라 주세요.
            </p>
          )}
          {accuracyNotice}
          {indoorRetry && <p className="m-status">실내 관광지만으로 다시 추천했어요. 여행 조건을 바꾸면 원래대로 추천해요.</p>}
          <RandomTripPicker
            className="m-pen"
            regions={SAMPLE_REGIONS}
            people={people}
            withChildren={safetyFilters.withChildren}
            onPick={() => {}}
            onOpen={openPlace}
          />
          {recommendations.length === 0 && !weatherLoading ? (
            <>
              <p className="m-status">{emptyMessage}</p>
              {purposeEmptyItems.length > 0 && (
                <button
                  type="button"
                  className="m-primary-button"
                  onClick={() => {
                    // 목적을 '전체'로 바꾸고 실내 관광지만으로 다시 추천한다(PC와 같다).
                    setTripPreferences((current) => ({ ...current, purpose: "all" }));
                    setIndoorRetry(true);
                    clearSelection();
                  }}
                >
                  {INDOOR_RETRY_LABEL}
                </button>
              )}
            </>
          ) : (
            <ol className="m-results">
              {recommendations.flatMap((item, index) => {
                const top = item.topAttractions[0]?.attraction;
                if (!top) return [];
                const weather = weatherDecisions[item.region.code]?.summary;
                const brief = briefOf(item.region.code);
                const excluded = excludedByRegion.get(item.region.code) ?? [];
                const chips = categoryChips([
                  ...item.topAttractions.map(({ attraction: a }) => a),
                  ...excluded.map(({ attraction: a }) => a),
                ]);
                const nearestKm = origin ? nearestAttractionKm(item, origin) : null;
                const far = isFarForDayTrip(
                  nearestKm != null ? travelHours(nearestKm, tripPreferences.transport) : null,
                  tripPreferences.duration,
                );
                return (
                  <li key={item.region.code} className="m-card m-result">
                    <div className="m-result-thumb">
                      <div className="m-result-head">
                        <span>{attractionMeta(top)}</span>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <p className="m-result-title">{top.name}</p>
                      <button type="button" className="m-result-link" onClick={() => openPlace(item.region, top)}>
                        장소·안전 정보 보기 →
                      </button>
                    </div>
                    <h2 className="m-result-sub">
                      {item.region.name} · {top.name}
                      {accessBadge(top) && <span className="m-badge m-badge-access">편의 정보</span>}
                    </h2>
                    {chips.length > 0 && (
                      <ul className="m-chips" aria-label="이 지역 관광지 카테고리">
                        {chips.map((chip) => (
                          <li key={chip}>{chip}</li>
                        ))}
                      </ul>
                    )}
                    {nearestKm != null && (
                      <p className="m-result-distance">
                        가장 가까운 관광지까지 {travelLabel(nearestKm, tripPreferences.transport)}
                        {far && <span className="m-badge">{FAR_DAY_TRIP_BADGE}</span>}
                      </p>
                    )}
                    <p className={`m-result-weather${weatherLoading || brief.kind !== "ok" ? " is-muted" : ""}`}>
                      {weatherLoading ? "방문일 날씨를 확인하는 중…" : brief.text}
                      {!weatherLoading && weather && <span className="m-result-weather-rule">{weather}</span>}
                    </p>
                    <p className="m-result-body">{item.evidence.slice(0, 2).join(" ")}</p>
                    {item.topAttractions.length > 1 && (
                      <ul className="m-spot-list" aria-label={`${item.region.name} 추천 관광지`}>
                        {item.topAttractions.slice(0, 4).map(({ attraction: spot }) => (
                          <li key={spot.name}>
                            <button type="button" onClick={() => openPlace(item.region, spot)}>
                              <strong>
                                {spot.name}
                                {accessBadge(spot) && <span className="m-badge m-badge-access">편의 정보</span>}
                              </strong>
                              <span>
                                {attractionMeta(spot)}
                                {origin && ` · ${travelLabel(haversineKm(origin, spot), tripPreferences.transport)}`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {excluded.length > 0 && (
                      <p className="m-note">
                        {excluded.map(({ attraction: a, label }) => `${a.name}(${label})`).join(", ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="m-excluded">
            <WeatherExcludedList items={weatherExclusions} />
            <DistanceExcludedList items={distanceExclusions} limitKm={distance.limitKm} />
            <TravelTimeExcludedList items={travelExclusions} maxHours={tripPreferences.maxTravelHours} />
          </div>
          {recommendations.length > 0 && <MobileChecklist checklist={checklistFor({ kind: "common" })} />}
          {form}
        </main>
        <MobileFooter />
      </div>
    );
  }

  // 02 현재 위치 지도 / 03 추천 지역 지도
  const inRegion = view === "region" && selectedRegion;
  const cardRegion = inRegion ? selectedRegion : featuredRegion;
  // 아이·청소년 동반이면 카지노 등은 예시 카드에도 보이지 않게 동행자 기준으로 거른다.
  const regionSpots = cardRegion.attractions.filter((spot) => allowedForParty(spot, people ?? [], safetyFilters));
  const cardTop = (inRegion ? selectedItem?.topAttractions[0]?.attraction : null) ?? regionSpots[0] ?? null;
  const cardWeather = inRegion && people != null ? weatherDecisions[cardRegion.code]?.summary : null;
  const cardChips = categoryChips(selectedItem && inRegion ? selectedItem.topAttractions.map(({ attraction: a }) => a) : regionSpots);
  return (
    <div className="m-shell m-has-tabs" data-season={season}>
      <MobileHeader />
      <main className="m-main m-main-flush">
        <div className="m-pad">
          <h1 className="m-page-title">{inRegion ? "추천 지역을 둘러보고 있어요" : "내 위치 중심으로 둘러보기"}</h1>
          <p className="m-subtle">
            {inRegion
              ? `${selectedRegion.province} ${selectedRegion.name} · 선택한 추천 지역`
              : origin
                ? origin.source === "gps"
                  ? "현재 위치 · 위치는 이 기기에서만 사용해요"
                  : `출발지 · ${origin.label}`
                : "현재 위치 · 서울특별시 중구 (예시)"}
          </p>
        </div>
        <MobileMap
          center={inRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : base}
          level={inRegion ? 7 : lowAccuracy ? 9 : 8}
          markers={mapMarkers}
          locating={locating}
          onMyLocation={() => void locate()}
          onWholeKorea={() => setRegionCode(null)}
          accuracy={inRegion ? null : accuracyCircle}
        />
        {locationNotice && <p className="m-status m-pad" role="status">{locationNotice}</p>}
        {!inRegion && accuracyNotice && <div className="m-pad">{accuracyNotice}</div>}

        <section className="m-pad m-region-panel" aria-labelledby="m-region-title">
          <h2 id="m-region-title" className="m-section-title">
            {origin?.source === "district" ? "고른 출발지에서 시작하는 여행" : "내 위치에서 시작하는 여행"}
          </h2>
          <p className="m-subtle">
            {origin ? `${origin.source === "gps" ? "현재 위치" : origin.label} 기준` : "서울 중구 기준 · 위치 예시"}
          </p>
          <h3 className="m-ask">어디로 떠나볼까요?</h3>
          <article className="m-card m-region-card m-tinted">
            <p className="m-eyebrow m-blue">{inRegion ? "선택한 추천 지역" : "추천 지역"}</p>
            <p className="m-region-name">{cardRegion.name}</p>
            {cardChips.length > 0 && (
              <ul className="m-chips" aria-label="이 지역 관광지 카테고리">
                {cardChips.map((chip) => (
                  <li key={chip}>{chip}</li>
                ))}
              </ul>
            )}
            {inRegion && cardTop && (
              <>
                <p className="m-region-spot">
                  {cardRegion.name} · {cardTop.name}
                </p>
                <p className="m-region-line">{attractionMeta(cardTop)}</p>
                {selectedItem && <p className="m-region-line">{selectedItem.evidence.slice(0, 2).join(" ")}</p>}
                {cardWeather && <p className="m-region-weather">{cardWeather}</p>}
                {!selectedItem && <p className="m-region-note">추천 정보 예시</p>}
              </>
            )}
            <button
              type="button"
              className="m-primary-button"
              disabled={Boolean(inRegion)}
              onClick={() => {
                setRegionCode(cardRegion.code);
                go("region");
              }}
            >
              {inRegion ? `${cardRegion.name} 지도 보는 중` : "이 지역으로 지도 이동 →"}
            </button>
          </article>
          <p className="m-hint">
            {inRegion
              ? `여행 조건은 그대로 두고 지도 중심만 ${cardRegion.name}으로 이동했어요`
              : "추천 지역을 선택하면 그 지역 중심으로 지도가 이동해요"}
          </p>
          <p className="m-hint m-hint-small">
            지역을 선택해도 여행 조건은 유지돼요.
            <br />◎ 내 위치를 누르면 그 위치가 출발지가 돼요. 위치는 서버에 저장하지 않아요.
          </p>
        </section>

        <div className="m-pad">{form}</div>
      </main>
      <nav className="m-tabs" aria-label="화면 이동">
        <button type="button" className="is-active" aria-current="page" onClick={() => setRegionCode(null)}>
          지도
        </button>
        <button
          type="button"
          onClick={() => (people != null ? go("results") : document.getElementById("m-form")?.scrollIntoView({ behavior: "smooth" }))}
        >
          추천
        </button>
        <a href="https://www.e-gen.or.kr" target="_blank" rel="noreferrer">
          응급
        </a>
        <a href="/service">더보기</a>
      </nav>
    </div>
  );
}

/** 준비물 체크리스트(공통 → 지역 → 관광지). PC의 TripPreparation과 같은 buildChecklist 결과를 모바일 카드로 그린다. */
function MobileChecklist({ checklist }: { checklist: Checklist }) {
  let number = 0;
  return (
    <section className="m-card m-block" aria-labelledby="m-checklist-title">
      <h2 id="m-checklist-title">
        방문 전 체크
        {checklist.scopeLabel && <span className="m-scope">{checklist.scopeLabel}</span>}
      </h2>
      {checklist.sections.map((section, index) => (
        <div key={section.title} className="m-checklist-section">
          {checklist.sections.length > 1 && <h3>{index === 0 ? "공통" : section.title}</h3>}
          <ol className="m-checklist">
            {section.lines.map((line) => {
              number += 1;
              return (
                <li key={line}>
                  <span>{String(number).padStart(2, "0")}</span>
                  {line}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {checklist.hint && <p className="m-note">{checklist.hint.replace("지역이나 관광지를 누르면", "관광지를 누르면")}</p>}
      <p className="m-note">준비물과 이동 정보는 일반 안내예요. 운영 시간·교통편·날씨를 출발 전에 다시 확인해 주세요.</p>
    </section>
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav className="m-breadcrumb" aria-label="현재 위치">
      <a href="/">홈</a> / <span>여행 추천 결과</span> / <span aria-current="page">{current}</span>
    </nav>
  );
}

function PlaceScreen({
  attraction,
  region,
  preferences,
  distanceLabel,
  weather,
  party,
  checklist,
  onBack,
  onDirections,
}: {
  attraction: Attraction;
  region: Region;
  preferences: TripPreferences;
  distanceLabel: string | null;
  /** 추천받기 전이면 null, 불러오는 중이면 "loading" */
  weather: null | "loading" | { brief: WeatherBrief; summary: string | null };
  party: AccessParty;
  checklist: Checklist;
  onBack: () => void;
  onDirections: () => void;
}) {
  return (
    <>
      <button type="button" className="m-outline-button m-back" onClick={onBack}>
        ← 추천 결과
      </button>
      <h1 className="m-place-title">{attraction.name}</h1>
      <p className="m-subtle">
        {region.province} {region.name} · {attractionMeta(attraction)} · {durationLabel(preferences)}
      </p>

      <section className="m-card m-block">
        <h2>{region.name}에서 만나는 곳</h2>
        <ul className="m-chips" aria-label="카테고리">
          {categoryChips([attraction]).map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
          <li>{attractionMeta(attraction).split(" · ").pop()}</li>
        </ul>
        {distanceLabel && <p>{distanceLabel}</p>}
        <p className="m-note">운영 시간과 매장 운영 여부는 방문 전에 확인해 주세요.</p>
      </section>

      {weather === "loading" ? (
        <p className="m-status" role="status">방문일 날씨를 확인하는 중…</p>
      ) : (
        weather && (
          <section
            className={`m-card m-callout${weather.brief.kind === "ok" ? "" : " is-muted"}`}
            aria-label={`${region.name} 방문일 날씨`}
          >
            <p className="m-eyebrow">{region.name} 방문일 날씨</p>
            <strong>{weather.brief.text}</strong>
            {weather.summary && <p className="m-callout-rule">{weather.summary}</p>}
            <p>추천 결과 기준이에요. 출발 전 최신 날씨를 확인해 주세요.</p>
          </section>
        )
      )}

      <AccessibilityInfo
        attraction={attraction}
        party={party}
        hideWhenEmpty
        headingLevel="h2"
        className="m-card m-block m-access"
      />

      <MobileChecklist checklist={checklist} />

      <section className="m-card m-block">
        <h2>주변 안전 정보</h2>
        <p className="m-warning">운영·수용 여부는 실시간으로 확인해 주세요.</p>
        <h3>응급실 찾기</h3>
        <p>가까운 응급실과 진료 가능 여부를 확인해요. 응급 상황에는 바로 119에 연락해 주세요.</p>
        <a className="m-outline-button" href="https://www.e-gen.or.kr" target="_blank" rel="noreferrer">
          E-Gen에서 응급실 확인 ↗
        </a>
        <hr />
        <h3>대피소 찾기</h3>
        <p>현재 위치 주변의 대피소와 안전한 이동 경로를 미리 살펴보세요.</p>
        <a className="m-outline-button" href="https://www.safekorea.go.kr" target="_blank" rel="noreferrer">
          국민재난안전포털에서 확인 ↗
        </a>
        <p className="m-note">정보 제공처의 최신 안내를 기준으로 확인해 주세요.</p>
      </section>

      <section className="m-card m-block">
        <h2>이 여행지로 떠나볼까요?</h2>
        <p>카카오맵에서 출발지와 대중교통 경로를 확인할 수 있어요.</p>
        <button type="button" className="m-gradient-button" onClick={onDirections}>
          카카오맵 길찾기 ↗
        </button>
      </section>
    </>
  );
}

function DirectionsModal({
  attraction,
  region,
  onClose,
  onOpen,
}: {
  attraction: Attraction;
  region: Region;
  onClose: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="m-scrim" onClick={onClose}>
      <div
        className="m-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="m-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="m-modal-close" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
        <p className="m-modal-arrow" aria-hidden="true">↗</p>
        <h2 id="m-modal-title">카카오맵으로 이동할까요?</h2>
        <p className="m-modal-lead">
          선택한 장소의 길찾기를 새 창에서 열어요.
          <br />
          현재 추천 결과는 그대로 유지돼요.
        </p>
        <div className="m-modal-dest">
          <span>도착지</span>
          <strong>{attraction.name}</strong>
          <small>
            {region.province} {region.name}
          </small>
        </div>
        <p className="m-note m-center">출발지와 대중교통 경로는 카카오맵에서 확인해 주세요. 경로와 소요 시간은 외부 서비스의 안내를 따라요.</p>
        <button type="button" className="m-gradient-button" onClick={onOpen}>
          카카오맵 열기 ↗
        </button>
        <button type="button" className="m-outline-button" onClick={onClose}>
          돌아가기
        </button>
        <p className="m-note m-center">외부 서비스의 위치·개인정보 이용 정책이 적용돼요.</p>
      </div>
    </div>
  );
}

function DirectionsDone({
  attraction,
  region,
  preferences,
  onBackToResults,
  onBackToPlace,
}: {
  attraction: Attraction;
  region: Region;
  preferences: TripPreferences;
  onBackToResults: () => void;
  onBackToPlace: () => void;
}) {
  const url = kakaoDirectionsUrl(attraction.name, attraction.lat, attraction.lng);
  return (
    <section className="m-card m-done">
      <div className="m-done-check" aria-hidden="true">✓</div>
      <h1>카카오맵 길찾기를 열었어요</h1>
      <p className="m-center">열린 카카오맵에서 출발지와 이동 경로를 확인해 주세요. 언제든 돌아와 다른 여행지를 둘러볼 수 있어요.</p>
      <div className="m-modal-dest">
        <span>선택한 여행지</span>
        <strong>{attraction.name}</strong>
        <small>
          {region.name} · {durationLabel(preferences)} · {transportLabel(preferences.transport)}
        </small>
      </div>
      <div className="m-recheck">
        <strong>출발 전 한 번 더 확인해요</strong>
        <p>최신 날씨와 방문지 운영 정보를 확인해 주세요. 주변 응급실과 대피소는 장소 상세에서 다시 볼 수 있어요.</p>
      </div>
      <button type="button" className="m-gradient-button" onClick={onBackToResults}>
        추천 결과로 돌아가기
      </button>
      <button type="button" className="m-outline-button" onClick={onBackToPlace}>
        장소·안전 정보 다시 보기
      </button>
      <a className="m-reopen" href={url} target="_blank" rel="noreferrer">
        카카오맵이 열리지 않았나요? 다시 열기 ↗
      </a>
    </section>
  );
}
