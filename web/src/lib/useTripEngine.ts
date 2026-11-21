import { useCallback, useEffect, useMemo, useState } from "react";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import type { ExcludedAttraction } from "../components/RecommendationList";
import { exclusionLabel } from "./cardInfo";
import type { SafetyDisplayFilters } from "./safetyPriority";
import type { Person, RecommendationItem } from "./types";
import { EMPTY_WEATHER, loadRegionWeather, tripDates, type RegionWeather } from "./liveWeather";
import { applyDistanceLimit, sortByNearest, type Origin } from "./origin";
import { getExploreRecommendations, getRecommendations, topAttractionsOf } from "./recommend";
import { applyTravelTimeLimit } from "./travelTime";
import { filterRecommendations, todayIso, type RankingMode, type TripPreferences } from "./tripPreferences";
import { keepIndoorOnly, listWeatherExclusions, regionsWithoutPurposeMatches } from "./weatherExclusions";
import { findWeatherPreset } from "./weatherPresets";
import { applyWeatherRules, decideWeather, isAllowed, type WeatherDecision } from "./weatherRules";

/**
 * 여행 조건(동행자·방문일·출발지·교통편)으로 추천과 방문일 날씨 판정을 계산한다.
 * AppPage(PC)와 모바일 화면(MobileApp)이 같은 계산을 쓴다.
 *
 * 순서: 동행자 점수 → 목적·스타일·동행자 거르기 → (실내 재추천) → 날씨 → 도보·자전거 거리 → 최대 이동 시간 → (가까운 순) 정렬.
 * 추천은 항상 시범 지역 전체에서 고른다("지도에서 볼 지역"은 지도만 바꾼다).
 * people이 null이면 아직 "추천받기"를 누르기 전이다(추천 없음, 날씨도 불러오지 않는다).
 */
export function useTripEngine({
  people,
  safetyFilters,
  tripPreferences,
  weatherDemo,
  origin,
  indoorRetry,
  ranking,
}: {
  people: Person[] | null;
  safetyFilters: SafetyDisplayFilters;
  tripPreferences: TripPreferences;
  weatherDemo: boolean;
  /** 출발지(내 위치 또는 직접 고른 시·군·구). 거리 표시·도보·자전거 거르기·이동 시간에만 쓴다 */
  origin: Origin | null;
  /** "실내 관광지로 다시 추천받기"를 눌렀을 때만 true */
  indoorRetry: boolean;
  /** 실제로 쓸 추천 순서(effectiveRanking 결과) */
  ranking: RankingMode;
}) {
  const destinationRegions = SAMPLE_REGIONS;

  const weatherPreset = findWeatherPreset(tripPreferences.weatherPreset);
  const { duration, visitDate, nights, transport, maxTravelHours, purpose } = tripPreferences;
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

  // 날씨 규칙을 적용하기 전 추천(목적·스타일·동행자로 거른 것). 날씨 때문에 빠진 곳을 보여 줄 때도 쓴다.
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

  // 날씨 규칙 → (도보·자전거면) 출발지 거리 기준으로 거른다. 추천 순위 계산은 바꾸지 않는다.
  const weatherApplied = useMemo(
    () => applyRegionWeather(preWeatherRecommendations),
    [preWeatherRecommendations, applyRegionWeather],
  );
  const distance = useMemo(() => applyDistanceLimit(weatherApplied, origin, transport), [weatherApplied, origin, transport]);
  // 최대 이동 시간(기본 '상관없음')을 넘는 관광지를 뺀다. 도보·자전거 거리 제한 뒤에 적용한다.
  const travelLimited = useMemo(
    () => applyTravelTimeLimit(distance.items, origin, transport, maxTravelHours),
    [distance, origin, transport, maxTravelHours],
  );
  // 가까운 순이면 지역 안 추천 관광지 중 가장 가까운 곳의 거리로 정렬한다(점수 계산은 그대로).
  const recommendations: RecommendationItem[] = useMemo(
    () => (ranking === "nearest" && origin ? sortByNearest(travelLimited.items, origin) : travelLimited.items).slice(0, 5),
    [travelLimited, ranking, origin],
  );
  // 이동 시간 때문에 빠진 곳도 원래 상위 5개 지역(거리 제한 뒤)에서 모은다.
  const travelExclusions = useMemo(
    () => applyTravelTimeLimit(distance.items.slice(0, 5), origin, transport, maxTravelHours).excluded,
    [distance, origin, transport, maxTravelHours],
  );
  // 거리 때문에 빠진 곳은 원래 상위 5개 지역에서만 모은다(날씨 제외 목록과 같은 범위).
  const distanceExclusions = useMemo(
    () => applyDistanceLimit(weatherApplied.slice(0, 5), origin, transport).excluded,
    [weatherApplied, origin, transport],
  );
  // 도보·자전거면 거리 밖 관광지는 먼저 뺀다. 날씨 제외 개수·카드 안 제외 표시·목적 없음 카드는 거리 안 관광지만 센다.
  const preWeatherNear = useMemo(
    () => applyDistanceLimit(preWeatherRecommendations, origin, transport).items,
    [preWeatherRecommendations, origin, transport],
  );
  // 날씨 때문에 목적에 맞는 관광지가 모두 빠진 지역(원래 상위 5개 중) — 순위 맨 아래에 안내 카드로 둔다.
  const purposeEmptyItems = useMemo(
    () => regionsWithoutPurposeMatches(preWeatherNear.slice(0, 5), (code) => weatherDecisions[code], purpose),
    [preWeatherNear, weatherDecisions, purpose],
  );
  // 추천 카드 안에 흐리게 보여 줄, 날씨 때문에 그 지역에서 빠진 관광지(목적·스타일에 맞는 후보 중)
  const excludedByRegion = useMemo(() => {
    const map = new Map<string, ExcludedAttraction[]>();
    for (const item of preWeatherNear) {
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
  }, [preWeatherNear, weatherDecisions]);
  const weatherExclusions = useMemo(
    () => listWeatherExclusions(preWeatherNear.slice(0, 5), (code) => weatherDecisions[code]),
    [preWeatherNear, weatherDecisions],
  );

  const exploreRecommendations = useMemo(() => {
    if (people == null || people.length === 0 || destinationRegions.length === 0) return [];
    const excludeCodes = new Set(recommendations.map((r) => r.region.code));
    const locationCodes = new Set(destinationRegions.map((region) => region.code));
    const explore = applyRegionWeather(
      filterRecommendations(getExploreRecommendations(people, SAMPLE_REGIONS, excludeCodes), people, tripPreferences, safetyFilters),
    ).filter((item) => locationCodes.has(item.region.code));
    // 탐색 추천도 추천 카드와 같이 거리 제한 → 최대 이동 시간으로 거른다.
    const near = applyDistanceLimit(explore, origin, transport).items;
    return applyTravelTimeLimit(near, origin, transport, maxTravelHours).items;
  }, [destinationRegions, people, recommendations, tripPreferences, applyRegionWeather, origin, safetyFilters, transport, maxTravelHours]);

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
    weatherApplied,
    distance,
    recommendations,
    travelExclusions,
    distanceExclusions,
    purposeEmptyItems,
    excludedByRegion,
    weatherExclusions,
    exploreRecommendations,
  };
}
