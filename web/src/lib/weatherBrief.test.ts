import { describe, expect, it } from "vitest";
import { EMPTY_WEATHER, type DayWeather, type RegionWeather } from "./liveWeather";
import { briefLine, WEATHER_FAILED_MESSAGE, WEATHER_NO_FORECAST_MESSAGE, weatherBrief } from "./weatherBrief";
import type { WeatherSnapshot } from "./weatherRules";

const SNAP: WeatherSnapshot = {
  ...EMPTY_WEATHER,
  pop: 20,
  precipitation: "none",
  minTempC: 3,
  maxTempC: 12,
  pm10Grade: 2,
  pm25Grade: 1,
};

function day(partial: Partial<DayWeather>): DayWeather {
  return {
    date: "2026-11-23",
    snapshot: SNAP,
    sky: "맑음",
    source: null,
    now: null,
    airObservedAt: null,
    warningsHere: [],
    warningsNearby: [],
    tips: [],
    failed: [],
    unreachable: false,
    ...partial,
  };
}

function region(days: DayWeather[]): RegionWeather {
  const known = days.flatMap((d) => (d.snapshot ? [d.snapshot] : []));
  return { days, worst: known[0] ?? null, tips: [] };
}

describe("briefLine", () => {
  it("하늘·기온·강수확률·미세먼지 순서로 한 줄", () => {
    expect(briefLine(SNAP, "맑음")).toBe("맑음 · 최저 3℃ / 최고 12℃ · 강수확률 20% · 미세먼지 보통");
  });
  it("하늘 상태가 없으면 강수 형태로 대신한다", () => {
    expect(briefLine({ ...SNAP, precipitation: "rain", pop: 80 })).toBe("비 · 최저 3℃ / 최고 12℃ · 강수확률 80% · 미세먼지 보통");
  });
  it("모르는 값은 뺀다", () => {
    expect(briefLine({ ...EMPTY_WEATHER, pop: 10 })).toBe("강수확률 10%");
  });
});

describe("weatherBrief", () => {
  it("예보가 있으면 판정 문장 없이도 기본 요약", () => {
    expect(weatherBrief(region([day({})]))).toEqual({
      kind: "ok",
      text: "맑음 · 최저 3℃ / 최고 12℃ · 강수확률 20% · 미세먼지 보통",
    });
  });
  it("서버에 연결하지 못하면 실패 한 줄", () => {
    expect(weatherBrief(region([day({ snapshot: null, sky: null, unreachable: true })]))).toEqual({
      kind: "failed",
      text: WEATHER_FAILED_MESSAGE,
    });
    expect(weatherBrief(undefined).kind).toBe("failed");
  });
  it("예보 범위 밖이면 다시 확인 안내", () => {
    expect(weatherBrief(region([day({ snapshot: null, sky: null })]))).toEqual({
      kind: "none",
      text: WEATHER_NO_FORECAST_MESSAGE,
    });
  });
  it("시연 모드는 예시 날씨로 만든다", () => {
    expect(weatherBrief(undefined, { ...SNAP, precipitation: "rain", pop: 80 }).text).toContain("비 · ");
  });
});
