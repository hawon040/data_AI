import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AccessibilityInfo } from "../components/AccessibilityInfo";
import { AttractionDetail } from "../components/AttractionDetail";
import { CompanionForm } from "../components/CompanionForm";
import { LiveAttractionsPanel } from "../components/LiveAttractionsPanel";
import { MapView } from "../components/MapView";
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
import { listWeatherExclusions } from "../lib/weatherExclusions";
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
  getSeason,
  todayIso,
  type TripPreferences,
} from "../lib/tripPreferences";
import { findWeatherPreset } from "../lib/weatherPresets";
import { EMPTY_WEATHER, loadRegionWeather, tripDates, type RegionWeather } from "../lib/liveWeather";
import { applyWeatherRules, decideWeather, type WeatherDecision } from "../lib/weatherRules";
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

  // 고른 시도(또는 전국)의 공공데이터를 tourapi/api.py 서버에서 실시간으로 불러온다.
  useEffect(() => {
    let cancelled = false;
    const province = tripPreferences.province;
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
  }, [tripPreferences.province]);
  const mapData = mapPlaces.province === tripPreferences.province ? mapPlaces.data : null;
  const mapLoading = mapPlaces.province !== tripPreferences.province;

  // 맞춤 추천 시범 지역의 시·군·구를 고르면 지도 관광지도 그 시군구로 좁힌다.
  const pilotDistrict =
    tripPreferences.regionCode === "all"
      ? null
      : SAMPLE_REGIONS.find((region) => region.code === tripPreferences.regionCode)?.name ?? null;
  const nationalSpots = useMemo(
    () =>
      (mapData?.spots ?? []).filter(
        (spot) => !pilotDistrict || (spot.district !== "" && pilotDistrict.startsWith(spot.district)),
      ),
    [mapData, pilotDistrict],
  );
  const handleMapSelect = useCallback((selection: MapSelection) => {
    setMapSelection(selection);
    setSelectedAttraction(null);
    setSelectedSeasonalPlace(null);
  }, []);

  const destinationRegions = useMemo(
    () =>
      SAMPLE_REGIONS.filter(
        (region) =>
          (tripPreferences.province === "all" || region.province === tripPreferences.province) &&
          (tripPreferences.regionCode === "all" || region.code === tripPreferences.regionCode),
      ),
    [tripPreferences.province, tripPreferences.regionCode],
  );
  // 방문일 날씨: 기본은 지역마다 실제 예보(tourapi /api/weather), 시연 모드면 예시 날씨 하나를 모든 지역에 쓴다.
  const weatherPreset = findWeatherPreset(tripPreferences.weatherPreset);
  const weatherDemo = tripPreferences.weatherDemo;
  const { duration, visitDate, nights } = tripPreferences;
  const tripDays = useMemo(() => tripDates({ duration, visitDate, nights }), [duration, visitDate, nights]);
  const weatherKey = `${destinationRegions.map((region) => region.code).join(",")}|${tripDays.join(",")}`;
  const useLiveWeather = people != null && !weatherDemo && destinationRegions.length > 0;
  const [liveWeather, setLiveWeather] = useState<{ key: string; byRegion: Record<string, RegionWeather> }>({
    key: "",
    byRegion: {},
  });
  useEffect(() => {
    if (!useLiveWeather) return;
    let cancelled = false;
    Promise.all(
      destinationRegions.map(async (region) => [region.code, await loadRegionWeather(region, tripDays)] as const),
    ).then((entries) => {
      if (!cancelled) setLiveWeather({ key: weatherKey, byRegion: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [useLiveWeather, weatherKey, destinationRegions, tripDays]);
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
      // 성별·연령대 미입력 — 전체 인기도(방문자 수)만으로 정렬한다.
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
    return filterRecommendations(candidates, people, tripPreferences).filter((item) =>
      locationCodes.has(item.region.code),
    );
  }, [destinationRegions, people, tripPreferences]);
  const recommendations: RecommendationItem[] = useMemo(
    () => applyRegionWeather(preWeatherRecommendations).slice(0, 5),
    [preWeatherRecommendations, applyRegionWeather],
  );
  const weatherExclusions = useMemo(
    () => listWeatherExclusions(preWeatherRecommendations.slice(0, 5), (code) => weatherDecisions[code]),
    [preWeatherRecommendations, weatherDecisions],
  );

  const exploreRecommendations = useMemo(() => {
    if (people == null || people.length === 0 || destinationRegions.length === 0) return [];
    const excludeCodes = new Set(recommendations.map((r) => r.region.code));
    const locationCodes = new Set(destinationRegions.map((region) => region.code));
    return applyRegionWeather(
      filterRecommendations(getExploreRecommendations(people, SAMPLE_REGIONS, excludeCodes), people, tripPreferences),
    ).filter((item) => locationCodes.has(item.region.code));
  }, [destinationRegions, people, recommendations, tripPreferences, applyRegionWeather]);

  const highlightedCodes = useMemo(
    () => new Set([...recommendations, ...exploreRecommendations].map((r) => r.region.code)),
    [recommendations, exploreRecommendations],
  );
  const handleSelectAttraction = useCallback((attraction: Attraction) => {
    const region = SAMPLE_REGIONS.find((candidate) =>
      candidate.attractions.some((item) => item.name === attraction.name),
    );
    setSelectedRegion(region ?? null);
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
  const liveRequestKey =
    displayedRegion && hasKakaoRestKey()
      ? `${displayedRegion.code}:${(people ?? []).map((person) => `${person.gender}-${person.ageGroup}`).join(",")}`
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
    <div className="app-shell" data-season={getSeason(tripPreferences.month)}>
      <header className="app-header">
        <Link to="/" className="back-link">
          ← TourLink
        </Link>
      </header>

      <CompanionForm
        regions={SAMPLE_REGIONS}
        provinces={mapData?.provinces}
        preferences={tripPreferences}
        onPreferencesChange={(preferences) => {
          setTripPreferences(preferences);
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
            month={tripPreferences.month}
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
              shelters={tripPreferences.province === "all" ? [] : mapData?.shelters ?? []}
              pets={mapData?.pets ?? []}
              medical={mapData?.medical ?? []}
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
              {mapData?.demand && tripPreferences.province !== "all" && (
                <DemandCard demand={mapData.demand} />
              )}
              {people != null && destinationRegions.length > 0 && (
                weatherDemo ? (
                  <WeatherNotice
                    mode="demo"
                    regionName={weatherRegion?.name ?? null}
                    decision={weatherDecisions[weatherRegion?.code ?? destinationRegions[0].code]}
                    demoLabel={weatherPreset.label}
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
              <RecommendationList
                items={recommendations}
                exploreItems={exploreRecommendations}
                emptyMessage={
                  destinationRegions.length === 0
                    ? "이 지역은 맞춤 추천 시범 데이터가 없어요. 지도에서 전국 관광지를 눌러 안전 정보를 확인하세요."
                    : people == null
                      ? "여행 조건을 정하고 동행자를 입력한 뒤 추천받아 보세요."
                      : weatherRestricted
                        ? "방문일 날씨 기준에 맞는 관광지가 이 조건에는 없어요. 지역 범위나 목적을 넓히거나 다른 날짜를 골라 보세요."
                        : "현재 조건에 맞는 여행지가 없어요. 목적이나 지역 범위를 넓혀 보세요."
                }
                onSelect={(region) => {
                  setSelectedRegion(region);
                  setSelectedAttraction(null);
                  setSelectedSeasonalPlace(null);
                }}
                onSelectAttraction={handleSelectAttraction}
                selectedCode={displayedRegion?.code}
                weatherSummaryFor={(code) => weatherDecisions[code]?.summary ?? null}
              />
              {people != null && <WeatherExcludedList items={weatherExclusions} />}
              {selectedAttraction && (
                <TripPreparation attraction={selectedAttraction} preferences={tripPreferences} />
              )}
              {selectedAttraction && (
                <AttractionDetail
                  attraction={selectedAttraction}
                  region={displayedRegion}
                  locationLabel={selectedSeasonalPlace?.location}
                  seasonalTiming={selectedSeasonalPlace?.timing}
                  seasonalDescription={selectedSeasonalPlace?.summary}
                />
              )}
              {selectedAttraction && (
                <AccessibilityInfo
                  attraction={selectedAttraction}
                  party={{ withElderly: safetyFilters.withElderly, withChildren: safetyFilters.withChildren }}
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
