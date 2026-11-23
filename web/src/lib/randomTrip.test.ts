import { describe, expect, it } from "vitest";
import { projectToKoreaMap } from "./randomTrip";

// korea-map.svg(800x1200)에서 각 도시가 있어야 할 자리(px)
const CITIES = [
  { name: "서울", lat: 37.5665, lng: 126.978, px: [253, 243] },
  { name: "속초", lat: 38.207, lng: 128.5918, px: [534, 107] },
  { name: "부산", lat: 35.1796, lng: 129.0756, px: [618, 750] },
  { name: "목포", lat: 34.8118, lng: 126.3922, px: [151, 828] },
  { name: "제주", lat: 33.4996, lng: 126.5312, px: [176, 1107] },
] as const;

describe("projectToKoreaMap", () => {
  it.each(CITIES)("$name이 지도 위 제자리에 온다", ({ lat, lng, px }) => {
    const { x, y } = projectToKoreaMap(lat, lng);
    // 2px 안쪽(0.25% / 0.17%)이면 같은 자리로 본다
    expect(Math.abs(x - px[0] / 8)).toBeLessThan(0.25);
    expect(Math.abs(y - px[1] / 12)).toBeLessThan(0.17);
  });

  it("기준점(126.16°E, 38.61°N)은 (111px, 21px)", () => {
    const { x, y } = projectToKoreaMap(38.61, 126.16);
    expect(x).toBeCloseTo(111 / 8, 6);
    expect(y).toBeCloseTo(21 / 12, 6);
  });

  it("방향이 맞다: 동쪽일수록 오른쪽, 남쪽일수록 아래", () => {
    const seoul = projectToKoreaMap(37.5665, 126.978);
    const sokcho = projectToKoreaMap(38.207, 128.5918);
    const jeju = projectToKoreaMap(33.4996, 126.5312);
    expect(sokcho.x).toBeGreaterThan(seoul.x);
    expect(sokcho.y).toBeLessThan(seoul.y);
    expect(jeju.y).toBeGreaterThan(seoul.y);
    for (const c of CITIES) {
      const p = projectToKoreaMap(c.lat, c.lng);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(100);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(100);
    }
  });
});
