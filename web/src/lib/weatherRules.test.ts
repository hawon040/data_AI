import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { classifyAttraction } from "./attractionSetting";
import { topAttractionsOf } from "./recommend";
import type { RecommendationItem } from "./types";
import { applyWeatherRules, decideWeather, type PartyInfo, type WeatherSnapshot } from "./weatherRules";

const TODAY = "2026-11-05";
const ADULTS: PartyInfo = { withElderly: false, withChildren: false };
const WITH_ELDERLY: PartyInfo = { withElderly: true, withChildren: false };
const WITH_CHILD: PartyInfo = { withElderly: false, withChildren: true };

const CLEAR: WeatherSnapshot = {
  pop: 10,
  precipitation: "none",
  minTempC: 8,
  maxTempC: 18,
  warnings: [],
  pm10Grade: 1,
  pm25Grade: 1,
};

function decide(change: Partial<WeatherSnapshot>, party = ADULTS, visitDate = TODAY) {
  return decideWeather({ ...CLEAR, ...change }, party, visitDate, TODAY);
}

describe("decideWeather", () => {
  it("맑은 날은 실내·야외를 함께 추천한다", () => {
    const d = decide({});
    expect(d.indoorOnly).toBe(false);
    expect(d.excludedTerrains).toEqual([]);
    expect(d.showIndoorAlternatives).toBe(false);
  });

  it.each([
    ["비 예보", { precipitation: "rain" as const }],
    ["눈 예보", { precipitation: "snow" as const }],
    ["강수확률 60%", { pop: 60 }],
    ["추운 날 -5℃", { minTempC: -5 }],
    ["더운 날 33℃", { maxTempC: 33 }],
    ["미세먼지 나쁨", { pm10Grade: 3 }],
    ["초미세먼지 매우나쁨", { pm25Grade: 4 }],
  ])("%s → 실내만", (_, change) => {
    expect(decide(change).indoorOnly).toBe(true);
  });

  it.each(["호우", "태풍", "풍랑"])("%s 특보 → 바다·산·계곡 제외", (warning) => {
    const d = decide({ warnings: [warning] });
    expect(d.excludedTerrains).toEqual(["sea", "mountain", "valley"]);
    expect(d.indoorOnly).toBe(false);
  });

  it("관련 없는 특보(건조)는 지형을 제외하지 않는다", () => {
    expect(decide({ warnings: ["건조"] }).excludedTerrains).toEqual([]);
  });

  it("날씨가 좋아도 비 소식(강수확률 30%)이 있으면 실내 대안을 보여 준다", () => {
    const d = decide({ pop: 30 });
    expect(d.indoorOnly).toBe(false);
    expect(d.showIndoorAlternatives).toBe(true);
  });

  describe("어르신·아이가 있으면 더 엄격하다", () => {
    it.each([
      ["강수확률 40%", { pop: 40 }],
      ["최저기온 0℃", { minTempC: 0 }],
      ["최고기온 30℃", { maxTempC: 30 }],
    ])("%s: 일반 일행은 야외 가능, 어르신·아이는 실내만", (_, change) => {
      expect(decide(change, ADULTS).indoorOnly).toBe(false);
      expect(decide(change, WITH_ELDERLY).indoorOnly).toBe(true);
      expect(decide(change, WITH_CHILD).indoorOnly).toBe(true);
    });

    it("강풍 특보는 어르신·아이가 있을 때만 지형을 제외한다", () => {
      expect(decide({ warnings: ["강풍"] }, ADULTS).excludedTerrains).toEqual([]);
      expect(decide({ warnings: ["강풍"] }, WITH_CHILD).excludedTerrains).toEqual(["sea", "mountain", "valley"]);
    });

    it("비 소식 기준도 낮아진다 (20%)", () => {
      expect(decide({ pop: 20 }, ADULTS).showIndoorAlternatives).toBe(false);
      expect(decide({ pop: 20 }, WITH_ELDERLY).showIndoorAlternatives).toBe(true);
    });
  });

  it("방문일이 3일보다 멀면 다시 확인 안내를 띄운다", () => {
    const recheck = (date: string) => decide({}, ADULTS, date).notices.some((n) => n.includes("출발 2~3일 전"));
    expect(recheck("2026-11-08")).toBe(false); // 3일 뒤
    expect(recheck("2026-11-09")).toBe(true); // 4일 뒤
    expect(recheck("2026-12-01")).toBe(true); // 달이 바뀌어도
  });

  it("모르는 값(null)은 규칙에서 건너뛴다", () => {
    const d = decide({ pop: null, precipitation: null, minTempC: null, maxTempC: null, pm10Grade: null, pm25Grade: null });
    expect(d.indoorOnly).toBe(false);
  });
});

describe("classifyAttraction", () => {
  it.each([
    ["국립청주박물관", "문화", "indoor", []],
    ["고수동굴", "자연", "indoor", []],
    ["강릉중앙시장", "맛집·쇼핑", "indoor", []],
    ["경포해변", "자연·해변", "outdoor", ["sea"]],
    ["주문진항", "맛집·자연", "outdoor", ["sea"]],
    ["정동진", "자연·전망", "outdoor", ["sea"]],
    ["설악산 국립공원", "자연", "outdoor", ["mountain"]],
    ["민둥산", "자연·전망", "outdoor", ["mountain"]],
    ["단양 패러글라이딩 활공장", "액티비티", "outdoor", ["mountain"]],
    ["백제문화단지", "테마파크", "outdoor", []],
  ])("%s → %s %j", (name, category, setting, terrains) => {
    expect(classifyAttraction({ name, category })).toEqual({ setting, terrains });
  });
});

describe("applyWeatherRules", () => {
  const items: RecommendationItem[] = SAMPLE_REGIONS.map((region) => ({
    region,
    score: 1,
    perPersonLQ: [],
    evidence: [],
    topAttractions: topAttractionsOf(region, [], region.attractions.length),
  }));
  const names = (result: RecommendationItem[]) => result.flatMap((i) => i.topAttractions.map((t) => t.attraction.name));

  it("실내만 추천하면 야외 관광지가 모두 빠진다", () => {
    const result = applyWeatherRules(items, decide({ precipitation: "rain" }));
    const all = names(result);
    expect(all.length).toBeGreaterThan(0);
    expect(all).toContain("국립청주박물관");
    expect(all).not.toContain("경포해변");
    expect(all).not.toContain("설악산 국립공원");
  });

  it("호우 특보면 바다·산은 빠지고 다른 야외 관광지는 남는다", () => {
    const all = names(applyWeatherRules(items, decide({ warnings: ["호우"] })));
    expect(all).not.toContain("경포해변");
    expect(all).not.toContain("계룡산 국립공원");
    expect(all).toContain("백제문화단지");
  });

  it("비 소식이 있으면 지역마다 실내 대안을 붙인다", () => {
    const result = applyWeatherRules(items, decide({ pop: 30 }));
    const gangneung = result.find((i) => i.region.attractions.some((a) => a.name === "경포해변"));
    expect(gangneung?.indoorAlternatives?.map((a) => a.name)).toContain("강릉중앙시장");
    expect(names(result)).toContain("경포해변"); // 야외도 그대로 추천
  });
});
