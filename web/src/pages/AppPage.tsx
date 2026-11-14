import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AttractionDetail } from "../components/AttractionDetail";
import { CompanionForm } from "../components/CompanionForm";
import { LiveAttractionsPanel } from "../components/LiveAttractionsPanel";
import { MapView } from "../components/MapView";
import { MapAreaPicker } from "../components/MapAreaPicker";
import { mapAreaForRegion, mapLayers, NATIONWIDE, selectionForAttraction, type MapArea } from "../lib/mapArea";
import { DemandCard } from "../components/DemandCard";
import { NationalSpotPanel } from "../components/NationalSpotPanel";
import { RandomTripPicker } from "../components/RandomTripPicker";
import { RecommendationList, type ExcludedAttraction } from "../components/RecommendationList";
import { exclusionLabel } from "../lib/cardInfo";
import { SeasonalDiscovery } from "../components/SeasonalDiscovery";
import { SafetyPanel } from "../components/SafetyPanel";
import { SHOW_REGION_SAFETY_SCORE } from "../config/features";
import { TripPreparation } from "../components/TripPreparation";
import { WeatherNotice } from "../components/WeatherNotice";
import { WeatherExcludedList } from "../components/WeatherExcludedList";
import { DistanceExcludedList } from "../components/DistanceExcludedList";
import { applyDistanceLimit, formatDistance, haversineKm, NEEDS_ORIGIN_MESSAGE, NO_NEARBY_MESSAGE, type Origin } from "../lib/origin";
import { WarningBanner } from "../components/WarningBanner";
import { INDOOR_RETRY_LABEL, keepIndoorOnly, listWeatherExclusions, regionsWithoutPurposeMatches } from "../lib/weatherExclusions";
import { buildChecklist, type ChecklistFocus } from "../lib/checklist";
import { toAccessSummary, useAttractionAccessMap } from "../lib/liveAccess";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { findNearbyAttractions, hasKakaoRestKey } from "../lib/kakaoLocal";
import { loadMapPlaces, type MapPlaces, type MapSelection } from "../lib/nationalData";
import { getExploreRecommendations, getRecommendations, rankAttractions, topAttractionsOf } from "../lib/recommend";
import type { SeasonalDestination } from "../lib/seasonalDestinations";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import type { Attraction, Person, RecommendationItem, Region } from "../lib/types";
import {
  DEFAULT_TRIP_PREFERENCES,
  filterRecommendations,
  tripMonth,
  tripSeason,
  todayIso,
  type TripPreferences,
} from "../lib/tripPreferences";
import { findWeatherPreset } from "../lib/weatherPresets";
import { EMPTY_WEATHER, loadRegionWeather, tripDates, worstOf, type RegionWeather } from "../lib/liveWeather";
import { applyWeatherRules, decideWeather, isAllowed, type WeatherDecision } from "../lib/weatherRules";
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

  // 추천은 항상 시범 지역 전체에서 고른다(지도에서 볼 지역과 관계없다).
  const destinationRegions = SAMPLE_REGIONS;
  // 방문일 날씨: 기본은 지역마다 실제 예보(tourapi /api/weather), 주소에 ?demo=weather가 있으면 예시 날씨 하나를 모든 지역에 쓴다.
  const [searchParams] = useSearchParams();
  const weatherDemo = searchParams.get("demo") === "weather";
  const weatherPreset = findWeatherPreset(tripPreferences.weatherPreset);
  const { duration, visitDate, nights } = tripPreferences;
  const tripDays = useMemo(() => tripDates({ duration, visitDate, nights }), [duration, visitDate, nights]);
  // 어르신·아이 동반이면 weather.py가 준비물(tips)을 엄격 기준으로 낸다(판정은 웹 weatherRules가 따로 한다).
  const weatherWith = [safetyFilters.withElderly && "senior", safetyFilters.withChildren && "child"].filter(Boolean).join(",");
  const weatherKey = `${destinationRegions.map((region) => region.code).join(",")}|${tripDays.join(",")}|${weatherWith}`;
  const useLiveWeather = people != null && !weatherDemo && destinationRegions.length > 0;
  const [liveWeather, setLiveWeather] = useState<{ key: string; byRegion: Record<string, RegionWeather> }>({
    key: "",
    byRegion: {},
  });
  useEffect(() => {
    if (!useLiveWeather) return;
    let cancelled = false;
    Promise.all(
      destinationRegions.map(async (region) => [region.code, await loadRegionWeather(region, tripDays, weatherWith)] as const),
    ).then((entries) => {
      if (!cancelled) setLiveWeather({ key: weatherKey, byRegion: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [useLiveWeather, weatherKey, destinationRegions, tripDays, weatherWith]);
  const weatherLoading = useLiveWeather && liveWeather.key !== weatherKey;
  const regionWeather = useMemo(
    () => (liveWeather.key === weatherKey ? liveWeather.byRegion : {}),
    [liveWeather, weatherKey],
  );

  /** 지역 코드별 날씨 판정. 예보가 없거나 아직 못 불러온 지역은 날씨 조건 없이 판정한다. */
  const weatherDecisions = useMemo(() => {
    const party = { withElderly: safetyFilters.withElderly, withChildren: safetyFilters.withChildren };
    const today = todayIso();
    return Object.fromEntries(
      SAMPLE_REGIONS.map((region) => [
        region.code,
        decideWeather(
          weatherDemo ? weatherPreset.weather : regionWeather[region.code]?.worst ?? EMPTY_WEATHER,
          party,
          visitDate,
          today,
        ),
      ]),
    ) as Record<string, WeatherDecision>;
  }, [weatherDemo, weatherPreset, regionWeather, safetyFilters.withElderly, safetyFilters.withChildren, visitDate]);
  const applyRegionWeather = useCallback(
    (items: RecommendationItem[]) =>
      items.flatMap((item) => applyWeatherRules([item], weatherDecisions[item.region.code])),
    [weatherDecisions],
  );
  const weatherRestricted = destinationRegions.some(
    (region) => weatherDecisions[region.code].indoorOnly || weatherDecisions[region.code].excludedTerrains.length > 0,
  );

  // 날씨 규칙을 적용하기 전 추천(지역 범위까지 거른 것). 날씨 때문에 빠진 곳을 보여 줄 때도 쓴다.
  const preWeatherRecommendations: RecommendationItem[] = useMemo(() => {
    if (people == null) return [];
    let candidates: RecommendationItem[];
    if (people.length === 0) {
      // 연령대 미입력 — 전체 인기도(방문자 수)만으로 정렬한다.
      candidates = SAMPLE_REGIONS
        .slice()
        .sort((a, b) => b.totalVisitors - a.totalVisitors)
        .map((region) => ({
          region,
          score: Math.log(region.totalVisitors),
          perPersonLQ: [],
          evidence: [`전체 방문자 수 ${region.totalVisitors.toLocaleString()}명`],
          topAttractions: topAttractionsOf(region, []),
        }));
    } else {
      candidates = getRecommendations(people, SAMPLE_REGIONS, SAMPLE_REGIONS.length);
    }
    const locationCodes = new Set(destinationRegions.map((region) => region.code));
    const filtered = filterRecommendations(candidates, people, tripPreferences, safetyFilters).filter((item) =>
      locationCodes.has(item.region.code),
    );
    return indoorRetry ? keepIndoorOnly(filtered) : filtered;
  }, [destinationRegions, people, tripPreferences, safetyFilters, indoorRetry]);
  // 날씨 규칙 → (도보·자전거면) 출발지 거리 기준 순서로 거른다. 추천 순위 계산은 바꾸지 않는다.
  const weatherApplied = useMemo(
    () => applyRegionWeather(preWeatherRecommendations),
    [preWeatherRecommendations, applyRegionWeather],
  );
  const distance = useMemo(
    () => applyDistanceLimit(weatherApplied, origin, tripPreferences.transport),
    [weatherApplied, origin, tripPreferences.transport],
  );
  const recommendations: RecommendationItem[] = useMemo(() => distance.items.slice(0, 5), [distance]);
  // 거리 때문에 빠진 곳은 원래 상위 5개 지역에서만 모은다(날씨 제외 목록과 같은 범위).
  const distanceExclusions = useMemo(
    () => applyDistanceLimit(weatherApplied.slice(0, 5), origin, tripPreferences.transport).excluded,
    [weatherApplied, origin, tripPreferences.transport],
  );
  // 날씨 때문에 목적에 맞는 관광지가 모두 빠진 지역(원래 상위 5개 중) — 순위 맨 아래에 안내 카드로 둔다.
  const purposeEmptyItems = useMemo(
    () => regionsWithoutPurposeMatches(preWeatherRecommendations.slice(0, 5), (code) => weatherDecisions[code], tripPreferences.purpose),
    [preWeatherRecommendations, weatherDecisions, tripPreferences.purpose],
  );
  // 추천 카드 안에 흐리게 보여 줄, 날씨 때문에 그 지역에서 빠진 관광지(목적·스타일에 맞는 후보 중)
  const excludedByRegion = useMemo(() => {
    const map = new Map<string, ExcludedAttraction[]>();
    for (const item of preWeatherRecommendations) {
      const decision = weatherDecisions[item.region.code];
      if (!decision) continue;
      map.set(
        item.region.code,
        item.topAttractions
          .filter(({ attraction }) => !isAllowed(attraction, decision))
          .map(({ attraction }) => ({ attraction, label: exclusionLabel(attraction, decision) })),
      );
    }
    return map;
  }, [preWeatherRecommendations, weatherDecisions]);
  const weatherExclusions = useMemo(
    () => listWeatherExclusions(preWeatherRecommendations.slice(0, 5), (code) => weatherDecisions[code]),
    [preWeatherRecommendations, weatherDecisions],
  );

  const exploreRecommendations = useMemo(() => {
    if (people == null || people.length === 0 || destinationRegions.length === 0) return [];
    const excludeCodes = new Set(recommendations.map((r) => r.region.code));
    const locationCodes = new Set(destinationRegions.map((region) => region.code));
    const explore = applyRegionWeather(
      filterRecommendations(getExploreRecommendations(people, SAMPLE_REGIONS, excludeCodes), people, tripPreferences, safetyFilters),
    ).filter((item) => locationCodes.has(item.region.code));
    return applyDistanceLimit(explore, origin, tripPreferences.transport).items;
  }, [destinationRegions, people, recommendations, tripPreferences, applyRegionWeather, origin]);

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
        preferences={tripPreferences}
        weatherDemo={weatherDemo}
        origin={origin}
        onOriginChange={setOrigin}
        onPreferencesChange={(preferences) => {
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
                distanceLabelFor={(region) => (origin ? formatDistance(haversineKm(origin, region)) : null)}
                excludedFor={(region) => excludedByRegion.get(region.code) ?? []}
              />
              {people != null && <WeatherExcludedList items={weatherExclusions} />}
              {people != null && <DistanceExcludedList items={distanceExclusions} limitKm={distance.limitKm} />}
              {showChecklist && <TripPreparation preferences={tripPreferences} checklist={checklist} />}
              {selectedAttraction && (
                <AttractionDetail
                  attraction={selectedAttraction}
                  region={displayedRegion}
                  locationLabel={selectedSeasonalPlace?.location}
                  seasonalTiming={selectedSeasonalPlace?.timing}
                  seasonalDescription={selectedSeasonalPlace?.summary}
                  party={accessParty}
                  distanceLabel={origin ? formatDistance(haversineKm(origin, selectedAttraction)) : null}
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
