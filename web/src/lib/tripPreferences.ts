import { rankAttractions } from "./recommend";
import type { Attraction, AttractionTag, Person, RecommendationItem, Region } from "./types";

export type TravelPurpose = "all" | "hiking" | "experience" | "festival" | "sea" | "stroll";
export type TravelStyle = "all" | "active" | "relaxed" | "family" | "culture" | "food";
export type TransportMode = "tour-bus" | "car" | "public-transit" | "walking";
export type RankingMode = "companion" | "popular";
export type TripDuration = "day" | "overnight";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface TripPreferences {
  month: number;
  purpose: TravelPurpose;
  style: TravelStyle;
  province: string;
  regionCode: string;
  transport: TransportMode;
  ranking: RankingMode;
  duration: TripDuration;
}

export const DEFAULT_TRIP_PREFERENCES: TripPreferences = {
  month: new Date().getMonth() + 1,
  purpose: "all",
  style: "all",
  province: "all",
  regionCode: "all",
  transport: "public-transit",
  ranking: "companion",
  duration: "day",
};

export const PURPOSE_OPTIONS: { value: TravelPurpose; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "hiking", label: "산행" },
  { value: "experience", label: "체험·액티비티" },
  { value: "festival", label: "축제·문화" },
  { value: "sea", label: "바다·호수" },
  { value: "stroll", label: "산책·휴식" },
];

export const STYLE_OPTIONS: { value: TravelStyle; label: string }[] = [
  { value: "all", label: "스타일 전체" },
  { value: "active", label: "활동적인 여행" },
  { value: "relaxed", label: "여유로운 여행" },
  { value: "family", label: "가족 여행" },
  { value: "culture", label: "역사·문화" },
  { value: "food", label: "맛집·카페" },
];

export const TRANSPORT_OPTIONS: { value: TransportMode; label: string }[] = [
  { value: "public-transit", label: "대중교통" },
  { value: "tour-bus", label: "관광버스" },
  { value: "car", label: "자가용" },
  { value: "walking", label: "도보·자전거" },
];

const PURPOSE_TAGS: Record<Exclude<TravelPurpose, "all">, AttractionTag[]> = {
  hiking: ["nature"],
  experience: ["activity", "theme_park", "resort"],
  festival: ["culture", "history"],
  sea: [],
  stroll: ["nature", "view", "cafe", "culture"],
};

const STYLE_TAGS: Record<Exclude<TravelStyle, "all">, AttractionTag[]> = {
  active: ["activity", "theme_park", "resort"],
  relaxed: ["nature", "view", "cafe"],
  family: ["theme_park", "nature", "history", "culture"],
  culture: ["history", "culture"],
  food: ["food", "cafe"],
};

const SEASON_TAGS: Record<Season, AttractionTag[]> = {
  spring: ["nature", "culture", "view"],
  summer: ["nature", "activity", "resort", "view"],
  autumn: ["nature", "history", "view"],
  winter: ["culture", "history", "cafe", "resort"],
};

export function getSeason(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export const SEASON_LABELS: Record<Season, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

function matchesTags(tags: AttractionTag[], selected: AttractionTag[]): boolean {
  return selected.some((tag) => tags.includes(tag));
}

function matchesPurpose(attraction: Attraction, purpose: TravelPurpose): boolean {
  if (purpose === "all") return true;
  if (purpose === "sea") return /(해변|바다|항|섬|호수|해안|해수욕장)/.test(attraction.name);
  return matchesTags(attraction.tags, PURPOSE_TAGS[purpose]);
}

export function filterRecommendations(
  items: RecommendationItem[],
  people: Person[],
  preferences: TripPreferences,
): RecommendationItem[] {
  const seasonTags = SEASON_TAGS[getSeason(preferences.month)];

  const filtered = items.flatMap((item) => {
    const attractions = item.region.attractions.filter((attraction) => {
      if (!matchesPurpose(attraction, preferences.purpose)) return false;
      return preferences.style === "all" || matchesTags(attraction.tags, STYLE_TAGS[preferences.style]);
    });
    if (attractions.length === 0) return [];

    const topAttractions = rankAttractions(attractions, people, attractions.length)
      .map((ranked) => ({
        ...ranked,
        matchScore: ranked.matchScore + (seasonTags.some((tag) => ranked.attraction.tags.includes(tag)) ? 3 : 0),
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    return [{ ...item, topAttractions }];
  });

  if (preferences.ranking === "popular") {
    return filtered.sort((a, b) => b.region.totalVisitors - a.region.totalVisitors);
  }

  return filtered.sort((a, b) => {
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    return b.region.totalVisitors - a.region.totalVisitors;
  });
}

export interface DiscoveryItem {
  region: Region;
  attraction: Attraction;
  matchScore: number;
}

export function getSeasonalDiscoveries(
  items: RecommendationItem[],
  ranking: RankingMode,
  limit = 8,
): DiscoveryItem[] {
  const discoveries = items
    .flatMap((item) =>
      item.topAttractions.map(({ attraction, matchScore }) => ({
        region: item.region,
        attraction,
        matchScore,
      })),
    );
  discoveries.sort((a, b) =>
    ranking === "popular"
      ? b.attraction.popularityScore - a.attraction.popularityScore
      : b.matchScore - a.matchScore,
  );
  return discoveries.slice(0, limit);
}

export function getPreparationTips(
  attraction: Attraction,
  preferences: TripPreferences,
): string[] {
  const tips = new Set<string>();
  const month = preferences.month;

  if (attraction.tags.includes("nature")) {
    tips.add("걷기 편한 신발과 물을 챙기세요.");
  }
  if (["activity", "theme_park"].some((tag) => attraction.tags.includes(tag as AttractionTag))) {
    tips.add("운영 시간과 사전 예약·이용 요금을 방문 전에 확인하세요.");
  }
  if (month >= 6 && month <= 9) {
    tips.add("자외선 차단제와 휴대용 물을 준비하세요.");
  } else if (month === 12 || month <= 2) {
    tips.add("따뜻한 겉옷과 미끄럼 방지 신발을 준비하세요.");
  } else if (month === 3 || month >= 10) {
    tips.add("일교차에 대비해 가벼운 겉옷을 챙기세요.");
  }
  if (preferences.transport === "public-transit" || preferences.transport === "tour-bus") {
    tips.add("출발 전 대중교통·관광버스 시간표와 막차 시간을 확인하세요.");
  } else if (preferences.transport === "car") {
    tips.add("주차 가능 여부와 현장 주차 요금을 확인하세요.");
  } else {
    tips.add("도보·자전거 이동 구간과 대여 운영 여부를 미리 확인하세요.");
  }
  if (preferences.duration === "day") {
    tips.add("당일 일정에 맞춰 왕복 이동 시간과 마지막 입장 시간을 확인하세요.");
  } else {
    tips.add("숙소 위치와 체크인·체크아웃 시간을 함께 확인하세요.");
  }
  if (tips.size === 0) tips.add("방문 당일 운영 시간, 날씨, 입장 정보를 확인하세요.");
  return [...tips];
}
