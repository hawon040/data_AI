import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AttractionDetail } from "../components/AttractionDetail";
import { CompanionForm } from "../components/CompanionForm";
import { LiveAttractionsPanel } from "../components/LiveAttractionsPanel";
import { MapView } from "../components/MapView";
import { RandomTripPicker } from "../components/RandomTripPicker";
import { RecommendationList } from "../components/RecommendationList";
import { SeasonalDiscovery } from "../components/SeasonalDiscovery";
import { SafetyPanel } from "../components/SafetyPanel";
import { TripPreparation } from "../components/TripPreparation";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { findNearbyAttractions, hasKakaoRestKey } from "../lib/kakaoLocal";
import { getExploreRecommendations, getRecommendations, rankAttractions, topAttractionsOf } from "../lib/recommend";
import type { SeasonalDestination } from "../lib/seasonalDestinations";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import type { Attraction, Person, RecommendationItem, Region } from "../lib/types";
import {
  DEFAULT_TRIP_PREFERENCES,
  filterRecommendations,
  getSeason,
  type TripPreferences,
} from "../lib/tripPreferences";
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

  const destinationRegions = useMemo(
    () =>
      SAMPLE_REGIONS.filter(
        (region) =>
          (tripPreferences.province === "all" || region.province === tripPreferences.province) &&
          (tripPreferences.regionCode === "all" || region.code === tripPreferences.regionCode),
      ),
    [tripPreferences.province, tripPreferences.regionCode],
  );
  const recommendations: RecommendationItem[] = useMemo(() => {
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
    return filterRecommendations(candidates, people, tripPreferences)
      .filter((item) => locationCodes.has(item.region.code))
      .slice(0, 5);
  }, [destinationRegions, people, tripPreferences]);

  const exploreRecommendations = useMemo(() => {
    if (people == null || people.length === 0 || destinationRegions.length === 0) return [];
    const excludeCodes = new Set(recommendations.map((r) => r.region.code));
    const locationCodes = new Set(destinationRegions.map((region) => region.code));
    return filterRecommendations(
      getExploreRecommendations(people, SAMPLE_REGIONS, excludeCodes),
      people,
      tripPreferences,
    ).filter((item) => locationCodes.has(item.region.code));
  }, [destinationRegions, people, recommendations, tripPreferences]);

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
  }, []);
  const displayedRegion = selectedSeasonalPlace ? null : selectedRegion ?? recommendations[0]?.region ?? null;
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
          ← TrueTrip
        </Link>
        <p className="sample-notice">
          시범 권역(충청권·강원권 일부) 샘플 데이터입니다. 실제 방문자·안전 데이터는{" "}
          <code>tourism_platform</code> 파이썬 패키지의 계산 결과로 교체합니다.
        </p>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <CompanionForm
            regions={SAMPLE_REGIONS}
            preferences={tripPreferences}
            onPreferencesChange={(preferences) => {
              setTripPreferences(preferences);
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
          <RecommendationList
            items={recommendations}
            exploreItems={exploreRecommendations}
            emptyMessage={
              people == null
                ? "여행 조건을 정하고 동행자를 입력한 뒤 추천받아 보세요."
                : "현재 조건에 맞는 여행지가 없어요. 목적이나 지역 범위를 넓혀 보세요."
            }
            onSelect={(region) => {
              setSelectedRegion(region);
              setSelectedAttraction(null);
              setSelectedSeasonalPlace(null);
            }}
            onSelectAttraction={handleSelectAttraction}
            selectedCode={displayedRegion?.code}
          />
        </aside>

        <section className="content">
          {selectedAttraction && (
            <TripPreparation attraction={selectedAttraction} preferences={tripPreferences} />
          )}
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
          />
          {selectedAttraction && (
            <AttractionDetail
              attraction={selectedAttraction}
              region={displayedRegion}
              locationLabel={selectedSeasonalPlace?.location}
              seasonalTiming={selectedSeasonalPlace?.timing}
              seasonalDescription={selectedSeasonalPlace?.summary}
            />
          )}
          {displayedRegion && (
            <LiveAttractionsPanel
              loading={liveLoading}
              items={liveAttractions}
              onSelectAttraction={handleSelectAttraction}
            />
          )}
          {displayedRegion && <SafetyPanel region={displayedRegion} filters={safetyFilters} />}
        </section>
      </main>
    </div>
  );
}
