import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AttractionDetail } from "../components/AttractionDetail";
import { CompanionForm } from "../components/CompanionForm";
import { LiveAttractionsPanel } from "../components/LiveAttractionsPanel";
import { MapView } from "../components/MapView";
import { MapAreaPicker } from "../components/MapAreaPicker";
import { mapAreaForRegion, mapLayers, NATIONWIDE, regionSummaryAttractions, selectionForAttraction, type MapArea } from "../lib/mapArea";
import { DemandCard } from "../components/DemandCard";
import { NationalSpotPanel } from "../components/NationalSpotPanel";
import { RandomTripPicker } from "../components/RandomTripPicker";
import { RecommendationList } from "../components/RecommendationList";
import { SeasonalDiscovery } from "../components/SeasonalDiscovery";
import { SafetyPanel } from "../components/SafetyPanel";
import { SHOW_REGION_SAFETY_SCORE } from "../config/features";
import { TripPreparation } from "../components/TripPreparation";
import { WeatherNotice } from "../components/WeatherNotice";
import { WeatherExcludedList } from "../components/WeatherExcludedList";
import { DistanceExcludedList } from "../components/DistanceExcludedList";
import { TravelTimeExcludedList } from "../components/TravelTimeExcludedList";
import { FAR_DAY_TRIP_BADGE, isFarForDayTrip, travelHours, travelLabel } from "../lib/travelTime";
import {
  effectiveRanking,
  formatDistance,
  haversineKm,
  nearestAttractionKm,
  NEEDS_ORIGIN_MESSAGE,
  NO_NEARBY_MESSAGE,
  type Origin,
} from "../lib/origin";
import { WarningBanner } from "../components/WarningBanner";
import { INDOOR_RETRY_LABEL } from "../lib/weatherExclusions";
import { buildChecklist, type ChecklistFocus } from "../lib/checklist";
import { toAccessSummary, useAttractionAccessMap } from "../lib/liveAccess";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { findNearbyAttractions, hasKakaoRestKey } from "../lib/kakaoLocal";
import { loadMapPlaces, type MapPlaces, type MapSelection } from "../lib/nationalData";
import { rankAttractions } from "../lib/recommend";
import { useTripEngine } from "../lib/useTripEngine";
import type { SeasonalDestination } from "../lib/seasonalDestinations";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import type { Attraction, Person, Region } from "../lib/types";
import {
  allowedForParty,
  DEFAULT_TRIP_PREFERENCES,
  tripMonth,
  tripSeason,
  type TripPreferences,
} from "../lib/tripPreferences";
import { worstOf } from "../lib/liveWeather";
import "./AppPage.css";

export function AppPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [safetyFilters, setSafetyFilters] = useState<SafetyDisplayFilters>({
    withChildren: false,
    withElderly: false,
    nightPlan: false,
  });
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedAttraction, setSelectedAttraction] = useState<Attraction | null>(null);
  const [selectedSeasonalPlace, setSelectedSeasonalPlace] = useState<SeasonalDestination | null>(null);
  const [liveResults, setLiveResults] = useState<{
    requestKey: string | null;
    items: { attraction: Attraction; matchScore: number }[];
  }>({ requestKey: null, items: [] });
  const [tripPreferences, setTripPreferences] = useState<TripPreferences>(DEFAULT_TRIP_PREFERENCES);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [mapPlaces, setMapPlaces] = useState<{ province: string; data: MapPlaces | null; error: string | null }>({
    province: "",
    data: null,
    error: null,
  });
  const [mapSelection, setMapSelection] = useState<MapSelection | null>(null);
  // "지도에서 볼 지역": 지도 관광지·대피소·관광 수요·지도 범위에만 쓰고 추천 결과는 바꾸지 않는다.
  const [mapArea, setMapArea] = useState<MapArea>(NATIONWIDE);
  // "실내 관광지로 다시 추천받기"를 눌렀을 때만 켠다. 여행 조건을 바꾸면 꺼진다.
  const [indoorRetry, setIndoorRetry] = useState(false);
  // 출발지(선택). 거리 표시와 도보·자전거 거르기에만 쓰고 서버로 보내거나 저장하지 않는다.
  const [origin, setOrigin] = useState<Origin | null>(null);
  // 사용자가 '추천 순서'를 직접 바꿨는지. 바꾸지 않았으면 출발지·당일치기일 때 기본값이 "가까운 순"이다.
  const [rankingTouched, setRankingTouched] = useState(false);
  const ranking = effectiveRanking({
    stored: tripPreferences.ranking,
    touched: rankingTouched,
    hasOrigin: origin != null,
    duration: tripPreferences.duration,
  });

  // 지도에서 고른 시도(또는 전국)의 공공데이터를 tourapi/api.py 서버에서 실시간으로 불러온다.
  useEffect(() => {
    let cancelled = false;
    const province = mapArea.province;
    loadMapPlaces(province)
      .then((data) => {
        if (!cancelled) setMapPlaces({ province, data, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setMapPlaces({ province, data: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [mapArea.province]);
  const mapData = mapPlaces.province === mapArea.province ? mapPlaces.data : null;
  const mapLoading = mapPlaces.province !== mapArea.province;

  // 지도에서 시·군·구를 고르면 지도 관광지·대피소도 그 시군구로 좁힌다.
  const layers = useMemo(() => mapLayers(mapData, mapArea), [mapData, mapArea]);
  const nationalSpots = layers.spots;
  const handleMapSelect = useCallback((selection: MapSelection) => {
    setMapSelection(selection);
    setSelectedAttraction(null);
    setSelectedSeasonalPlace(null);
  }, []);

  // 방문일 날씨: 기본은 지역마다 실제 예보(tourapi /api/weather), 주소에 ?demo=weather가 있으면 예시 날씨 하나를 모든 지역에 쓴다.
  const [searchParams] = useSearchParams();
  const weatherDemo = searchParams.get("demo") === "weather";
  // 추천·날씨·거리 계산은 모바일 화면과 같은 lib/useTripEngine.ts를 쓴다.
  const {
    destinationRegions,
    weatherPreset,
    weatherLoading,
    regionWeather,
    weatherDecisions,
    weatherRestricted,
    weatherApplied,
    distance,
    recommendations,
    travelExclusions,
    distanceExclusions,
    purposeEmptyItems,
    excludedByRegion,
    weatherExclusions,
    exploreRecommendations,
  } = useTripEngine({ people, safetyFilters, tripPreferences, weatherDemo, origin, indoorRetry, ranking });

  // 지도 요약 줄·지역 마커는 추천 카드와 같은 결과를 쓴다(목적·날씨·거리·동행자로 걸러진 것).
  const mapRegionAttractions = useMemo(
    () => (people != null ? regionSummaryAttractions([...recommendations, ...exploreRecommendations]) : undefined),
    [people, recommendations, exploreRecommendations],
  );
  const allowAttraction = useCallback(
    (attraction: Attraction) => allowedForParty(attraction, people ?? [], safetyFilters),
    [people, safetyFilters],
  );
  const highlightedCodes = useMemo(
    () => new Set([...recommendations, ...exploreRecommendations].map((r) => r.region.code)),
    [recommendations, exploreRecommendations],
  );
  // 관광지를 고르면(카드 안 관광지 버튼, 지도 목록 등) 상세를 열고, 지도도 그 관광지의 도·시군구로 옮긴다.
  // 지역 카드의 onSelect와는 따로 처리한다(관광지 버튼은 stopPropagation으로 카드 클릭이 되지 않는다).
  const handleSelectAttraction = useCallback((attraction: Attraction) => {
    const selection = selectionForAttraction(attraction, SAMPLE_REGIONS);
    setSelectedRegion(selection?.region ?? null);
    if (selection) setMapArea(selection.area);
    setSelectedAttraction(attraction);
    setSelectedSeasonalPlace(null);
    setMapSelection(null);
  }, []);
  const displayedRegion = selectedSeasonalPlace ? null : selectedRegion ?? recommendations[0]?.region ?? null;
  // 날씨 안내는 지금 보고 있는 지역(없으면 1위 추천, 그것도 없으면 첫 대상 지역) 기준으로 보여 준다.
  const weatherRegion =
    (displayedRegion && destinationRegions.find((region) => region.code === displayedRegion.code)) ||
    recommendations[0]?.region ||
    destinationRegions[0] ||
    null;
  // 지역의 날씨(일정 중 가장 나쁜 값). 시연 모드면 예시 날씨.
  const weatherOf = (code: string) => (weatherDemo ? weatherPreset.weather : regionWeather[code]?.worst ?? null);
  // 무장애(한국관광공사): 추천 카드 배지와 체크리스트 한 줄에 쓴다. 추천 순서는 바꾸지 않는다.
  const { withElderly, withChildren } = safetyFilters;
  const accessParty = useMemo(() => ({ withElderly, withChildren }), [withElderly, withChildren]);
  const accessTargets = useMemo(() => {
    const byName = new Map<string, Attraction>();
    for (const item of [...recommendations, ...exploreRecommendations]) {
      for (const { attraction } of item.topAttractions) byName.set(attraction.name, attraction);
    }
    if (selectedAttraction) byName.set(selectedAttraction.name, selectedAttraction);
    return [...byName.values()];
  }, [recommendations, exploreRecommendations, selectedAttraction]);
  const accessMap = useAttractionAccessMap(accessTargets, accessParty);
  const accessPrepTip =
    selectedAttraction && (withElderly || withChildren)
      ? toAccessSummary(selectedAttraction.name, accessMap[selectedAttraction.name]).prepTip
      : null;
  // 여행 체크리스트 3단계: 아무것도 안 눌렀으면 공통, 지역 카드를 누르면 지역, 관광지를 누르면 관광지까지.
  const cardAttractions = (region: Region) =>
    [...recommendations, ...exploreRecommendations]
      .find((item) => item.region.code === region.code)
      ?.topAttractions.map(({ attraction }) => attraction) ?? [];
  const checklistFocus: ChecklistFocus = selectedAttraction
    ? {
        kind: "attraction",
        region: selectedSeasonalPlace ? null : selectedRegion,
        attractions: selectedRegion && !selectedSeasonalPlace ? cardAttractions(selectedRegion) : [],
        attraction: selectedAttraction,
      }
    : selectedRegion
      ? { kind: "region", region: selectedRegion, attractions: cardAttractions(selectedRegion) }
      : { kind: "common" };
  const focusRegion = checklistFocus.kind === "common" ? null : checklistFocus.region;
  const checklist = buildChecklist({
    preferences: tripPreferences,
    party: accessParty,
    commonWeather: worstOf(
      recommendations.map(({ region }) => weatherOf(region.code)).filter((w): w is NonNullable<typeof w> => w != null),
    ),
    regionWeather: focusRegion ? weatherOf(focusRegion.code) : null,
    regionWeatherTips: focusRegion && !weatherDemo ? regionWeather[focusRegion.code]?.tips ?? [] : [],
    accessTip: accessPrepTip,
    travelHours: !origin
      ? null
      : checklistFocus.kind === "attraction"
        ? travelHours(haversineKm(origin, checklistFocus.attraction), tripPreferences.transport)
        : checklistFocus.kind === "region"
          ? (() => {
              const item = [...recommendations, ...exploreRecommendations].find((i) => i.region.code === checklistFocus.region.code);
              const km = item ? nearestAttractionKm(item, origin) : null;
              return km != null ? travelHours(km, tripPreferences.transport) : null;
            })()
          : null,
    focus: checklistFocus,
  });
  const showChecklist = (people != null && recommendations.length > 0) || selectedAttraction != null;
  const liveRequestKey =
    displayedRegion && hasKakaoRestKey()
      ? `${displayedRegion.code}:${(people ?? []).map((person) => person.ageGroup).join(",")}`
      : null;
  const liveAttractions =
    liveRequestKey && liveResults.requestKey === liveRequestKey ? liveResults.items : [];
  const liveLoading = liveRequestKey != null && liveResults.requestKey !== liveRequestKey;

  // 지도에 더 다양한 관광지 데이터를 보여달라는 요청(사용자 피드백)에 따라,
  // 선택된 지역 주변을 카카오 카테고리 검색으로 실시간으로 더 찾아와서
  // 큐레이션 목록과 별도로 보여준다. REST 키가 없으면 조용히 건너뛴다.
  useEffect(() => {
    if (!displayedRegion || !liveRequestKey) return;
    let cancelled = false;
    findNearbyAttractions(displayedRegion.lat, displayedRegion.lng)
      .then((places) => {
        if (cancelled) return;
        const curatedNames = new Set(displayedRegion.attractions.map((a) => a.name));
        const deduped = places.filter((p) => !curatedNames.has(p.name));
        setLiveResults({ requestKey: liveRequestKey, items: rankAttractions(deduped, people ?? [], 6) });
      })
      .catch(() => {
        if (!cancelled) setLiveResults({ requestKey: liveRequestKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [displayedRegion, liveRequestKey, people]);

  return (
    <div className="app-shell" data-season={tripSeason(tripPreferences)}>
      <header className="app-header">
        <Link to="/" className="back-link">
          ← TourLink
        </Link>
      </header>

      <CompanionForm
        regions={SAMPLE_REGIONS}
        preferences={{ ...tripPreferences, ranking }}
        weatherDemo={weatherDemo}
        origin={origin}
        onOriginChange={setOrigin}
        onPreferencesChange={(preferences) => {
          if (preferences.ranking !== ranking) setRankingTouched(true);
          setTripPreferences(preferences);
          setIndoorRetry(false);
          setMapSelection(null);
          setSelectedRegion(null);
          setSelectedAttraction(null);
          setSelectedSeasonalPlace(null);
        }}
        onSubmit={(p, filters) => {
          setPeople(p);
          setSafetyFilters(filters);
          setSelectedRegion(null);
          setSelectedAttraction(null);
          setSelectedSeasonalPlace(null);
        }}
      />

      <main className="app-main">
        <aside className="sidebar">
          <SeasonalDiscovery
            month={tripMonth(tripPreferences)}
            paused={carouselPaused}
            onTogglePaused={() => setCarouselPaused((value) => !value)}
            onSelect={(destination) => {
              setSelectedRegion(null);
              setSelectedAttraction(destination.attraction);
              setSelectedSeasonalPlace(destination);
            }}
          />
          <RandomTripPicker
            regions={SAMPLE_REGIONS}
            people={people ?? []}
            withChildren={safetyFilters.withChildren}
            onPick={(region, attraction) => {
              setSelectedRegion(region);
              setSelectedAttraction(attraction);
              setSelectedSeasonalPlace(null);
            }}
          />
        </aside>

        <section className="content">
          <MapAreaPicker
            area={mapArea}
            provinces={mapData?.provinces}
            onChange={(area) => {
              setMapArea(area);
              setMapSelection(null);
            }}
          />
          <div className="map-workspace">
            <MapView
              regions={SAMPLE_REGIONS}
              highlightedCodes={highlightedCodes}
              regionAttractions={mapRegionAttractions}
              allowAttraction={allowAttraction}
              origin={origin}
              selectedCode={displayedRegion?.code}
              onSelectRegion={(region) => {
                setSelectedRegion(region);
                setSelectedAttraction(null);
                setSelectedSeasonalPlace(null);
              }}
              onSelectAttraction={handleSelectAttraction}
              people={people ?? []}
              liveAttractions={liveAttractions.map((x) => x.attraction)}
              nationalSpots={nationalSpots}
              shelters={layers.shelters}
              pets={layers.pets}
              medical={layers.medical}
              area={mapArea}
              selectedPlace={mapSelection?.place ?? null}
              onSelectPlace={handleMapSelect}
            />
            <div className="map-info-rail">
              {(mapLoading || mapPlaces.error) && (
                <p className={`map-data-status${mapPlaces.error && !mapLoading ? " is-error" : ""}`} role="status">
                  {mapLoading ? "공공데이터를 불러오는 중…" : mapPlaces.error}
                </p>
              )}
              {mapSelection && mapData && (
                <NationalSpotPanel
                  selection={mapSelection}
                  data={mapData}
                  onClose={() => setMapSelection(null)}
                />
              )}
              {layers.showDemand && mapData?.demand && <DemandCard demand={mapData.demand} />}
              {people != null && destinationRegions.length > 0 && (
                weatherDemo ? (
                  <WeatherNotice
                    mode="demo"
                    regionName={weatherRegion?.name ?? null}
                    decision={weatherDecisions[weatherRegion?.code ?? destinationRegions[0].code]}
                    demoLabel={weatherPreset.label}
                    demoWeather={weatherPreset.weather}
                  />
                ) : weatherLoading || !weatherRegion ? (
                  <WeatherNotice mode="loading" regionName={weatherRegion?.name ?? null} />
                ) : (
                  <WeatherNotice
                    mode="live"
                    regionName={weatherRegion.name}
                    decision={weatherDecisions[weatherRegion.code]}
                    days={regionWeather[weatherRegion.code]?.days ?? []}
                  />
                )
              )}
              {people != null && weatherRegion && (
                <WarningBanner
                  regionName={weatherRegion.name}
                  here={
                    weatherDemo
                      ? weatherPreset.weather.warnings.map((kind) => `${kind}특보`)
                      : [...new Set((regionWeather[weatherRegion.code]?.days ?? []).flatMap((day) => day.warningsHere))]
                  }
                  nearby={
                    weatherDemo
                      ? []
                      : [...new Set((regionWeather[weatherRegion.code]?.days ?? []).flatMap((day) => day.warningsNearby))]
                  }
                  terrainExcluded={weatherDecisions[weatherRegion.code].excludedTerrains.length > 0}
                />
              )}
              {people != null && distance.needsOrigin && (
                <p className="distance-notice" role="status">{NEEDS_ORIGIN_MESSAGE}</p>
              )}
              <RecommendationList
                items={recommendations}
                bottomItems={purposeEmptyItems}
                emptyAction={
                  people != null && recommendations.length === 0 && purposeEmptyItems.length > 0
                    ? {
                        label: INDOOR_RETRY_LABEL,
                        onClick: () => {
                          // 목적을 '전체'로 바꾸고 실내 관광지만으로 다시 추천한다(입력 폼의 목적도 '전체'로 보인다).
                          setTripPreferences((current) => ({ ...current, purpose: "all" }));
                          setIndoorRetry(true);
                          setSelectedRegion(null);
                          setSelectedAttraction(null);
                          setSelectedSeasonalPlace(null);
                        },
                      }
                    : null
                }
                notice={indoorRetry && people != null ? "실내 관광지만으로 다시 추천했어요. 여행 조건을 바꾸면 원래대로 추천해요." : null}
                exploreItems={exploreRecommendations}
                emptyMessage={
                  people == null
                      ? "여행 조건을 정하고 동행자를 입력한 뒤 추천받아 보세요."
                      : distance.limitKm != null && origin && weatherApplied.length > 0
                        ? NO_NEARBY_MESSAGE
                      : weatherRestricted
                        ? "방문일 날씨 기준에 맞는 관광지가 이 조건에는 없어요. 목적을 넓히거나 다른 날짜를 골라 보세요."
                        : "현재 조건에 맞는 여행지가 없어요. 목적이나 스타일을 넓혀 보세요."
                }
                onSelect={(region) => {
                  setSelectedRegion(region);
                  setSelectedAttraction(null);
                  setSelectedSeasonalPlace(null);
                  // 추천 카드를 누르면 지도도 그 도·시군구를 보여 준다.
                  setMapArea(mapAreaForRegion(region));
                  setMapSelection(null);
                }}
                onSelectAttraction={handleSelectAttraction}
                selectedCode={displayedRegion?.code}
                weatherSummaryFor={(code) => weatherDecisions[code]?.summary ?? null}
                attractionBadge={(attraction) =>
                  toAccessSummary(attraction.name, accessMap[attraction.name]).hasInfo ? "편의 정보" : null
                }
                distanceLabelFor={(item) => {
                  const km = origin ? nearestAttractionKm(item, origin) : null;
                  return km != null ? `가장 가까운 관광지까지 ${travelLabel(km, tripPreferences.transport)}` : null;
                }}
                attractionDistanceFor={(attraction) => (origin ? travelLabel(haversineKm(origin, attraction), tripPreferences.transport) : null)}
                farBadgeFor={(item) => {
                  const km = origin ? nearestAttractionKm(item, origin) : null;
                  const hours = km != null ? travelHours(km, tripPreferences.transport) : null;
                  return isFarForDayTrip(hours, tripPreferences.duration) ? FAR_DAY_TRIP_BADGE : null;
                }}
                excludedFor={(region) => excludedByRegion.get(region.code) ?? []}
              />
              {people != null && <WeatherExcludedList items={weatherExclusions} />}
              {people != null && <DistanceExcludedList items={distanceExclusions} limitKm={distance.limitKm} />}
              {people != null && <TravelTimeExcludedList items={travelExclusions} maxHours={tripPreferences.maxTravelHours} />}
              {showChecklist && <TripPreparation preferences={tripPreferences} checklist={checklist} />}
              {selectedAttraction && (
                <AttractionDetail
                  attraction={selectedAttraction}
                  region={displayedRegion}
                  locationLabel={selectedSeasonalPlace?.location}
                  seasonalTiming={selectedSeasonalPlace?.timing}
                  seasonalDescription={selectedSeasonalPlace?.summary}
                  party={accessParty}
                  distanceLabel={
                    origin
                      ? `${formatDistance(haversineKm(origin, selectedAttraction))} · ${travelLabel(haversineKm(origin, selectedAttraction), tripPreferences.transport).split(" · ")[1]}`
                      : null
                  }
                />
              )}
              {displayedRegion && (
                <LiveAttractionsPanel
                  loading={liveLoading}
                  items={liveAttractions}
                  onSelectAttraction={handleSelectAttraction}
                />
              )}
              {SHOW_REGION_SAFETY_SCORE && displayedRegion && (
                <SafetyPanel region={displayedRegion} filters={safetyFilters} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
