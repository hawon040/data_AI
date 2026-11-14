import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { buildChecklist, CHECKLIST_HINT, isRainyDay, type ChecklistInput } from "./checklist";
import { EMPTY_WEATHER } from "./liveWeather";
import { DEFAULT_TRIP_PREFERENCES, TRANSPORT_OPTIONS, type TripPreferences } from "./tripPreferences";
import type { WeatherSnapshot } from "./weatherRules";

const region = (name: string) => SAMPLE_REGIONS.find((r) => r.name === name)!;
const gangneung = region("강릉시");
const danyang = region("단양군");
const cafeStreet = gangneung.attractions.find((a) => a.name === "안목해변 카페거리")!;
const gyeongpo = gangneung.attractions.find((a) => a.name === "경포해변")!;
const nobody = { withElderly: false, withChildren: false };
const autumn: TripPreferences = { ...DEFAULT_TRIP_PREFERENCES, visitDate: "2026-11-14" };
const summer: TripPreferences = { ...DEFAULT_TRIP_PREFERENCES, visitDate: "2026-07-15" };
const clear: WeatherSnapshot = { ...EMPTY_WEATHER, pop: 10, precipitation: "none", minTempC: 7, maxTempC: 15, pm10Grade: 2, pm25Grade: 1 };
const rainy: WeatherSnapshot = { ...clear, pop: 80, precipitation: "rain" };

const input = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  preferences: autumn,
  party: nobody,
  commonWeather: clear,
  focus: { kind: "common" },
  ...over,
});
const regionFocus = (r = gangneung) => ({ kind: "region" as const, region: r, attractions: r.attractions.slice(0, 4) });
const allLines = (c: ReturnType<typeof buildChecklist>) => c.sections.flatMap((s) => s.lines);

describe("1단계 공통 (추천받기 직후)", () => {
  it("일정·교통편·계절 준비물과 날씨 한 줄 요약이 바로 나오고 안내 문구가 보인다", () => {
    const c = buildChecklist(input());
    expect(c.scopeLabel).toBeNull();
    expect(c.hint).toBe("지역이나 관광지를 누르면 그곳에 맞는 준비물이 더 나와요");
    expect(c.hint).toBe(CHECKLIST_HINT);
    expect(c.sections.map((s) => s.title)).toEqual(["공통"]);
    const lines = c.sections[0].lines;
    expect(lines).toContain("일교차에 대비해 가벼운 겉옷을 챙기세요."); // 계절(11/14)
    expect(lines).toContain("출발 전 대중교통·관광버스 시간표와 막차 시간을 확인하세요."); // 교통편
    expect(lines).toContain("당일 일정에 맞춰 왕복 이동 시간과 마지막 입장 시간을 확인하세요."); // 일정
    expect(lines).toContain("날씨(추천 지역 중 가장 나쁜 값): 강수확률 10% · 7~15℃ · 미세먼지 보통");
  });

  it("1박 이상이면 숙소 안내, 아이·어르신 동반이면 동행자 안내가 붙는다", () => {
    const lines = buildChecklist(input({
      preferences: { ...autumn, duration: "overnight" },
      party: { withElderly: true, withChildren: true },
    })).sections[0].lines;
    expect(lines).toContain("숙소 위치와 체크인·체크아웃 시간을 함께 확인하세요.");
    expect(lines).toContain("아이 상비약과 갈아입을 옷, 간식을 챙기세요.");
    expect(lines).toContain("어르신이 드시는 약과 중간에 쉬어 갈 곳을 미리 확인하세요.");
  });

  it.each(TRANSPORT_OPTIONS.map((o) => [o.label, o.value] as const))("교통편 %s: 공통 체크리스트가 나오고 교통편 안내가 들어간다", (_label, transport) => {
    const lines = buildChecklist(input({ preferences: { ...autumn, transport } })).sections[0].lines;
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some((line) => /대중교통|관광버스|주차|도보|자전거/.test(line))).toBe(true);
  });
});

describe("2단계 지역 (추천 카드를 누름)", () => {
  it("공통 줄은 그대로 두고, 지역 날씨·미세먼지와 그 카드 관광지의 지형별 준비물을 아래에 더한다", () => {
    const common = buildChecklist(input());
    const c = buildChecklist(input({ focus: regionFocus(), regionWeather: { ...clear, pm10Grade: 3 } }));
    expect(c.scopeLabel).toBe("강릉시 기준");
    expect(c.hint).toBeNull();
    expect(c.sections.map((s) => s.title)).toEqual(["공통", "강릉시"]);
    expect(c.sections[0].lines).toEqual(common.sections[0].lines);
    const regionLines = c.sections[1].lines;
    expect(regionLines[0]).toBe("강릉시 날씨(일정 중 가장 나쁜 값): 강수확률 10% · 7~15℃ · 미세먼지 나쁨");
    expect(regionLines).toContain("미세먼지가 나쁨 이상이에요. 마스크를 준비하세요.");
    expect(regionLines.some((line) => line.startsWith("바다("))).toBe(true);
  });

  it("다른 지역 카드를 누르면 지역 줄이 그 지역 것으로 바뀐다", () => {
    const g = buildChecklist(input({ focus: regionFocus(gangneung), regionWeather: clear }));
    const d = buildChecklist(input({ focus: regionFocus(danyang), regionWeather: rainy }));
    expect(d.scopeLabel).toBe("단양군 기준");
    expect(d.sections[1].title).toBe("단양군");
    expect(d.sections[1].lines).not.toEqual(g.sections[1].lines);
    expect(d.sections[1].lines[0]).toMatch(/^단양군 날씨/);
    expect(d.sections[1].lines.some((line) => line.startsWith("산("))).toBe(true);
    expect(d.sections[1].lines.some((line) => line.startsWith("바다("))).toBe(false);
  });
});

describe("3단계 관광지 (관광지 버튼을 누름)", () => {
  it("공통 → 지역 → 관광지 순으로 줄이 더해지고 제목 옆이 관광지 기준이 된다", () => {
    const regionOnly = buildChecklist(input({ focus: regionFocus(), regionWeather: clear }));
    const c = buildChecklist(input({
      party: { withElderly: true, withChildren: false },
      focus: { kind: "attraction", region: gangneung, attractions: gangneung.attractions.slice(0, 4), attraction: gyeongpo },
      regionWeather: clear,
      accessTip: "경포해변: 장애인 화장실·주차 정보 있음 (한국관광공사 무장애 여행정보)",
    }));
    expect(c.scopeLabel).toBe("경포해변 기준");
    expect(c.sections.map((s) => s.title)).toEqual(["공통", "강릉시", "경포해변"]);
    expect(c.sections[1].lines).toEqual(regionOnly.sections[1].lines);
    expect(c.sections[2].lines).toEqual([
      "경포해변: 바다 · 야외 관광지예요.",
      "걷기 편한 신발과 물을 챙기세요.",
      "경포해변: 장애인 화장실·주차 정보 있음 (한국관광공사 무장애 여행정보)",
    ]);
    expect(allLines(c).length).toBeGreaterThan(allLines(regionOnly).length);
  });

  it("지역에 속하지 않은 관광지(계절 사진 등)는 그 관광지의 지형별 준비물을 관광지 줄에 넣는다", () => {
    const c = buildChecklist(input({ focus: { kind: "attraction", region: null, attractions: [], attraction: gyeongpo } }));
    expect(c.sections.map((s) => s.title)).toEqual(["공통", "경포해변"]);
    expect(c.sections[1].lines.some((line) => line.startsWith("바다(경포해변)"))).toBe(true);
  });
});

describe("비 오는 날·지형 분류", () => {
  it("비가 오거나 강수확률이 높으면 자외선 차단제를 뺀다(여름 계절 안내·바다 준비물 모두)", () => {
    const sunny = buildChecklist(input({ preferences: summer, commonWeather: clear, focus: regionFocus(), regionWeather: clear }));
    expect(allLines(sunny).some((line) => line.includes("자외선"))).toBe(true);
    const wet = buildChecklist(input({ preferences: summer, commonWeather: rainy, focus: regionFocus(), regionWeather: rainy }));
    expect(wet.rainy).toBe(true);
    expect(allLines(wet).some((line) => line.includes("자외선"))).toBe(false);
    expect(allLines(wet)).toContain("휴대용 물을 준비하세요.");
  });

  it("강수확률 기준: 일반 60%, 어르신·아이 동반 40% (실내 위주 추천과 같은 기준)", () => {
    const pop = (value: number) => ({ ...clear, pop: value });
    expect(isRainyDay(pop(50), nobody)).toBe(false);
    expect(isRainyDay(pop(60), nobody)).toBe(true);
    expect(isRainyDay(pop(40), { withElderly: true, withChildren: false })).toBe(true);
    expect(isRainyDay(null, nobody)).toBe(false);
  });

  it("공통 단계에서도 추천 지역 중 가장 나쁜 날씨가 비면 자외선 차단제를 뺀다", () => {
    const c = buildChecklist(input({ preferences: summer, commonWeather: rainy }));
    expect(allLines(c).some((line) => line.includes("자외선"))).toBe(false);
  });

  it("실내 관광지(안목해변 카페거리)에는 지형 줄을 붙이지 않는다 — 지역·관광지 단계 모두", () => {
    const regionLines = (attractions: typeof gangneung.attractions) =>
      allLines(buildChecklist(input({ focus: { kind: "region", region: gangneung, attractions }, regionWeather: clear })));
    const cafe = regionLines([cafeStreet]);
    expect(cafe.some((line) => line.startsWith("바다("))).toBe(false);
    expect(cafe.some((line) => /물때|갯바위|여벌 옷/.test(line))).toBe(false);
    expect(regionLines([gyeongpo]).some((line) => line.includes("물때 확인"))).toBe(true);
    // 실내·야외가 섞이면 야외 관광지만 센다
    expect(regionLines([cafeStreet, gyeongpo]).find((line) => line.startsWith("바다("))).toMatch(/^바다\(경포해변\)/);

    const attractionStep = buildChecklist(input({
      focus: { kind: "attraction", region: gangneung, attractions: [cafeStreet], attraction: cafeStreet },
      regionWeather: clear,
    }));
    expect(attractionStep.sections.map((s) => s.title)).toEqual(["공통", "강릉시", "안목해변 카페거리"]);
    expect(attractionStep.sections[2].lines).toEqual(["안목해변 카페거리: 실내 관광지예요."]);
    const noRegion = buildChecklist(input({ focus: { kind: "attraction", region: null, attractions: [], attraction: cafeStreet } }));
    expect(allLines(noRegion).some((line) => /바다\(|물때|여벌 옷/.test(line))).toBe(false);
  });
});

describe("관광지 버튼을 바로 누른 경우(지역 카드를 먼저 누르지 않음)", () => {
  it("체크리스트에 그 관광지의 지역 줄과 관광지 줄이 함께 나온다", () => {
    const c = buildChecklist(input({
      focus: { kind: "attraction", region: gangneung, attractions: gangneung.attractions.slice(0, 4), attraction: gyeongpo },
      regionWeather: clear,
    }));
    expect(c.sections.map((s) => s.title)).toEqual(["공통", "강릉시", "경포해변"]);
    expect(c.scopeLabel).toBe("경포해변 기준");
  });
});
