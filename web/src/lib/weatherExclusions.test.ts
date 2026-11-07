import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { topAttractionsOf } from "./recommend";
import { EMPTY_WEATHER } from "./liveWeather";
import { listWeatherExclusions } from "./weatherExclusions";
import { decideWeather } from "./weatherRules";

const party = { withElderly: false, withChildren: false };
const region = SAMPLE_REGIONS.find((r) => r.name === "강릉시")!;
const item = { region, score: 1, perPersonLQ: [], evidence: [], topAttractions: topAttractionsOf(region, [], 10) };

describe("listWeatherExclusions", () => {
  it("비 예보면 야외 관광지가 '강수확률 → 실내만 추천' 이유로 빠진다", () => {
    const decision = decideWeather({ ...EMPTY_WEATHER, pop: 70, precipitation: "rain" }, party, "2026-11-08", "2026-11-07");
    const excluded = listWeatherExclusions([item], () => decision);
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every((e) => e.reason.endsWith("→ 실내만 추천"))).toBe(true);
    expect(excluded[0].reason).toContain("비 예보");
  });
  it("특보면 바다·산 관광지가 특보 이름과 함께 빠진다", () => {
    const decision = decideWeather({ ...EMPTY_WEATHER, pop: 10, precipitation: "none", warnings: ["풍랑"] }, party, "2026-11-08", "2026-11-07");
    const excluded = listWeatherExclusions([item], () => decision);
    expect(excluded.some((e) => e.reason.startsWith("풍랑 특보 →") && e.reason.includes("바다"))).toBe(true);
    expect(excluded.every((e) => !e.reason.includes("실내만"))).toBe(true);
  });
  it("날씨가 좋으면 빠지는 곳이 없다", () => {
    const decision = decideWeather({ ...EMPTY_WEATHER, pop: 0, precipitation: "none", minTempC: 5, maxTempC: 15 }, party, "2026-11-08", "2026-11-07");
    expect(listWeatherExclusions([item], () => decision)).toEqual([]);
  });
});
