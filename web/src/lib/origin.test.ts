import { describe, expect, it, vi } from "vitest";
import { MAX_DISTANCE_KM } from "../config/travelDistance";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import {
  applyDistanceLimit,
  districtCoords,
  districtOrigin,
  formatDistance,
  haversineKm,
  locateCurrentPosition,
  ORIGIN_FALLBACK_MESSAGE,
  type Origin,
} from "./origin";
import type { RecommendationItem } from "./types";

const cheonan = SAMPLE_REGIONS.find((r) => r.name === "천안시")!;
const items: RecommendationItem[] = SAMPLE_REGIONS.map((region) => ({
  region,
  score: 1,
  perPersonLQ: [],
  evidence: [],
  topAttractions: region.attractions.map((attraction) => ({ attraction, matchScore: attraction.popularityScore })),
}));
const atCheonanHall: Origin = { label: "충청남도 천안시", lat: 36.8151, lng: 127.1139, source: "district" };

describe("haversineKm (직선거리)", () => {
  it("같은 곳은 0km", () => {
    expect(haversineKm(atCheonanHall, atCheonanHall)).toBe(0);
  });
  it("서울시청 → 부산시청은 약 325km", () => {
    const km = haversineKm({ lat: 37.5663, lng: 126.9779 }, { lat: 35.1798, lng: 129.075 });
    expect(km).toBeGreaterThan(320);
    expect(km).toBeLessThan(330);
  });
  it("위도 1도는 약 111km", () => {
    expect(haversineKm({ lat: 36, lng: 127 }, { lat: 37, lng: 127 })).toBeCloseTo(111.2, 0);
  });
  it("표시 문구: 10km 미만은 소수 한 자리, 그 이상은 반올림", () => {
    expect(formatDistance(4.26)).toBe("출발지에서 약 4.3km");
    expect(formatDistance(12.4)).toBe("출발지에서 약 12km");
    expect(formatDistance(0.01)).toBe("출발지에서 약 0.1km");
  });
});

describe("applyDistanceLimit (도보·자전거는 가까운 곳만)", () => {
  it("기준은 도보 5km, 자전거 15km (config/travelDistance.ts 한 곳)", () => {
    expect(MAX_DISTANCE_KM).toEqual({ walking: 5, bicycle: 15 });
  });

  it("도보: 출발지에서 5km 넘는 관광지는 빠지고, 남는 곳이 없는 지역은 추천에서 빠진다", () => {
    const result = applyDistanceLimit(items, atCheonanHall, "walking");
    const kept = result.items.flatMap((item) => item.topAttractions.map(({ attraction }) => attraction));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((a) => haversineKm(atCheonanHall, a) <= 5)).toBe(true);
    expect(result.items.every((item) => item.region.code === cheonan.code)).toBe(true);
    expect(result.excluded.every((x) => x.km > 5)).toBe(true);
    expect(result.excluded.length + kept.length).toBe(items.reduce((n, i) => n + i.topAttractions.length, 0));
  });

  it("자전거는 15km까지 남겨 도보보다 많이 남는다", () => {
    const walk = applyDistanceLimit(items, atCheonanHall, "walking").items.flatMap((i) => i.topAttractions);
    const bike = applyDistanceLimit(items, atCheonanHall, "bicycle").items.flatMap((i) => i.topAttractions);
    expect(bike.length).toBeGreaterThan(walk.length);
    expect(bike.every(({ attraction }) => haversineKm(atCheonanHall, attraction) <= 15)).toBe(true);
  });

  it.each(["public-transit", "tour-bus", "car"] as const)("%s는 거르지 않는다(거리 표시만)", (transport) => {
    const result = applyDistanceLimit(items, atCheonanHall, transport);
    expect(result.items).toBe(items);
    expect(result.excluded).toEqual([]);
    expect(result.limitKm).toBeNull();
  });

  it("출발지가 없으면: 도보·자전거는 거르지 않고 '출발지를 정해야' 안내 대상, 다른 교통편은 그대로", () => {
    expect(applyDistanceLimit(items, null, "walking")).toMatchObject({ items, excluded: [], needsOrigin: true });
    expect(applyDistanceLimit(items, null, "bicycle").needsOrigin).toBe(true);
    expect(applyDistanceLimit(items, null, "car").needsOrigin).toBe(false);
  });

  it("출발지 근처에 아무것도 없으면 빈 목록(화면은 '출발지 근처에 추천할 곳이 없어요')", () => {
    const jeju: Origin = { label: "제주특별자치도 제주시", lat: 33.4996, lng: 126.5312, source: "district" };
    const result = applyDistanceLimit(items, jeju, "bicycle");
    expect(result.items).toEqual([]);
    expect(result.excluded.length).toBeGreaterThan(0);
  });
});

describe("출발지 좌표", () => {
  it("시·군·구는 저장소의 시군구 좌표(data/sigungu.ts)를 쓰고 주소 검색을 부르지 않는다", async () => {
    const geocode = vi.fn();
    expect(districtCoords("충청북도", "청주시")).toEqual({ lat: 36.6424, lng: 127.489 });
    const origin = await districtOrigin("충청북도", "청주시", geocode);
    expect(origin).toEqual({ label: "충청북도 청주시", lat: 36.6424, lng: 127.489, source: "district" });
    expect(geocode).not.toHaveBeenCalled();
  });

  it("좌표표에 없으면 주소 검색(카카오 Geocoder 자리)으로 구한다", async () => {
    const geocode = vi.fn().mockResolvedValue({ lat: 37.1, lng: 127.1 });
    const origin = await districtOrigin("경기도", "없는시", geocode);
    expect(geocode).toHaveBeenCalledWith("경기도 없는시");
    expect(origin).toMatchObject({ lat: 37.1, lng: 127.1, source: "district" });
    expect(await districtOrigin("경기도", "없는시", vi.fn().mockResolvedValue(null))).toBeNull();
  });

  it("현재 위치: 성공하면 브라우저 좌표를 쓴다", async () => {
    const geolocation = {
      getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 36.64, longitude: 127.49 } } as GeolocationPosition),
    };
    expect(await locateCurrentPosition(geolocation)).toEqual({
      ok: true,
      origin: { label: "현재 위치", lat: 36.64, lng: 127.49, source: "gps" },
    });
  });

  it("현재 위치: 권한 거부·실패·위치 기능 없음이면 '출발지를 직접 골라 주세요'", async () => {
    const denied = {
      getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback | null) =>
        fail?.({ code: 1, message: "User denied Geolocation" } as GeolocationPositionError),
    };
    expect(await locateCurrentPosition(denied)).toEqual({ ok: false, message: ORIGIN_FALLBACK_MESSAGE });
    expect(await locateCurrentPosition(undefined)).toEqual({ ok: false, message: "출발지를 직접 골라 주세요" });
  });
});
