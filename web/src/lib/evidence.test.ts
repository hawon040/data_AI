import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { shortEvidence } from "./evidence";
import type { RecommendationItem } from "./types";

const region = SAMPLE_REGIONS[0];
const item = (lqs: number[]): RecommendationItem => ({
  region,
  score: 1,
  perPersonLQ: lqs.map((lq) => ({ person: { ageGroup: "20s" }, lq })),
  evidence: [],
  topAttractions: [],
});

describe("shortEvidence", () => {
  it("또래 방문 배수 + 날씨 요약", () => {
    expect(shortEvidence(item([1.4]), "강수확률 70% → 실내")).toBe("또래 방문 1.4배 · 강수확률 70% → 실내");
  });
  it("일행이면 가장 낮은 배수를 쓴다", () => {
    expect(shortEvidence(item([1.8, 0.9, 1.2]), null)).toBe("또래 방문 0.9배");
  });
  it("연령 미입력이면 방문자 수", () => {
    expect(shortEvidence(item([]), null)).toMatch(/^방문 [\d.,]+(만 )?명$/);
  });
});
