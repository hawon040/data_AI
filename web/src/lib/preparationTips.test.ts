import { describe, expect, it } from "vitest";
import { EMPTY_WEATHER } from "./liveWeather";
import { airTips, MASK_TIP, mergeTips, terrainTips, weatherTipSentences } from "./preparationTips";

const sea = { name: "정동진", category: "자연" };
const mountain = { name: "설악산 국립공원", category: "자연" };
const valley = { name: "구룡폭포", category: "자연" };
const indoor = { name: "국립청주박물관", category: "문화" };
const nobody = { withElderly: false, withChildren: false };

describe("terrainTips (관광지 종류별 준비물)", () => {
  it("바다·산·계곡 관광지가 추천되면 어느 관광지 때문인지 붙여 안내한다", () => {
    const tips = terrainTips([sea, mountain, valley, indoor], nobody);
    expect(tips).toContain("정동진(바다): 물때를 확인하세요.");
    expect(tips).toContain("설악산 국립공원(산): 해 지기 전에 하산하세요.");
    expect(tips).toContain("구룡폭포(계곡): 비 온 뒤에는 불어나는 물에 주의하세요.");
    expect(tips.some((tip) => tip.startsWith("국립청주박물관"))).toBe(false);
  });
  it("바다·산·계곡이 없으면 안내가 없다", () => {
    expect(terrainTips([indoor], nobody)).toEqual([]);
  });
  it("아이 동반이면 바다·계곡에 구명조끼, 어르신 동반이면 산에 등산 스틱·쉬운 코스가 붙는다", () => {
    const child = terrainTips([sea, valley, mountain], { withElderly: false, withChildren: true });
    expect(child).toContain("정동진(바다): 아이는 물가에서 구명조끼를 입히세요.");
    expect(child).toContain("구룡폭포(계곡): 아이는 물가에서 구명조끼를 입히세요.");
    expect(child.some((tip) => tip.startsWith("설악산 국립공원(산)") && tip.includes("구명조끼"))).toBe(false);
    const elderly = terrainTips([mountain, sea], { withElderly: true, withChildren: false });
    expect(elderly).toContain("설악산 국립공원(산): 어르신과 함께라면 등산 스틱을 챙기고 쉬운 코스를 고르세요.");
    expect(elderly.some((tip) => tip.includes("구명조끼"))).toBe(false);
  });
  it("관광지가 셋 이상이면 두 곳 이름과 나머지 수를 붙인다", () => {
    const names = ["경포해변", "안목해변 카페거리", "정동진", "주문진항"].map((name) => ({ name, category: "자연" }));
    expect(terrainTips(names, nobody)[0]).toBe("경포해변·안목해변 카페거리 외 2곳(바다): 자외선 차단제를 챙기세요.");
  });
  it("날씨 안내와 겹치는 주제(자외선·미끄럼)는 날씨 안내 하나만 남는다", () => {
    const weather = weatherTipSentences(["자외선 차단", "미끄럼 주의"]);
    const merged = mergeTips([], [...weather, ...terrainTips([sea], nobody)]);
    expect(merged.filter((tip) => tip.includes("자외선"))).toEqual(["자외선 차단제와 모자를 준비하세요."]);
    expect(merged.filter((tip) => tip.includes("미끄럼"))).toEqual(["비·눈길 미끄럼에 주의하세요."]);
    expect(merged).toContain("정동진(바다): 물때를 확인하세요.");
  });
});

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
