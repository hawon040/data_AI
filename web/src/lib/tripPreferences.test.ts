import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { SEASONAL_DESTINATIONS } from "./seasonalDestinations";
import {
  DEFAULT_TRIP_PREFERENCES,
  filterRecommendations,
  getPreparationTips,
  tripMonth,
  tripSeason,
  type TripPreferences,
} from "./tripPreferences";
import type { Attraction, RecommendationItem } from "./types";

const SUMMER = "2026-07-15";
const AUTUMN = "2026-11-14";
const prefs = (visitDate: string): TripPreferences => ({ ...DEFAULT_TRIP_PREFERENCES, visitDate });

describe("여행 월·계절은 방문일에서 계산한다", () => {
  it("2026-07-15 → 7월·여름, 2026-11-14 → 11월·가을", () => {
    expect(tripMonth(prefs(SUMMER))).toBe(7);
    expect(tripSeason(prefs(SUMMER))).toBe("summer");
    expect(tripMonth(prefs(AUTUMN))).toBe(11);
    expect(tripSeason(prefs(AUTUMN))).toBe("autumn");
  });

  it("여행 조건에 월을 따로 두지 않는다(방문일만 바꾸면 계절이 따라 바뀐다)", () => {
    expect("month" in DEFAULT_TRIP_PREFERENCES).toBe(false);
  });

  it("계절 사진(SeasonalDiscovery)은 방문일의 계절 목록을 쓴다", () => {
    expect(SEASONAL_DESTINATIONS[tripSeason(prefs(SUMMER))]).toBe(SEASONAL_DESTINATIONS.summer);
    expect(SEASONAL_DESTINATIONS[tripSeason(prefs(AUTUMN))]).toBe(SEASONAL_DESTINATIONS.autumn);
  });

  it("계절 추천(SEASON_TAGS): 여름이면 체험(activity), 가을이면 역사(history) 관광지에 계절 가점이 붙는다", () => {
    const attraction = (name: string, tags: Attraction["tags"]): Attraction => ({
      name, category: "", tags, lat: 0, lng: 0, popularityScore: 50,
    });
    const region = {
      ...SAMPLE_REGIONS[0],
      attractions: [attraction("체험장", ["activity"]), attraction("고택", ["history"])],
    };
    const item: RecommendationItem = { region, score: 1, perPersonLQ: [], evidence: [], topAttractions: [] };
    const top = (visitDate: string) =>
      filterRecommendations([item], [], prefs(visitDate))[0].topAttractions.map(({ attraction: a, matchScore }) => [a.name, matchScore]);
    expect(top(SUMMER)).toEqual([["체험장", 53], ["고택", 50]]);
    expect(top(AUTUMN)).toEqual([["고택", 53], ["체험장", 50]]);
  });

  it("준비물의 계절 안내도 방문일 기준이다", () => {
    const attraction = SAMPLE_REGIONS[0].attractions[0];
    expect(getPreparationTips(attraction, prefs(SUMMER))).toContain("자외선 차단제와 휴대용 물을 준비하세요.");
    expect(getPreparationTips(attraction, prefs(AUTUMN))).toContain("일교차에 대비해 가벼운 겉옷을 챙기세요.");
    expect(getPreparationTips(attraction, prefs("2026-12-24"))).toContain("따뜻한 겉옷과 미끄럼 방지 신발을 준비하세요.");
  });
});
