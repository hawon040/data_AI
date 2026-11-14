import { describe, expect, it } from "vitest";
import { LONG_TRIP_HOURS, MAX_TRAVEL_HOURS_OPTIONS, TRAVEL_SPEED_KMH } from "../config/travelTime";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { buildChecklist } from "./checklist";
import { haversineKm, type Origin } from "./origin";
import { getRecommendations } from "./recommend";
import {
  applyTravelTimeLimit,
  FAR_DAY_TRIP_BADGE,
  formatDuration,
  isFarForDayTrip,
  LONG_TRIP_PARTY_TIP,
  LONG_TRIP_REST_TIP,
  restTips,
  TRAVEL_HINT,
  TRAVEL_HINT_BUTTON,
  travelHintState,
  travelHours,
  travelLabel,
} from "./travelTime";
import { DEFAULT_TRIP_PREFERENCES, filterRecommendations } from "./tripPreferences";

const cheonan: Origin = { label: "충청남도 천안시", lat: 36.8151, lng: 127.1139, source: "district" };
const nobody = { withElderly: false, withChildren: false };

describe("예상 이동 시간 환산 (직선거리 기준 어림값)", () => {
  it("환산 속도는 한 곳에: 자가용·관광버스 60, 대중교통 45, 자전거 15, 도보 4 km/h", () => {
    expect(TRAVEL_SPEED_KMH).toEqual({ car: 60, "tour-bus": 60, "public-transit": 45, bicycle: 15, walking: 4 });
    expect(LONG_TRIP_HOURS).toBe(2);
  });
  it("시간 = 직선거리 ÷ 속도", () => {
    expect(travelHours(180, "car")).toBe(3);
    expect(travelHours(90, "public-transit")).toBe(2);
    expect(travelHours(15, "bicycle")).toBe(1);
    expect(travelHours(2, "walking")).toBe(0.5);
  });
  it("표시: 10분 단위, 1시간 이상은 시간·분", () => {
    expect(formatDuration(0.05)).toBe("약 10분");
    expect(formatDuration(0.5)).toBe("약 30분");
    expect(formatDuration(1)).toBe("약 1시간");
    expect(formatDuration(187 / 60)).toBe("약 3시간 10분");
    expect(travelLabel(187, "car")).toBe("약 187km · 자가용 약 3시간 10분");
    expect(travelLabel(2.4, "public-transit")).toBe("약 2.4km · 대중교통 약 10분");
  });
});

describe("최대 이동 시간 (기본 '상관없음')", () => {
  const items = () => {
    const people = [{ ageGroup: "20s" as const }];
    return filterRecommendations(getRecommendations(people, SAMPLE_REGIONS, SAMPLE_REGIONS.length), people, { ...DEFAULT_TRIP_PREFERENCES, visitDate: "2026-11-14" });
  };
  it("기본값은 '상관없음'(null)이고 거르지 않는다", () => {
    expect(DEFAULT_TRIP_PREFERENCES.maxTravelHours).toBeNull();
    expect(MAX_TRAVEL_HOURS_OPTIONS.map((o) => o.label)).toEqual(["상관없음", "1시간", "2시간", "3시간"]);
    const all = items();
    expect(applyTravelTimeLimit(all, cheonan, "car", null)).toEqual({ items: all, excluded: [] });
  });
  it("출발지가 없으면 거르지 않는다", () => {
    const all = items();
    expect(applyTravelTimeLimit(all, null, "car", 1).items).toBe(all);
  });
  it("1시간(자가용 60km)을 고르면 그보다 먼 관광지는 빠지고 '이동 시간 때문에 제외된 곳'으로 모인다", () => {
    const { items: kept, excluded } = applyTravelTimeLimit(items(), cheonan, "car", 1);
    const keptAttractions = kept.flatMap((i) => i.topAttractions.map(({ attraction }) => attraction));
    expect(keptAttractions.length).toBeGreaterThan(0);
    expect(keptAttractions.every((a) => haversineKm(cheonan, a) <= 60)).toBe(true);
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every((x) => x.hours > 1)).toBe(true);
    expect(kept.some((i) => i.region.name === "강릉시")).toBe(false);
  });
});

describe("60대 이상·아이 동반 안내", () => {
  it("60대 이상이나 아이 동반일 때만 안내가 보인다", () => {
    expect(travelHintState({ withElderly: false, withChildren: false, maxTravelHours: null, hasOrigin: true }).show).toBe(false);
    expect(travelHintState({ withElderly: true, withChildren: false, maxTravelHours: null, hasOrigin: true }).show).toBe(true);
    expect(travelHintState({ withElderly: false, withChildren: true, maxTravelHours: null, hasOrigin: true }).show).toBe(true);
    expect(TRAVEL_HINT).toBe("어르신·아이와 함께라면 편도 2시간 이내를 권해요");
    expect(TRAVEL_HINT_BUTTON).toBe("2시간 이내로 보기");
  });
  it("버튼은 '상관없음'이고 출발지가 있을 때만. 이미 다른 값을 골랐으면 안내만", () => {
    expect(travelHintState({ withElderly: true, withChildren: false, maxTravelHours: null, hasOrigin: true }).showButton).toBe(true);
    expect(travelHintState({ withElderly: true, withChildren: false, maxTravelHours: 3, hasOrigin: true })).toEqual({ show: true, showButton: false });
    expect(travelHintState({ withElderly: true, withChildren: false, maxTravelHours: null, hasOrigin: false }).showButton).toBe(false);
  });
  it("안내는 값을 자동으로 바꾸지 않는다(버튼을 누르기 전에는 '상관없음' 그대로)", () => {
    const prefs = { ...DEFAULT_TRIP_PREFERENCES };
    travelHintState({ withElderly: true, withChildren: true, maxTravelHours: prefs.maxTravelHours, hasOrigin: true });
    expect(prefs.maxTravelHours).toBeNull();
  });
});

describe("당일치기로는 먼 곳·휴식 안내", () => {
  it("당일치기인데 편도 2시간을 넘으면 표시, 1박 이상이면 표시하지 않는다", () => {
    expect(isFarForDayTrip(2.5, "day")).toBe(true);
    expect(isFarForDayTrip(2, "day")).toBe(false);
    expect(isFarForDayTrip(3, "overnight")).toBe(false);
    expect(isFarForDayTrip(null, "day")).toBe(false);
    expect(FAR_DAY_TRIP_BADGE).toBe("당일치기로는 먼 곳");
  });
  it("편도 2시간을 넘는 곳을 고르면 체크리스트에 휴식 안내, 어르신·아이 동반이면 한 줄 더", () => {
    expect(restTips(1.5, nobody)).toEqual([]);
    expect(restTips(3, nobody)).toEqual([LONG_TRIP_REST_TIP]);
    expect(restTips(3, { withElderly: true, withChildren: false })).toEqual([LONG_TRIP_REST_TIP, LONG_TRIP_PARTY_TIP]);

    const gangneung = SAMPLE_REGIONS.find((r) => r.name === "강릉시")!;
    const base = { preferences: { ...DEFAULT_TRIP_PREFERENCES, visitDate: "2026-11-14" }, commonWeather: null };
    const far = buildChecklist({ ...base, party: { withElderly: false, withChildren: true }, travelHours: 3.1, focus: { kind: "region", region: gangneung, attractions: gangneung.attractions.slice(0, 2) } });
    expect(far.sections[1].lines).toEqual(expect.arrayContaining(["2시간마다 15분씩 쉬어 가세요.", "어르신·아이와 함께라면 휴게소에서 자주 쉬어 가세요."]));
    const near = buildChecklist({ ...base, party: nobody, travelHours: 0.5, focus: { kind: "region", region: gangneung, attractions: [] } });
    expect(near.sections.flatMap((s) => s.lines).some((l) => l.includes("쉬어 가세요"))).toBe(false);
    const common = buildChecklist({ ...base, party: nobody, travelHours: 5, focus: { kind: "common" } });
    expect(common.sections.flatMap((s) => s.lines).some((l) => l.includes("쉬어 가세요"))).toBe(false);
  });
});
