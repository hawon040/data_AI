import { describe, expect, it } from "vitest";
import { toDayWeather, tripDates, worstOf } from "./liveWeather";
import { EMPTY_WEATHER } from "./liveWeather";

const response = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-11-08",
  forecast: { source: "단기예보", pop: 60, precip: ["비"], tmin: 3, tmax: 12, issued: "202611071400" },
  air: null,
  warnings: { kinds: ["호우"] },
  ...overrides,
});

describe("tripDates", () => {
  it("당일치기는 방문일 하루", () => {
    expect(tripDates({ duration: "day", visitDate: "2026-11-07", nights: 3 })).toEqual(["2026-11-07"]);
  });
  it("2박 3일은 방문일부터 3일, 달이 바뀌어도 이어진다", () => {
    expect(tripDates({ duration: "overnight", visitDate: "2026-11-29", nights: 2 })).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
    ]);
  });
});

describe("toDayWeather (weather.py 응답 → WeatherSnapshot)", () => {
  it("필드를 대응시키고 출처에 발표 시각을 넣는다", () => {
    const day = toDayWeather("2026-11-08", response());
    expect(day.snapshot).toEqual({
      pop: 60,
      precipitation: "rain",
      minTempC: 3,
      maxTempC: 12,
      warnings: ["호우"],
      pm10Grade: null,
      pm25Grade: null,
    });
    expect(day.source).toBe("기상청 단기예보 11월 7일 14:00 발표");
  });
  it("여러 강수 형태는 더 나쁜 쪽, 미세먼지는 PM10·PM2.5 등급을 따로 쓴다", () => {
    const day = toDayWeather(
      "2026-11-07",
      response({
        forecast: { source: "단기예보", pop: 30, precip: ["빗방울", "빗방울눈날림"], tmin: 0, tmax: 5, issued: "202611070500" },
        air: { pm10Grade: 2, pm25Grade: 3, time: "2026-11-07 14:00" },
        warnings: null,
      }),
    );
    expect(day.snapshot?.precipitation).toBe("rain_snow");
    expect(day.snapshot?.pm10Grade).toBe(2);
    expect(day.snapshot?.pm25Grade).toBe(3);
    expect(day.snapshot?.warnings).toEqual([]);
    expect(day.source).toBe("기상청 단기예보 11월 7일 05:00 발표 · 에어코리아 11월 7일 14:00 측정");
  });
  it("비·눈이 없으면 none, 예보가 없으면 snapshot null", () => {
    expect(toDayWeather("2026-11-08", response({ forecast: { source: "단기예보", pop: 0, precip: [], tmin: null, tmax: null } })).snapshot?.precipitation).toBe("none");
    expect(toDayWeather("2026-11-20", response({ forecast: null })).snapshot).toBeNull();
  });
});

describe("toDayWeather — 초단기실황·API별 실패", () => {
  it("now를 현재 날씨로 바꾸고, 실패한 하위 API는 칸 이름으로만 남긴다", () => {
    const day = toDayWeather(
      "2026-11-07",
      response({
        now: { time: "20261107 1500", temp: 12.3, precipType: "없음" },
        errors: { air: "에어코리아 API가 HTTP 500을(를) 반환했습니다.", warnings: "기상특보 API 오류" },
      }),
    );
    expect(day.now).toEqual({ tempC: 12.3, precipType: "없음", observedAt: "11월 7일 15:00" });
    expect(day.failed.sort()).toEqual(["air", "warnings"]);
    expect(day.unreachable).toBe(false);
    expect(JSON.stringify(day)).not.toContain("HTTP 500");
  });
  it("특보는 이 시군구 발효(warningsHere)와 같은 시도 다른 시군(warningsNearby)으로 나눈다", () => {
    const day = toDayWeather(
      "2026-11-08",
      response({ warnings: { kinds: ["한파"], active: ["한파주의보"], elsewhereInSido: ["강풍주의보(태안)"] } }),
    );
    expect(day.warningsHere).toEqual(["한파주의보"]);
    expect(day.warningsNearby).toEqual(["강풍주의보(태안)"]);
    expect(day.snapshot?.warnings).toEqual(["한파"]);
  });
  it("weather.py decide()의 준비물(tips)을 그대로 받는다", () => {
    expect(toDayWeather("2026-11-08", response({ recommend: { tips: ["우산", "미끄럼 주의"] } })).tips).toEqual([
      "우산",
      "미끄럼 주의",
    ]);
  });
  it("오늘이 아니면 now는 null", () => {
    expect(toDayWeather("2026-11-08", response()).now).toBeNull();
  });
});

describe("worstOf (1박 이상: 가장 나쁜 날 기준)", () => {
  it("항목별로 가장 나쁜 값을 고른다", () => {
    const worst = worstOf([
      { ...EMPTY_WEATHER, pop: 20, precipitation: "none", minTempC: 5, maxTempC: 15 },
      { ...EMPTY_WEATHER, pop: 70, precipitation: "rain", minTempC: -2, maxTempC: 9, warnings: ["강풍"] },
    ]);
    expect(worst).toMatchObject({ pop: 70, precipitation: "rain", minTempC: -2, maxTempC: 15, warnings: ["강풍"] });
  });
  it("예보가 하나도 없으면 null", () => {
    expect(worstOf([])).toBeNull();
  });
});
