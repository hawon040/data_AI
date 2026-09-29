/**
 * 성·연령 방문 특화지수(LQ)와 동행자 교집합 추천 점수 (신청서 문서 4.2, 4.4).
 * Python 구현(tourism_platform/src/tourism_platform/indices/)과 동일한 수식을 쓴다.
 */
import type { GroupKey, Region } from "./types";

const DEFAULT_K = 50;

/** 전국 방문자 중 각 집단의 비중 s_g. 샘플 지역 데이터를 모두 더해 계산한다. */
export function nationalShares(regions: Region[]): Record<GroupKey, number> {
  const totals: Partial<Record<GroupKey, number>> = {};
  let grandTotal = 0;
  for (const region of regions) {
    for (const [key, v] of Object.entries(region.groupVisitors) as [GroupKey, number][]) {
      totals[key] = (totals[key] ?? 0) + v;
      grandTotal += v;
    }
  }
  const shares: Partial<Record<GroupKey, number>> = {};
  for (const [key, v] of Object.entries(totals) as [GroupKey, number][]) {
    shares[key] = v / grandTotal;
  }
  return shares as Record<GroupKey, number>;
}

/** LQ_ig = (V_ig + k·s_g) / (V_i + k) / s_g */
export function locationQuotient(vIg: number, vI: number, sG: number, k = DEFAULT_K): number {
  if (sG <= 0) throw new Error("sG must be positive");
  const smoothedShare = (vIg + k * sG) / (vI + k);
  return smoothedShare / sG;
}

/** Score_ig = LQ_ig × log(V_i) */
export function specializationScore(lqIg: number, vI: number): number {
  return lqIg * Math.log(vI);
}

/** Score_i^group = min_g(LQ_ig) × log(V_i) — 평균이 아닌 최솟값으로 동행자 전원을 배려한다. */
export function groupScore(lqValues: number[], vI: number): number {
  if (lqValues.length === 0) throw new Error("lqValues must not be empty");
  return Math.min(...lqValues) * Math.log(vI);
}
