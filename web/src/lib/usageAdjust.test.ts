import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { getExploreRecommendations, getRecommendations } from "./recommend";
import { attractionMatchScore } from "./attractionAffinity";
import { AGE_GROUPS, type GroupKey, type Person } from "./types";
import {
  EMPTY_USAGE,
  MIN_RATINGS_TO_SHOW,
  adjustedAffinity,
  blendedNationalShares,
  buildPriors,
  ratingDisplay,
  regionLQ,
  type UsageSummary,
} from "./usageAdjust";

const GROUPS = (["M", "F"] as const).flatMap((g) => AGE_GROUPS.map((a) => `${g}_${a}` as GroupKey));
const people: Person[] = [{ gender: "F", ageGroup: "60plus" }];

function usageWith(partial: Partial<UsageSummary>): UsageSummary {
  return { ...EMPTY_USAGE, available: true, ...partial };
}

describe("regionLQ", () => {
  const priors = buildPriors(SAMPLE_REGIONS);
  const region = SAMPLE_REGIONS[0];

  it("기록이 0건이면 기본값(샘플 방문자 비중)으로 계산한 값과 같고 반영 비율은 0이다", () => {
    const shares = blendedNationalShares({}, priors, GROUPS);
    const result = regionLQ({}, shares, region.code, "F_60plus", priors[region.code]);
    expect(result.lq).toBeCloseTo(priors[region.code].shares.F_60plus / shares.F_60plus, 10);
    expect(result.records).toBe(0);
    expect(result.reliability).toBe(0);
  });

  it("기록이 쌓이면 그 집단의 특화지수가 올라가고 반영 비율이 커진다", () => {
    // 모든 지역·집단에 같은 양의 기록이 있다고 두어 전국 비중이 한쪽으로 쏠리지 않게 하고, 이 지역의 F_60plus만 더 늘린다.
    const baseline = () =>
      Object.fromEntries(
        SAMPLE_REGIONS.map((r) => [r.code, Object.fromEntries(GROUPS.map((g) => [g, 100]))]),
      ) as UsageSummary["regionGroupCounts"];
    const withExtra = (extra: number) => {
      const counts = baseline();
      counts[region.code] = { ...counts[region.code], F_60plus: 100 + extra };
      return counts;
    };
    const lq = (counts: UsageSummary["regionGroupCounts"]) =>
      regionLQ(counts, blendedNationalShares(counts, priors, GROUPS), region.code, "F_60plus", priors[region.code]);
    expect(lq(withExtra(5000)).lq).toBeGreaterThan(lq(withExtra(200)).lq);
    expect(lq(withExtra(200)).lq).toBeGreaterThan(lq(withExtra(0)).lq);
    expect(lq(withExtra(5000)).reliability).toBeGreaterThan(lq(withExtra(0)).reliability);
  });

  it("기록이 한 지역에만 몰려 있으면 그 지역이 특별해 보이지 않는다(전국 비중도 같이 쏠리기 때문)", () => {
    const counts = { [region.code]: { F_60plus: 5000 } };
    const lq = regionLQ(counts, blendedNationalShares(counts, priors, GROUPS), region.code, "F_60plus", priors[region.code]);
    expect(lq.lq).toBeLessThan(1.5);
  });

  it("큰 지역일수록 기본값을 더 세게 믿는다(같은 기록 수라면 덜 움직인다)", () => {
    const sorted = [...SAMPLE_REGIONS].sort((a, b) => a.totalVisitors - b.totalVisitors);
    const small = sorted[0];
    const big = sorted[sorted.length - 1];
    expect(priors[big.code].strength).toBeGreaterThan(priors[small.code].strength);
  });
});

describe("adjustedAffinity", () => {
  it("평가가 없으면 기본 가중치 그대로다", () => {
    expect(adjustedAffinity(0.7, undefined, undefined)).toBe(0.7);
    expect(adjustedAffinity(1.3, undefined, { n: 100, mean: 4 })).toBe(1.3);
  });

  it("설계 예시: 평가 12건 평균 4.4점, 60대 전체 평균 3.8점, 기본 0.70 → 약 0.95", () => {
    expect(adjustedAffinity(0.7, { n: 12, mean: 4.4 }, { n: 500, mean: 3.8 })).toBeCloseTo(0.95, 2);
  });

  it("평가가 많을수록 실측 선호도에 가까워지고 0.6~1.4로 제한된다", () => {
    const age = { n: 500, mean: 3.8 };
    const values = [0, 5, 10, 50, 500].map((n) => adjustedAffinity(0.7, { n, mean: 4.4 }, age));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(adjustedAffinity(1, { n: 1000, mean: 5 }, { n: 500, mean: 1 })).toBe(1.4);
    expect(adjustedAffinity(1, { n: 1000, mean: 1 }, { n: 500, mean: 5 })).toBe(0.6);
  });
});

describe("추천에 반영", () => {
  it("사용자 기록이 없으면(서버 없음 포함) 지금 추천과 같은 지역이 1위다", () => {
    const base = getRecommendations(people, SAMPLE_REGIONS, 5);
    const withEmpty = getRecommendations(people, SAMPLE_REGIONS, 5, EMPTY_USAGE);
    const withZero = getRecommendations(people, SAMPLE_REGIONS, 5, usageWith({}));
    expect(withEmpty.map((i) => i.region.code)).toEqual(base.map((i) => i.region.code));
    expect(withZero[0].region.code).toBe(base[0].region.code);
    expect(withZero.every((i) => !i.evidence.some((line) => line.includes("사용자 기록")))).toBe(true);
  });

  it("한 지역에 같은 집단의 기록이 많이 쌓이면 그 지역의 순위가 오르고 근거에 기록 수가 나온다", () => {
    const base = getRecommendations(people, SAMPLE_REGIONS, SAMPLE_REGIONS.length);
    const target = base[base.length - 1].region; // 지금 꼴찌인 지역
    const usage = usageWith({ total: 20000, regionGroupCounts: { [target.code]: { F_60plus: 20000 } } });
    const after = getRecommendations(people, SAMPLE_REGIONS, SAMPLE_REGIONS.length, usage);
    const rank = (list: typeof base) => list.findIndex((i) => i.region.code === target.code);
    expect(rank(after)).toBeLessThan(rank(base));
    expect(after[rank(after)].evidence.at(-1)).toMatch(/사용자 기록 20000건 반영/);
  });

  it("평가가 많이 쌓인 관광지는 점수가 오르고, 평가가 없는 관광지는 그대로다", () => {
    const attraction = SAMPLE_REGIONS[0].attractions[0];
    const other = SAMPLE_REGIONS[0].attractions[1];
    const usage = usageWith({
      ageRatings: { "60plus": { n: 500, mean: 3.0, count: 500 } },
      attractionRatings: [{ attraction: attraction.name, ageGroup: "60plus", n: 200, mean: 5, count: 200 }],
    });
    const score = (a: typeof attraction, u?: UsageSummary) =>
      attractionMatchScore(a.popularityScore, a.tags, people, u, a.name);
    expect(score(attraction, usage)).toBeGreaterThan(score(attraction));
    expect(score(other, usage)).toBe(score(other));
  });
});

describe("ratingDisplay", () => {
  const usage = usageWith({
    attractionRatings: [
      { attraction: "가", ageGroup: "60plus", n: 4.2, mean: 4.44, count: MIN_RATINGS_TO_SHOW - 1 },
      { attraction: "나", ageGroup: "60plus", n: 11.9, mean: 4.46, count: MIN_RATINGS_TO_SHOW },
    ],
  });

  it("평가가 5건 미만이면 점수를 숨긴다", () => {
    expect(ratingDisplay(usage, "가", "60plus")).toEqual({ shown: false });
  });

  it("5건 이상이면 소수 첫째 자리로 보여 준다", () => {
    expect(ratingDisplay(usage, "나", "60plus")).toEqual({ shown: true, mean: 4.5, count: 5 });
  });

  it("평가가 없거나 요약이 없으면 숨긴다", () => {
    expect(ratingDisplay(usage, "다", "60plus")).toEqual({ shown: false });
    expect(ratingDisplay(usage, "나", "20s")).toEqual({ shown: false });
    expect(ratingDisplay(null, "나", "60plus")).toEqual({ shown: false });
  });
});

describe("탐색 추천", () => {
  it("사용자 기록이 없으면 지금과 같은 결과다", () => {
    const base = getExploreRecommendations(people, SAMPLE_REGIONS, new Set());
    expect(getExploreRecommendations(people, SAMPLE_REGIONS, new Set(), EMPTY_USAGE).map((i) => i.region.code))
      .toEqual(base.map((i) => i.region.code));
  });

  it("기록이 있는 지역의 근거에는 반영한 기록 수가 나온다", () => {
    const codes = getExploreRecommendations(people, SAMPLE_REGIONS, new Set()).map((i) => i.region.code);
    expect(codes.length).toBeGreaterThan(0);
    const counts = Object.fromEntries(codes.map((code) => [code, { F_60plus: 300, M_20s: 300 }]));
    const items = getExploreRecommendations(people, SAMPLE_REGIONS, new Set(), usageWith({ total: 600, regionGroupCounts: counts }));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.evidence.some((line) => line.includes("사용자 기록 600건 반영")))).toBe(true);
  });
});
