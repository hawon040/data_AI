import { rankAttractions } from "./recommend";
import { classifyAttraction } from "./attractionSetting";
import type { Attraction, AttractionTag, Person, RecommendationItem, Region } from "./types";

export type TravelPurpose = "all" | "hiking" | "experience" | "festival" | "sea" | "stroll";
export type TravelStyle = "all" | "active" | "relaxed" | "family" | "culture" | "food";
export type TransportMode = "tour-bus" | "car" | "public-transit" | "walking" | "bicycle";
/** 추천 순서. nearest(가까운 순)는 출발지가 있을 때만 쓴다(점수 계산은 그대로, 정렬만 거리로). */
export type RankingMode = "companion" | "popular" | "nearest";
export type TripDuration = "day" | "overnight";
export type TripNights = 1 | 2 | 3;

export const NIGHTS_OPTIONS: { value: TripNights; label: string }[] = [
  { value: 1, label: "1박 2일" },
  { value: 2, label: "2박 3일" },
  { value: 3, label: "3박 4일" },
];
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface TripPreferences {
  purpose: TravelPurpose;
  style: TravelStyle;
  transport: TransportMode;
  ranking: RankingMode;
  duration: TripDuration;
  /** 방문일 (YYYY-MM-DD, 로컬 날짜). 여행 월과 계절은 따로 받지 않고 이 날짜에서 계산한다(tripMonth). */
  visitDate: string;
  /** 1박 이상일 때 박 수. 종료일 = 방문일 + nights. 당일치기면 쓰지 않는다. */
  nights: TripNights;
  /** 시연 모드(주소에 ?demo=weather)에서 쓸 날씨 예시 id (lib/weatherPresets.ts) */
  weatherPreset: string;
  /** 최대 편도 이동 시간(시간). null은 '상관없음'(기본값, 거르지 않음). 출발지가 있을 때만 쓴다 */
  maxTravelHours: number | null;
}

/** YYYY-MM-DD 날짜에 days일을 더한다. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return todayIso(new Date(y, m - 1, d + days));
}

/** 오늘 날짜(로컬)를 YYYY-MM-DD로. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const DEFAULT_TRIP_PREFERENCES: TripPreferences = {
  purpose: "all",
  style: "all",
  transport: "public-transit",
  ranking: "companion",
  duration: "day",
  visitDate: todayIso(),
  nights: 1,
  weatherPreset: "clear",
  maxTravelHours: null,
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
  { value: "walking", label: "도보" },
  { value: "bicycle", label: "자전거" },
];

/** 태그로 판정하는 목적. '산행'·'바다·호수'는 이름이 아니라 지형 분류(attractionSetting)로 판정한다. */
const PURPOSE_TAGS: Record<Exclude<TravelPurpose, "all" | "hiking" | "sea">, AttractionTag[]> = {
  experience: ["activity", "theme_park", "resort"],
  festival: ["culture", "history"],
  stroll: ["nature", "view", "cafe", "culture"],
};

/** 목적 문구: "비 예보로 체험할 곳이 없어요" */
export const PURPOSE_PHRASES: Record<Exclude<TravelPurpose, "all">, string> = {
  hiking: "산행할",
  experience: "체험할",
  festival: "축제·문화를 즐길",
  sea: "바다·호수를 즐길",
  stroll: "산책할",
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

/** 여행 월(1~12). 방문일(YYYY-MM-DD)에서 계산한다 — 월만 따로 바꾸는 입력은 없다. */
export function tripMonth(preferences: Pick<TripPreferences, "visitDate">): number {
  return Number(preferences.visitDate.slice(5, 7));
}

/** 방문일의 계절 (계절 추천·계절 사진·계절 테마에 쓴다) */
export function tripSeason(preferences: Pick<TripPreferences, "visitDate">): Season {
  return getSeason(tripMonth(preferences));
}

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

/**
 * 팀 결정(11/14)으로 목적 판정을 따로 정한 관광지. 지형·태그 판정보다 먼저 본다.
 *  - 단양 패러글라이딩 활공장: 산 위지만 산행이 아니라 체험(체험 목적은 activity 태그로 그대로)
 *  - 궁남지: 연못이라 바다·호수가 아니고 산책·휴식
 *  - 국립공원·민둥산: 산행만(산책·휴식 제외)
 * 안목해변 카페거리(바다 지형)와 남이섬(호수 지형)은 지형 판정으로 바다·호수에 들어간다.
 */
export const PURPOSE_OVERRIDES: Record<string, Partial<Record<Exclude<TravelPurpose, "all">, boolean>>> = {
  "단양 패러글라이딩 활공장": { hiking: false },
  궁남지: { sea: false, stroll: true },
  "설악산 국립공원": { stroll: false },
  "계룡산 국립공원": { stroll: false },
  "오대산 국립공원(월정사)": { stroll: false },
  민둥산: { stroll: false },
};

export function matchesPurpose(attraction: Attraction, purpose: TravelPurpose): boolean {
  if (purpose === "all") return true;
  const decided = PURPOSE_OVERRIDES[attraction.name]?.[purpose];
  if (decided !== undefined) return decided;
  const { terrains } = classifyAttraction(attraction);
  // 예전에는 '산행'을 nature 태그로, '바다·호수'를 이름 정규식으로 판정해 해변·항구·동굴이 산행에, 정동진·영랑호가 바다·호수에서 빠졌다.
  if (purpose === "hiking") return terrains.includes("mountain");
  if (purpose === "sea") return terrains.includes("sea") || terrains.includes("lake");
  return matchesTags(attraction.tags, PURPOSE_TAGS[purpose]);
}

/** 카지노는 아이(10세 미만) 동반이거나 동행자에 10대가 있으면 후보에서 뺀다(만 19세 이상 입장). */
export function allowedForParty(attraction: Attraction, people: Person[], party?: { withChildren: boolean }): boolean {
  if (!attraction.tags.includes("casino")) return true;
  return !(party?.withChildren || people.some((person) => person.ageGroup === "10s"));
}

export function filterRecommendations(
  items: RecommendationItem[],
  people: Person[],
  preferences: TripPreferences,
  party?: { withChildren: boolean },
): RecommendationItem[] {
  const seasonTags = SEASON_TAGS[tripSeason(preferences)];

  const filtered = items.flatMap((item) => {
    const attractions = item.region.attractions.filter((attraction) => {
      if (!matchesPurpose(attraction, preferences.purpose)) return false;
      if (!allowedForParty(attraction, people, party)) return false;
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

/** 관광지 성격(태그)에 따른 준비물 — 체크리스트의 관광지 단계에 쓴다. */
export function attractionTagTips(attraction: Pick<Attraction, "tags">): string[] {
  const tips: string[] = [];
  if (attraction.tags.includes("nature")) {
    tips.push("걷기 편한 신발과 물을 챙기세요.");
  }
  if (["activity", "theme_park"].some((tag) => attraction.tags.includes(tag as AttractionTag))) {
    tips.push("운영 시간과 사전 예약·이용 요금을 방문 전에 확인하세요.");
  }
  return tips;
}

/** 일정·교통편·계절(방문일)에 따른 공통 준비물 — 체크리스트의 공통 단계에 쓴다. */
export function commonPreparationTips(preferences: TripPreferences): string[] {
  const tips: string[] = [];
  const month = tripMonth(preferences);
  if (month >= 6 && month <= 9) {
    tips.push("자외선 차단제와 휴대용 물을 준비하세요.");
  } else if (month === 12 || month <= 2) {
    tips.push("따뜻한 겉옷과 미끄럼 방지 신발을 준비하세요.");
  } else if (month === 3 || month >= 10) {
    tips.push("일교차에 대비해 가벼운 겉옷을 챙기세요.");
  }
  if (preferences.transport === "public-transit" || preferences.transport === "tour-bus") {
    tips.push("출발 전 대중교통·관광버스 시간표와 막차 시간을 확인하세요.");
  } else if (preferences.transport === "car") {
    tips.push("주차 가능 여부와 현장 주차 요금을 확인하세요.");
  } else if (preferences.transport === "walking") {
    tips.push("도보 이동 구간과 쉴 곳을 미리 확인하세요.");
  } else {
    tips.push("자전거 이동 구간과 대여 운영 여부를 미리 확인하세요.");
  }
  if (preferences.duration === "day") {
    tips.push("당일 일정에 맞춰 왕복 이동 시간과 마지막 입장 시간을 확인하세요.");
  } else {
    tips.push("숙소 위치와 체크인·체크아웃 시간을 함께 확인하세요.");
  }
  return tips;
}

/** 관광지 태그 + 공통 준비물 (예전 체크리스트와 같은 결과) */
export function getPreparationTips(attraction: Attraction, preferences: TripPreferences): string[] {
  return [...new Set([...attractionTagTips(attraction), ...commonPreparationTips(preferences)])];
}
