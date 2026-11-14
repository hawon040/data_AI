/**
 * 추천 카드(지역)에 보여 줄 정보.
 *  - 그 지역 추천 후보 관광지들의 카테고리 칩(많은 순 최대 3개)
 *  - 관광지 버튼마다 "카테고리 · 실내/야외"
 *  - 날씨 때문에 빠진 관광지의 짧은 사유("비 예보로 제외" 등)
 */
import { classifyAttraction } from "./attractionSetting";
import type { Attraction } from "./types";
import type { WeatherDecision } from "./weatherRules";

/** 관광지 카테고리를 모아 많은 순 최대 limit개. "역사·문화"처럼 묶인 값은 나눠서 센다. 같은 수면 먼저 나온 순서. */
export function categoryChips(attractions: Pick<Attraction, "category">[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const { category } of attractions) {
    for (const part of category.split(/[·,/]/).map((p) => p.trim()).filter(Boolean)) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count], order) => ({ name, count, order }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map(({ name }) => name);
}

/** 관광지 버튼 옆 작은 글씨. 예: "카페·맛집 · 실내" */
export function attractionMeta(attraction: Pick<Attraction, "name" | "category">): string {
  const where = classifyAttraction(attraction).setting === "indoor" ? "실내" : "야외";
  return attraction.category ? `${attraction.category} · ${where}` : where;
}

/** 날씨 판단 근거에서 "○○로 제외"에 쓸 원인 낱말 (비 예보, 눈 예보, 추위, 더위, 미세먼지) */
function indoorCause(decision: WeatherDecision): string {
  const reason = decision.reasons.find((r) => !r.includes("특보")) ?? "";
  if (/눈/.test(reason) && !/비/.test(reason)) return "눈 예보";
  if (/비|소나기|강수확률/.test(reason)) return "비 예보";
  if (reason.startsWith("최저기온")) return "추위";
  if (reason.startsWith("최고기온")) return "더위";
  if (reason.startsWith("미세먼지")) return "미세먼지";
  return "날씨";
}

/** 날씨 때문에 빠진 관광지의 짧은 사유. 특보로 지형이 빠지면 "호우특보로 제외", 실내만 추천이면 "비 예보로 제외" 등 */
export function exclusionLabel(attraction: Pick<Attraction, "name" | "category">, decision: WeatherDecision): string {
  const { terrains } = classifyAttraction(attraction);
  if (terrains.some((t) => decision.excludedTerrains.includes(t))) {
    const warning = decision.reasons.find((r) => r.includes("특보"));
    return `${warning ? warning.split(" 특보")[0] + "특보" : "기상특보"}로 제외`;
  }
  return `${indoorCause(decision)}로 제외`;
}

/** "비 예보로 체험할 곳이 없어요" 같은 문구에 쓸 원인 낱말 */
export function weatherCause(decision: WeatherDecision): string {
  if (decision.indoorOnly) return indoorCause(decision);
  const warning = decision.reasons.find((r) => r.includes("특보"));
  return warning ? `${warning.split(" 특보")[0]}특보` : "날씨";
}
