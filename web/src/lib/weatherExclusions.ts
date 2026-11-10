/**
 * 날씨 규칙(weatherRules.ts) 때문에 추천에서 빠진 관광지와 그 이유.
 * 규칙은 그대로 쓰고(isAllowed), 빠진 곳을 화면에 설명하기 위한 목록만 만든다.
 */
import { classifyAttraction, TERRAIN_LABELS } from "./attractionSetting";
import type { Attraction, RecommendationItem } from "./types";
import { isAllowed, type WeatherDecision } from "./weatherRules";

export interface WeatherExclusion {
  regionCode: string;
  regionName: string;
  attraction: Attraction;
  /** 예: "강수확률 70% → 실내만 추천", "호우 특보 → 바다·산 제외" */
  reason: string;
}

/** 판단 근거 문장에서 "(기준 60% 이상)" 같은 기준 설명을 뺀 짧은 문구 */
const shortReason = (reason: string) => reason.replace(/\s*\(기준[^)]*\)/, "").trim();

export function exclusionReason(attraction: Attraction, decision: WeatherDecision): string {
  const { setting, terrains } = classifyAttraction(attraction);
  const parts: string[] = [];
  const hitTerrains = terrains.filter((terrain) => decision.excludedTerrains.includes(terrain));
  if (hitTerrains.length > 0) {
    const warning = decision.reasons.find((reason) => reason.includes("특보"));
    const label = warning ? warning.split(" — ")[0] : "기상특보";
    parts.push(`${label} → ${hitTerrains.map((terrain) => TERRAIN_LABELS[terrain]).join("·")} 제외`);
  }
  if (decision.indoorOnly && setting !== "indoor") {
    const why = decision.reasons.filter((reason) => !reason.includes("특보")).map(shortReason);
    parts.push(`${why.join(", ") || "날씨"} → 실내만 추천`);
  }
  return parts.join(" · ");
}

/** 추천 후보(날씨 적용 전)에서 날씨 때문에 빠지는 관광지를 이유와 함께 모은다. */
export function listWeatherExclusions(
  items: RecommendationItem[],
  decisionFor: (regionCode: string) => WeatherDecision | undefined,
): WeatherExclusion[] {
  return items.flatMap((item) => {
    const decision = decisionFor(item.region.code);
    if (!decision) return [];
    return item.topAttractions
      .filter(({ attraction }) => !isAllowed(attraction, decision))
      .map(({ attraction }) => ({
        regionCode: item.region.code,
        regionName: item.region.name,
        attraction,
        reason: exclusionReason(attraction, decision),
      }));
  });
}
