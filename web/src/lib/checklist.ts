/**
 * 여행 준비물 체크리스트 3단계.
 *  1. 공통: 추천받기 직후 바로 보인다. 일정·교통편·계절(방문일)·동행자 + 추천 지역 중 가장 나쁜 날씨 한 줄
 *  2. 지역: 추천 카드(지역)를 누르면 그 지역의 날씨·미세먼지(일정 중 가장 나쁜 값)와 그 카드 관광지들의 지형별 준비물을 더한다
 *  3. 관광지: 관광지 버튼을 누르면 그 관광지만의 줄(성격·지형, 무장애 편의 요약)을 더한다
 * 앞 단계와 같은 주제의 안내는 하나만 남긴다(mergeTips). 비가 오거나 강수확률이 높은 날은 자외선 차단제를 뺀다.
 */
import { RAIN_INDOOR_POP } from "../config/weatherThresholds";
import { classifyAttraction, TERRAIN_LABELS } from "./attractionSetting";
import { airTips, mergeTips, terrainTips, weatherTipSentences, type TipGroup } from "./preparationTips";
import { attractionTagTips, commonPreparationTips, type TripPreferences } from "./tripPreferences";
import type { Attraction, Region } from "./types";
import type { WeatherSnapshot } from "./weatherRules";
import { restTips } from "./travelTime";

export const CHECKLIST_HINT = "지역이나 관광지를 누르면 그곳에 맞는 준비물이 더 나와요";

export type ChecklistFocus =
  | { kind: "common" }
  | { kind: "region"; region: Region; attractions: Attraction[] }
  | { kind: "attraction"; region: Region | null; attractions: Attraction[]; attraction: Attraction };

export interface ChecklistInput {
  preferences: TripPreferences;
  party: { withElderly: boolean; withChildren: boolean };
  /** 추천 지역들의 날씨를 항목별로 가장 나쁜 값으로 합친 것 (공통 단계 한 줄 요약) */
  commonWeather: WeatherSnapshot | null;
  /** 고른 지역의 날씨(일정 중 가장 나쁜 값) */
  regionWeather?: WeatherSnapshot | null;
  /** 고른 지역의 weather.py 준비물 낱말(우산·방한용품 등) */
  regionWeatherTips?: string[];
  /** 고른 관광지의 무장애 편의 요약(lib/liveAccess.ts의 prepTip) */
  accessTip?: string | null;
  /** 고른 지역(가장 가까운 추천 관광지)·관광지까지 예상 편도 시간. 2시간을 넘으면 휴식 안내를 더한다 */
  travelHours?: number | null;
  focus: ChecklistFocus;
}

export interface ChecklistSection {
  title: string;
  lines: string[];
}

export interface Checklist {
  /** 제목 옆 표시. 예: "강릉시 기준", "안목해변 카페거리 기준". 공통 단계면 null */
  scopeLabel: string | null;
  sections: ChecklistSection[];
  /** 공통 단계에서만 보이는 안내 */
  hint: string | null;
  /** 비·강수확률 때문에 자외선 차단제를 뺐는지 */
  rainy: boolean;
}

const PRECIP_LABELS: Record<string, string> = { rain: "비", shower: "소나기", snow: "눈", rain_snow: "비·눈" };
const DUST_LABELS = ["", "좋음", "보통", "나쁨", "매우나쁨"];

/** 비가 오거나 강수확률이 높은 날 (실내 위주 추천과 같은 기준: 일반 60%, 어르신·아이 40%) */
export function isRainyDay(weather: WeatherSnapshot | null | undefined, party: ChecklistInput["party"]): boolean {
  if (!weather) return false;
  const strict = party.withElderly || party.withChildren;
  const threshold = strict ? RAIN_INDOOR_POP.strict : RAIN_INDOOR_POP.normal;
  const wet = weather.precipitation != null && weather.precipitation !== "none";
  return wet || (weather.pop != null && weather.pop >= threshold);
}

/** 날씨 한 줄 요약. 아는 값이 없으면 null */
export function weatherLine(prefix: string, weather: WeatherSnapshot | null | undefined): string | null {
  if (!weather) return null;
  const parts: string[] = [];
  if (weather.pop != null) parts.push(`강수확률 ${weather.pop}%`);
  if (weather.precipitation && weather.precipitation !== "none") parts.push(PRECIP_LABELS[weather.precipitation] ?? "강수");
  if (weather.minTempC != null && weather.maxTempC != null) parts.push(`${weather.minTempC}~${weather.maxTempC}℃`);
  const dust = Math.max(weather.pm10Grade ?? 0, weather.pm25Grade ?? 0);
  if (dust > 0) parts.push(`미세먼지 ${DUST_LABELS[dust]}`);
  if (weather.warnings.length > 0) parts.push(`${weather.warnings.join("·")} 특보`);
  return parts.length > 0 ? `${prefix}: ${parts.join(" · ")}` : null;
}

function partyTips(party: ChecklistInput["party"]): string[] {
  const tips: string[] = [];
  if (party.withChildren) tips.push("아이 상비약과 갈아입을 옷, 간식을 챙기세요.");
  if (party.withElderly) tips.push("어르신이 드시는 약과 중간에 쉬어 갈 곳을 미리 확인하세요.");
  return tips;
}

/** 비 오는 날에는 자외선 차단제 안내를 뺀다(계절 안내는 물만 남긴다). */
function withoutSunscreen(tips: (string | TipGroup)[]): (string | TipGroup)[] {
  return tips.flatMap<string | TipGroup>((tip) => {
    if (typeof tip !== "string") {
      const items = tip.items.filter((item) => !item.includes("자외선"));
      return items.length > 0 ? [{ ...tip, items }] : [];
    }
    if (tip === "자외선 차단제와 휴대용 물을 준비하세요.") return ["휴대용 물을 준비하세요."];
    return tip.includes("자외선") ? [] : [tip];
  });
}

/** 관광지 한 줄. 실내 관광지는 지형을 붙이지 않고 "실내 관광지"만 적는다. */
function attractionLine(attraction: Attraction): string {
  const { setting, terrains } = classifyAttraction(attraction);
  if (setting === "indoor") return `${attraction.name}: 실내 관광지예요.`;
  return terrains.length > 0
    ? `${attraction.name}: ${terrains.map((t) => TERRAIN_LABELS[t]).join("·")} · 야외 관광지예요.`
    : `${attraction.name}: 야외 관광지예요.`;
}

export function buildChecklist(input: ChecklistInput): Checklist {
  const { preferences, party, focus } = input;
  const focusWeather = focus.kind !== "common" && focus.region ? input.regionWeather ?? null : null;
  const rainy = isRainyDay(focusWeather ?? input.commonWeather, party);
  const clean = (tips: (string | TipGroup)[]) => (rainy ? withoutSunscreen(tips) : tips);

  const raw: { title: string; tips: (string | TipGroup)[] }[] = [];
  const commonWeatherLine = weatherLine("날씨(추천 지역 중 가장 나쁜 값)", input.commonWeather);
  raw.push({
    title: "공통",
    tips: [...commonPreparationTips(preferences), ...partyTips(party), ...(commonWeatherLine ? [commonWeatherLine] : [])],
  });

  if (focus.kind !== "common" && focus.region) {
    const regionWeatherLine = weatherLine(`${focus.region.name} 날씨(일정 중 가장 나쁜 값)`, input.regionWeather);
    raw.push({
      title: focus.region.name,
      tips: [
        ...(regionWeatherLine ? [regionWeatherLine] : []),
        ...weatherTipSentences(input.regionWeatherTips ?? []),
        ...airTips(input.regionWeather ?? null),
        ...terrainTips(focus.attractions, party),
      ],
    });
  }

  if (focus.kind === "attraction") {
    const { attraction } = focus;
    raw.push({
      title: attraction.name,
      tips: [
        attractionLine(attraction),
        ...attractionTagTips(attraction),
        // 지역 단계가 없을 때(계절 사진 등)는 이 관광지의 지형별 준비물을 여기서 보여 준다.
        ...(focus.region ? [] : terrainTips([attraction], party)),
        ...(input.accessTip ? [input.accessTip] : []),
      ],
    });
  }

  // 편도 2시간을 넘는 곳을 고르면 그 단계(지역·관광지) 줄 끝에 휴식 안내를 더한다.
  const rest = focus.kind === "common" ? [] : restTips(input.travelHours ?? null, party);
  if (rest.length > 0) raw[raw.length - 1].tips.push(...rest);

  let merged: string[] = [];
  const sections: ChecklistSection[] = [];
  for (const { title, tips } of raw) {
    const next = mergeTips(merged, clean(tips));
    const lines = next.slice(merged.length);
    merged = next;
    if (lines.length > 0) sections.push({ title, lines });
  }

  const scope = focus.kind === "attraction" ? focus.attraction.name : focus.kind === "region" ? focus.region.name : null;
  return {
    scopeLabel: scope ? `${scope} 기준` : null,
    sections,
    hint: focus.kind === "common" ? CHECKLIST_HINT : null,
    rainy,
  };
}
