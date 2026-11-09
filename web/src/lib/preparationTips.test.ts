import { describe, expect, it } from "vitest";
import { EMPTY_WEATHER } from "./liveWeather";
import { airTips, MASK_TIP, mergeTips, terrainTips, weatherTipSentences } from "./preparationTips";

const sea = { name: "정동진", category: "자연" };
const mountain = { name: "설악산 국립공원", category: "자연" };
const valley = { name: "구룡폭포", category: "자연" };
const indoor = { name: "국립청주박물관", category: "문화" };
const nobody = { withElderly: false, withChildren: false };

describe("terrainTips (관광지 종류별 준비물)", () => {
  const lines = (...args: Parameters<typeof terrainTips>) => mergeTips([], terrainTips(...args));

  it("바다·산·계곡을 종류별로 한 줄씩 묶는다", () => {
    expect(lines([sea, mountain, valley, indoor], nobody)).toEqual([
      "산(설악산 국립공원): 등산화, 물·간식, 바람막이, 해 지기 전 하산, 보조배터리",
      "바다(정동진): 자외선 차단제, 여벌 옷·수건, 물때 확인, 갯바위 미끄럼 주의",
      "계곡(구룡폭포): 미끄럼 방지 신발, 여벌 옷, 불어나는 물 주의",
    ]);
  });
  it("바다·산·계곡이 없으면 안내가 없다", () => {
    expect(terrainTips([indoor], nobody)).toEqual([]);
  });
  it("아이 동반이면 바다·계곡에 구명조끼, 어르신 동반이면 산에 등산 스틱·쉬운 코스가 붙는다", () => {
    const child = lines([sea, valley, mountain], { withElderly: false, withChildren: true });
    expect(child.find((line) => line.startsWith("바다"))).toContain("아이 구명조끼");
    expect(child.find((line) => line.startsWith("계곡"))).toContain("아이 구명조끼");
    expect(child.find((line) => line.startsWith("산"))).not.toContain("구명조끼");
    const elderly = lines([mountain, sea], { withElderly: true, withChildren: false });
    expect(elderly.find((line) => line.startsWith("산"))).toContain("등산 스틱·쉬운 코스(어르신)");
    expect(elderly.some((line) => line.includes("구명조끼"))).toBe(false);
  });
  it("관광지가 여러 곳이면 첫 곳 이름과 나머지 수를 붙인다", () => {
    const names = ["상당산성", "설악산 국립공원", "치악산"].map((name) => ({ name, category: "자연" }));
    expect(lines(names, nobody)).toEqual(["산(상당산성 외 2곳): 등산화, 물·간식, 바람막이, 해 지기 전 하산, 보조배터리"]);
  });
  it("날씨 안내와 겹치는 항목(자외선·미끄럼)만 빠지고 줄은 남는다", () => {
    const weather = weatherTipSentences(["자외선 차단", "미끄럼 주의"]);
    expect(mergeTips([], [...weather, ...terrainTips([sea], nobody)])).toEqual([
      ...weather,
      "바다(정동진): 여벌 옷·수건, 물때 확인",
    ]);
  });
  it("모든 항목이 앞선 안내와 겹치면 그 줄은 나오지 않는다", () => {
    const group = { label: "바다(정동진)", items: ["자외선 차단제"] };
    expect(mergeTips(["자외선 차단제와 휴대용 물을 준비하세요."], [group])).toEqual([
      "자외선 차단제와 휴대용 물을 준비하세요.",
    ]);
  });
  it("물 안내가 있어도 산 줄의 물·간식은 남는다", () => {
    const merged = mergeTips(["걷기 편한 신발과 물을 챙기세요."], terrainTips([mountain], nobody));
    expect(merged[1]).toContain("물·간식");
  });
  it("바다·계곡 줄끼리는 같은 항목(여벌 옷)을 지우지 않는다", () => {
    const merged = lines([sea, valley], nobody);
    expect(merged[0]).toContain("여벌 옷");
    expect(merged[1]).toContain("여벌 옷");
  });
  it("종류별 줄 뒤에 오는 일반 안내는 줄과 겹치면 빠진다", () => {
    const merged = mergeTips([], [...terrainTips([sea], nobody), "자외선 차단제와 모자를 준비하세요."]);
    expect(merged).toHaveLength(1);
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
