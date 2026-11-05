/**
 * 추천 근거 한 줄 — 핵심 수치만 짧게 (예: "또래 방문 1.4배 · 강수확률 70% → 실내").
 */
import type { RecommendationItem } from "./types";

function visitorsLabel(total: number): string {
  return total >= 10_000 ? `방문 ${(total / 10_000).toFixed(1)}만 명` : `방문 ${total.toLocaleString()}명`;
}

/**
 * 또래 방문 배수는 일행 중 가장 낮은 값을 쓴다 — 동행자 교집합 추천이 최솟값 기준이라
 * (lib/recommend.ts groupScore) 가장 덜 만족하는 사람의 수치가 실제 근거다.
 */
export function shortEvidence(item: RecommendationItem, weatherSummary: string | null): string {
  const lqs = item.perPersonLQ.map((x) => x.lq);
  const visit = lqs.length > 0 ? `또래 방문 ${Math.min(...lqs).toFixed(1)}배` : visitorsLabel(item.region.totalVisitors);
  return weatherSummary ? `${visit} · ${weatherSummary}` : visit;
}
