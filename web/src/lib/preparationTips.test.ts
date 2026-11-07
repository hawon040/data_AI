import { describe, expect, it } from "vitest";
import { EMPTY_WEATHER } from "./liveWeather";
import { airTips, MASK_TIP, mergeTips } from "./preparationTips";

describe("airTips (에어코리아 → 마스크 안내)", () => {
  it("PM10·PM2.5 중 하나라도 나쁨(3) 이상이면 마스크 안내", () => {
    expect(airTips({ ...EMPTY_WEATHER, pm10Grade: 2, pm25Grade: 3 })).toEqual([MASK_TIP]);
  });
  it("보통 이하이거나 정보가 없으면 안내 없음", () => {
    expect(airTips({ ...EMPTY_WEATHER, pm10Grade: 2, pm25Grade: 1 })).toEqual([]);
    expect(airTips(null)).toEqual([]);
  });
});

describe("mergeTips", () => {
  it("같은 문구는 하나만 남긴다", () => {
    expect(mergeTips(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });
});
