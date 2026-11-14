import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { classifyAttraction } from "./attractionSetting";
import { EMPTY_WEATHER } from "./liveWeather";
import { getRecommendations } from "./recommend";
import { DEFAULT_TRIP_PREFERENCES, filterRecommendations, matchesPurpose, type TravelPurpose } from "./tripPreferences";
import type { Person, RecommendationItem } from "./types";
import { INDOOR_RETRY_LABEL, keepIndoorOnly, regionsWithoutPurposeMatches } from "./weatherExclusions";
import { applyWeatherRules, decideWeather, type WeatherDecision } from "./weatherRules";

const all = SAMPLE_REGIONS.flatMap((r) => r.attractions);
const find = (name: string) => all.find((a) => a.name === name)!;
const nobody = { withElderly: false, withChildren: false };
const rain: WeatherDecision = decideWeather({ ...EMPTY_WEATHER, pop: 80, precipitation: "rain" }, nobody, "2026-11-14", "2026-11-14");
const fifties: Person[] = [{ ageGroup: "50s" }];

function pipeline(people: Person[], purpose: TravelPurpose, decision: WeatherDecision | null, withChildren = false) {
  const prefs = { ...DEFAULT_TRIP_PREFERENCES, visitDate: "2026-11-14", purpose };
  const pre = filterRecommendations(getRecommendations(people, SAMPLE_REGIONS, SAMPLE_REGIONS.length), people, prefs, { withChildren });
  const after: RecommendationItem[] = decision ? pre.flatMap((item) => applyWeatherRules([item], decision)) : pre;
  const bottom = decision ? regionsWithoutPurposeMatches(pre.slice(0, 5), () => decision, purpose) : [];
  const names = (items: RecommendationItem[]) => items.flatMap((i) => i.topAttractions.map(({ attraction }) => attraction.name));
  return { pre, after, bottom, names };
}

describe("강원랜드 (카지노)", () => {
  it("카지노·리조트, casino 태그 — 체험·액티비티 목적 후보가 아니다", () => {
    const casino = find("강원랜드");
    expect(casino.category).toBe("카지노·리조트");
    expect(casino.tags).toEqual(["casino"]);
    expect(matchesPurpose(casino, "experience")).toBe(false);
    expect(matchesPurpose(casino, "all")).toBe(true);
  });

  it("체험·액티비티 + 비 예보: 정선군이 1위로 남지 않고 강원랜드 추천이 사라진다", () => {
    const { pre, after, bottom, names } = pipeline(fifties, "experience", rain);
    expect(names(pre)).not.toContain("강원랜드");
    expect(names(after)).not.toContain("강원랜드");
    expect(after[0]?.region.name).not.toBe("정선군");
    expect(after.some((item) => item.region.name === "정선군")).toBe(false);
    // 정선군은 목적에 맞는 곳(레일바이크·하이원)이 비 때문에 모두 빠져 맨 아래 안내 카드가 된다
    const jeongseon = bottom.find((item) => item.region.name === "정선군");
    expect(jeongseon?.emptyNote).toBe("비 예보로 체험할 곳이 없어요");
    expect(jeongseon?.topAttractions).toEqual([]);
  });

  it("아이 동반이거나 동행자에 10대가 있으면 강원랜드가 나오지 않는다(목적 전체)", () => {
    expect(pipeline(fifties, "all", null).names(pipeline(fifties, "all", null).pre)).toContain("강원랜드");
    const kids = pipeline(fifties, "all", null, true);
    expect(kids.names(kids.pre)).not.toContain("강원랜드");
    const teens = pipeline([{ ageGroup: "50s" }, { ageGroup: "10s" }], "all", null);
    expect(teens.names(teens.pre)).not.toContain("강원랜드");
  });
});

describe("바다·호수와 산행은 지형 분류로 판정", () => {
  it("바다·호수: 정동진, 영랑호, 주문진항, 대포항, 경포해변, 속초해수욕장이 들어온다", () => {
    const { pre, names } = pipeline(fifties, "sea", null);
    for (const name of ["정동진", "영랑호", "주문진항", "대포항", "경포해변", "속초해수욕장"]) {
      expect(names(pre)).toContain(name);
    }
    expect(classifyAttraction(find("영랑호")).terrains).toEqual(["lake"]);
  });

  it("산행: 산 지형만(해변·항구·동굴·섬은 빠진다)", () => {
    const { pre, names } = pipeline(fifties, "hiking", null);
    const hiking = names(pre);
    for (const name of ["설악산 국립공원", "계룡산 국립공원", "민둥산", "오대산 국립공원(월정사)"]) expect(hiking).toContain(name);
    for (const name of ["경포해변", "대포항", "고수동굴", "남이섬", "영랑호"]) expect(hiking).not.toContain(name);
  });
});

describe("아바이마을", () => {
  it("바닷가 마을·갯배라 야외로 분류한다", () => {
    expect(classifyAttraction(find("아바이마을")).setting).toBe("outdoor");
  });
});

describe("목적 관광지가 날씨로 모두 빠진 지역", () => {
  it("목적과 상관없는 관광지로 채우지 않고, 맨 아래에 안내와 함께 빈 카드로 둔다", () => {
    const { after, bottom } = pipeline(fifties, "hiking", rain);
    expect(after).toEqual([]); // 산은 모두 야외라 비 예보면 남는 곳이 없다
    expect(bottom.length).toBeGreaterThan(0);
    for (const item of bottom) {
      expect(item.emptyNote).toBe("비 예보로 산행할 곳이 없어요");
      expect(item.topAttractions).toEqual([]);
    }
  });
  it("목적이 '전체'면 이 안내 카드를 만들지 않는다(그 지역 관광지가 곧 후보)", () => {
    expect(pipeline(fifties, "all", rain).bottom).toEqual([]);
  });
});

describe("[F] 실내 관광지로 다시 추천받기", () => {
  it("체험·비 예보로 모두 비면, 목적 '전체' + 실내만으로 다시 추천해 실내 관광지가 나온다", () => {
    const empty = pipeline(fifties, "experience", rain);
    expect(empty.after).toEqual([]);
    expect(empty.bottom.length).toBeGreaterThan(0);
    const retry = pipeline(fifties, "all", rain);
    const indoor = keepIndoorOnly(retry.after);
    expect(indoor.length).toBeGreaterThan(0);
    expect(indoor.every((item) => item.topAttractions.every(({ attraction }) => classifyAttraction(attraction).setting === "indoor"))).toBe(true);
    expect(INDOOR_RETRY_LABEL).toBe("실내 관광지로 다시 추천받기");
  });
  it("keepIndoorOnly는 실내 관광지가 없는 지역을 뺀다", () => {
    const { pre } = pipeline(fifties, "hiking", null); // 산행 후보는 모두 야외
    expect(keepIndoorOnly(pre)).toEqual([]);
  });
});
