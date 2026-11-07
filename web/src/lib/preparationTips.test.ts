import { describe, expect, it } from "vitest";
import { EMPTY_WEATHER } from "./liveWeather";
import { airTips, MASK_TIP, mergeTips, weatherTipSentences } from "./preparationTips";

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
  it("weather.py 준비물이 기존 문구와 같은 주제면 기존 문구만 남긴다", () => {
    const winter = "따뜻한 겉옷과 미끄럼 방지 신발을 준비하세요.";
    const merged = mergeTips([winter], weatherTipSentences(["우산", "미끄럼 주의", "방한용품"]));
    expect(merged).toEqual([winter, "비 소식이 있어요. 우산이나 우비를 챙기세요."]);
  });
  it("decide()의 '마스크'와 미세먼지 마스크 안내는 하나만 남긴다", () => {
    expect(mergeTips([], [...weatherTipSentences(["마스크"]), MASK_TIP])).toEqual([MASK_TIP]);
  });
  it("여름 기본 문구(자외선·휴대용 물)가 있으면 더운 날 물·자외선 안내는 겹친다", () => {
    const summer = "자외선 차단제와 휴대용 물을 준비하세요.";
    expect(mergeTips([summer], weatherTipSentences(["물", "자외선 차단", "한낮 야외 피하기"]))).toEqual([
      summer,
      "한낮에는 야외 활동을 피하세요.",
    ]);
  });
});
