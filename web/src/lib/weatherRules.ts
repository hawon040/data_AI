/**
 * 날씨 × 일행 추천 규칙.
 *
 *  - 비·눈 예보 / 추운 날 / 더운 날 / 미세먼지 나쁨 → 실내만 추천
 *  - 기상특보(호우·태풍·풍랑) → 바다·산·계곡 제외
 *  - 날씨가 좋으면 실내·야외 함께 추천하고, 비 소식이 있으면 실내 대안을 함께 보여 준다
 *  - 어르신(60대 이상)이나 아이(10세 미만)가 있으면 strict 기준을 쓴다
 *  - 방문일이 3일보다 멀면 "출발 2~3일 전에 다시 확인"을 안내한다
 *
 * 기준값은 모두 config/weatherThresholds.ts(팀 기준(안))에 있다.
 */
import {
  COLD_MAX_TEMP_C,
  DUST_INDOOR_GRADE,
  FORECAST_RECHECK_DAYS,
  HOT_MIN_TEMP_C,
  RAIN_INDOOR_POP,
  RAIN_NOTICE_POP,
  TERRAIN_EXCLUDE_WARNINGS,
  type ThresholdPair,
} from "../config/weatherThresholds";
import { classifyAttraction, TERRAIN_LABELS, type Terrain } from "./attractionSetting";
import type { Attraction, RecommendationItem } from "./types";

export type PrecipitationType = "none" | "rain" | "rain_snow" | "snow" | "shower";

/** 방문일 하루의 날씨 요약. 값을 모르면 null로 둔다(그 규칙은 건너뛴다). */
export interface WeatherSnapshot {
  /** 강수확률 최댓값(%) */
  pop: number | null;
  precipitation: PrecipitationType | null;
  minTempC: number | null;
  maxTempC: number | null;
  /** 그 지역에 발효 중인 특보 종류 (예: ["호우", "강풍"]) */
  warnings: string[];
  /** 1 좋음 ~ 4 매우나쁨 */
  pm10Grade: number | null;
  pm25Grade: number | null;
}

export interface PartyInfo {
  withElderly: boolean;
  withChildren: boolean;
}

export interface WeatherDecision {
  indoorOnly: boolean;
  excludedTerrains: Terrain[];
  /** 날씨는 좋지만 비 소식이 있어 실내 대안을 함께 보여 줄지 */
  showIndoorAlternatives: boolean;
  /** 어르신·아이 때문에 strict 기준을 썼는지 */
  strict: boolean;
  /** 화면에 보여 줄 판단 근거 */
  reasons: string[];
  /** 화면에 보여 줄 안내 (다시 확인 등) */
  notices: string[];
}

const PRECIPITATION_LABELS: Record<Exclude<PrecipitationType, "none">, string> = {
  rain: "비",
  rain_snow: "비/눈",
  snow: "눈",
  shower: "소나기",
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(...ymd(fromIso));
  const to = Date.UTC(...ymd(toIso));
  return Math.round((to - from) / 86_400_000);
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m - 1, d];
}

export function decideWeather(
  weather: WeatherSnapshot,
  party: PartyInfo,
  visitDate: string,
  today: string,
): WeatherDecision {
  const strict = party.withElderly || party.withChildren;
  const pick = (pair: ThresholdPair) => (strict ? pair.strict : pair.normal);
  const reasons: string[] = [];
  const notices: string[] = [];
  let indoorOnly = false;

  if (weather.precipitation && weather.precipitation !== "none") {
    indoorOnly = true;
    reasons.push(`${PRECIPITATION_LABELS[weather.precipitation]} 예보`);
  } else if (weather.pop != null && weather.pop >= pick(RAIN_INDOOR_POP)) {
    indoorOnly = true;
    reasons.push(`강수확률 ${weather.pop}% (기준 ${pick(RAIN_INDOOR_POP)}% 이상)`);
  }
  if (weather.minTempC != null && weather.minTempC <= pick(COLD_MAX_TEMP_C)) {
    indoorOnly = true;
    reasons.push(`최저기온 ${weather.minTempC}℃ (기준 ${pick(COLD_MAX_TEMP_C)}℃ 이하)`);
  }
  if (weather.maxTempC != null && weather.maxTempC >= pick(HOT_MIN_TEMP_C)) {
    indoorOnly = true;
    reasons.push(`최고기온 ${weather.maxTempC}℃ (기준 ${pick(HOT_MIN_TEMP_C)}℃ 이상)`);
  }
  const dustGrade = Math.max(weather.pm10Grade ?? 0, weather.pm25Grade ?? 0);
  if (dustGrade >= pick(DUST_INDOOR_GRADE)) {
    indoorOnly = true;
    reasons.push(`미세먼지 ${dustGrade === 4 ? "매우나쁨" : "나쁨"}`);
  }

  const excludeWarnings: readonly string[] = strict ? TERRAIN_EXCLUDE_WARNINGS.strict : TERRAIN_EXCLUDE_WARNINGS.normal;
  const activeWarnings = weather.warnings.filter((w) => excludeWarnings.includes(w));
  const excludedTerrains: Terrain[] = activeWarnings.length > 0 ? ["sea", "mountain", "valley"] : [];
  if (activeWarnings.length > 0) {
    reasons.push(`${activeWarnings.join("·")} 특보 — ${excludedTerrains.map((t) => TERRAIN_LABELS[t]).join("·")} 제외`);
  }

  const showIndoorAlternatives =
    !indoorOnly && weather.pop != null && weather.pop >= pick(RAIN_NOTICE_POP);
  if (showIndoorAlternatives) {
    notices.push(`강수확률 ${weather.pop}% — 비가 올 때 갈 수 있는 실내 대안을 함께 보여 드려요.`);
  }
  if (strict) {
    notices.push("어르신·아이가 있어 날씨 기준을 더 엄격하게 적용했어요.");
  }
  if (daysBetween(today, visitDate) > FORECAST_RECHECK_DAYS) {
    notices.push("방문일까지 3일 넘게 남아 예보가 바뀔 수 있어요. 출발 2~3일 전에 다시 확인해 주세요.");
  }

  return { indoorOnly, excludedTerrains, showIndoorAlternatives, strict, reasons, notices };
}

export function isAllowed(attraction: Attraction, decision: WeatherDecision): boolean {
  const { setting, terrains } = classifyAttraction(attraction);
  if (decision.indoorOnly && setting !== "indoor") return false;
  return !terrains.some((terrain) => decision.excludedTerrains.includes(terrain));
}

/** 추천 목록에 날씨 규칙을 적용한다. 남는 관광지가 없는 지역은 뺀다. */
export function applyWeatherRules(
  items: RecommendationItem[],
  decision: WeatherDecision,
): RecommendationItem[] {
  return items.flatMap((item) => {
    const topAttractions = item.topAttractions.filter(({ attraction }) => isAllowed(attraction, decision));
    if (topAttractions.length === 0) return [];
    const indoorAlternatives = decision.showIndoorAlternatives
      ? item.region.attractions.filter(
          (a) => classifyAttraction(a).setting === "indoor" && isAllowed(a, decision),
        )
      : [];
    return [{ ...item, topAttractions, indoorAlternatives }];
  });
}
