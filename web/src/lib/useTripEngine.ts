import { useCallback, useEffect, useMemo, useState } from "react";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import type { SafetyDisplayFilters } from "./safetyPriority";
import type { Person, RecommendationItem } from "./types";
import { EMPTY_WEATHER, loadRegionWeather, tripDates, type RegionWeather } from "./liveWeather";
import { getExploreRecommendations, getRecommendations, topAttractionsOf } from "./recommend";
import { filterRecommendations, todayIso, type TripPreferences } from "./tripPreferences";
import { listWeatherExclusions } from "./weatherExclusions";
import { findWeatherPreset } from "./weatherPresets";
import { applyWeatherRules, decideWeather, type WeatherDecision } from "./weatherRules";

/**
 * 여행 조건(동행자·방문일·지역)으로 추천과 방문일 날씨 판정을 계산한다.
 * AppPage(PC)와 모바일 화면이 같은 계산을 쓰도록 AppPage에서 꺼내 왔다. 계산 내용은 그대로다.
 *
 * people이 null이면 아직 "추천받기"를 누르기 전이다(추천 없음, 날씨도 불러오지 않는다).
 */
export function useTripEngine({
  people,
  safetyFilters,
  tripPreferences,
  weatherDemo,
}: {
  people: Person[] | null;
  safetyFilters: SafetyDisplayFilters;
  tripPreferences: TripPreferences;
  weatherDemo: boolean;
}) {
  const destinationRegions = useMemo(
    () =>
      SAMPLE_REGIONS.filter(
        (region) =>
          (tripPreferences.province === "all" || region.province === tripPreferences.province) &&
          (tripPreferences.regionCode === "all" || region.code === tripPreferences.regionCode),
      ),
    [tripPreferences.province, tripPreferences.regionCode],
  );

  const weatherPreset = findWeatherPreset(tripPreferences.weatherPreset);
  const { duration, visitDate, nights } = tripPreferences;
  const tripDays = useMemo(() => tripDates({ duration, visitDate, nights }), [duration, visitDate, nights]);
  // 어르신·아이 동반이면 weather.py가 준비물(tips)을 엄격 기준으로 낸다(판정은 웹 weatherRules가 따로 한다).
  const weatherWith = [safetyFilters.withElderly && "senior", safetyFilters.withChildren && "child"]
    .filter(Boolean)
    .join(",");
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

  return {
    destinationRegions,
    weatherPreset,
    tripDays,
    weatherLoading,
    regionWeather,
    weatherDecisions,
    applyRegionWeather,
    weatherRestricted,
    preWeatherRecommendations,
    recommendations,
    weatherExclusions,
    exploreRecommendations,
  };
}
