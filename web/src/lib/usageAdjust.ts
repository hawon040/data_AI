/**
 * 서비스 사용자 기록으로 추천을 보정하는 계산.
 * Python 구현(tourism_platform/src/tourism_platform/usage/)과 같은 식이며,
 * tourism_platform/tests/test_usage_ts_parity.py가 두 구현의 결과가 같은지 확인한다.
 *
 * - 지역 특화지수: LQ_ig = ((U_ig + K_i·p_ig) / (U_i + K_i)) / s_g
 *   기록(U)이 0건이면 기본값(p, 지금은 샘플 방문자 비중)만으로 계산한 값과 같고, 쌓일수록 사용자 기록을 따른다.
 * - 관광지 선호 가중치: A' = clip(w·O + (1−w)·P, 0.6, 1.4),  w = n/(n+m),  O = 평균 점수 ÷ 연령대 전체 평균
 *   평가가 없으면 기본 가중치 P 그대로다.
 */
import type { AgeGroup, GroupKey, Region } from "./types";

/** GET /tourapi/api/usage/summary 응답 */
export interface UsageSummary {
  available: boolean;
  total: number;
  generatedAt: string | null;
  /** 지역코드 → 집단 → 가중 건수(평가 1.0, 길찾기 0.5) */
  regionGroupCounts: Record<string, Partial<Record<GroupKey, number>>>;
  ageRatings: Partial<Record<AgeGroup, RatingStat>>;
  attractionRatings: { attraction: string; ageGroup: AgeGroup; n: number; mean: number; count: number }[];
}

export interface RatingStat {
  /** 최근 평가에 더 큰 비중을 둔 유효 평가 수 */
  n: number;
  /** 가중 평균 점수 */
  mean: number;
  /** 평가 건수(가중 없음) */
  count: number;
}

export interface Prior {
  shares: Record<GroupKey, number>;
  /** 기본값을 몇 건의 기록만큼 믿는지 */
  strength: number;
}

/** 기본값 강도의 기준(지역 평균). 지역 방문자 수에 비례해 지역마다 달라진다. 잠정값. */
export const PRIOR_STRENGTH_BASE = 50;
export const SHARE_SMOOTHING = 1;
export const PRIOR_STRENGTH_M = 10;
export const AFFINITY_CLIP: [number, number] = [0.6, 1.4];

export const EMPTY_USAGE: UsageSummary = {
  available: false,
  total: 0,
  generatedAt: null,
  regionGroupCounts: {},
  ageRatings: {},
  attractionRatings: [],
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * 지역별 기본값. 기본값 비중은 지역의 집단별 방문자 비중이고,
 * 강도는 큰 지역일수록 세게(많은 기록이 쌓여야 움직이게) 둔다 — 평균 강도가 PRIOR_STRENGTH_BASE.
 */
export function buildPriors(regions: Region[], base = PRIOR_STRENGTH_BASE): Record<string, Prior> {
  const meanVisitors = sum(regions.map((r) => r.totalVisitors)) / regions.length;
  return Object.fromEntries(
    regions.map((region) => {
      const total = sum(Object.values(region.groupVisitors));
      const shares = Object.fromEntries(
        Object.entries(region.groupVisitors).map(([key, v]) => [key, v / total]),
      ) as Record<GroupKey, number>;
      return [region.code, { shares, strength: (base * region.totalVisitors) / meanVisitors }];
    }),
  );
}

/** 기본값과 사용자 기록을 합친 건수로 구한 집단별 전체 비중 s_g */
export function blendedNationalShares(
  counts: UsageSummary["regionGroupCounts"],
  priors: Record<string, Prior>,
  groups: GroupKey[],
  smoothing = SHARE_SMOOTHING,
): Record<GroupKey, number> {
  const totals = Object.fromEntries(groups.map((g) => [g, 0])) as Record<GroupKey, number>;
  for (const region of new Set([...Object.keys(counts), ...Object.keys(priors)])) {
    for (const g of groups) {
      totals[g] += counts[region]?.[g] ?? 0;
      const prior = priors[region];
      if (prior) totals[g] += prior.strength * prior.shares[g];
    }
  }
  const denominator = sum(Object.values(totals)) + smoothing * groups.length;
  return Object.fromEntries(groups.map((g) => [g, (totals[g] + smoothing) / denominator])) as Record<GroupKey, number>;
}

export interface RegionLQ {
  lq: number;
  /** 이 지역의 사용자 기록 수 */
  records: number;
  /** 사용자 기록이 반영된 비율 U_i / (U_i + K_i) */
  reliability: number;
}

export function regionLQ(
  counts: UsageSummary["regionGroupCounts"],
  shares: Record<GroupKey, number>,
  regionCode: string,
  group: GroupKey,
  prior: Prior,
): RegionLQ {
  const groups = counts[regionCode] ?? {};
  const uI = sum(Object.values(groups).map((v) => v ?? 0));
  const share = ((groups[group] ?? 0) + prior.strength * prior.shares[group]) / (uI + prior.strength);
  return { lq: share / shares[group], records: uI, reliability: uI / (uI + prior.strength) };
}

/** 기본 가중치 prior를 평가로 보정한 값. 평가가 없으면 prior 그대로. */
export function adjustedAffinity(
  prior: number,
  stat: Pick<RatingStat, "n" | "mean"> | undefined,
  ageMean: Pick<RatingStat, "n" | "mean"> | undefined,
  m = PRIOR_STRENGTH_M,
  clip: [number, number] = AFFINITY_CLIP,
): number {
  if (!stat || !ageMean || stat.n <= 0 || ageMean.mean <= 0) return prior;
  const observed = stat.mean / ageMean.mean;
  const weight = stat.n / (stat.n + m);
  return Math.min(Math.max(weight * observed + (1 - weight) * prior, clip[0]), clip[1]);
}

/** 관광지·연령대의 평가 통계를 찾는다. */
export function findRatingStat(usage: UsageSummary | null | undefined, attraction: string, ageGroup: AgeGroup) {
  return usage?.attractionRatings.find((r) => r.attraction === attraction && r.ageGroup === ageGroup);
}
