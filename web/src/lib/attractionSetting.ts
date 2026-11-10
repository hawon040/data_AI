/**
 * 관광지를 실내/야외, 바다·산·계곡 여부로 나눈다 (날씨 규칙용).
 *
 * 관광지 데이터에는 이 구분이 따로 없어서 이름·분류의 키워드로 판단하고,
 * 키워드로 안 맞는 곳만 OVERRIDES에 직접 적는다. 판단이 안 되면 야외로 본다 —
 * 날씨가 나쁠 때 실내라고 잘못 추천하는 쪽이 더 위험하기 때문이다.
 */
import type { Attraction } from "./types";

export type Setting = "indoor" | "outdoor";
export type Terrain = "sea" | "mountain" | "valley";

export const TERRAIN_LABELS: Record<Terrain, string> = { sea: "바다", mountain: "산", valley: "계곡" };

export interface AttractionSetting {
  setting: Setting;
  terrains: Terrain[];
}

const INDOOR_PATTERN = /(박물관|미술관|갤러리|기념관|문학관|전시|아쿠아리움|동굴|시장|카페|맛집|음식점|쇼핑|문화시설|실내)/;
const TERRAIN_PATTERNS: Record<Terrain, RegExp> = {
  sea: /(바다|해변|해수욕장|해안|[가-힣]항$)/,
  mountain: /(국립공원|휴양림|산성|활공장|[가-힣]산(?=$|\s|\())/,
  valley: /(계곡|폭포)/,
};

/** 키워드로 판단이 틀리거나 안 되는 곳만 직접 적는다. */
const OVERRIDES: Record<string, Partial<AttractionSetting>> = {
  정동진: { terrains: ["sea"] },
  주문진항: { setting: "outdoor" }, // 분류가 "맛집·자연"이지만 항구는 야외다
  대포항: { setting: "outdoor" },
  강원랜드: { setting: "indoor" }, // 카지노·실내 시설 중심
  "춘천 애니메이션박물관": { setting: "indoor" },
};

export function classifyAttraction(attraction: Pick<Attraction, "name" | "category">): AttractionSetting {
  const text = `${attraction.name} ${attraction.category}`;
  const override = OVERRIDES[attraction.name] ?? {};
  const terrains = (Object.keys(TERRAIN_PATTERNS) as Terrain[]).filter(
    (terrain) => TERRAIN_PATTERNS[terrain].test(attraction.name) || TERRAIN_PATTERNS[terrain].test(attraction.category),
  );
  return {
    setting: override.setting ?? (INDOOR_PATTERN.test(text) ? "indoor" : "outdoor"),
    terrains: override.terrains ?? terrains,
  };
}
