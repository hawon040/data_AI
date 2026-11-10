/**
 * 실시간 정보로 여행 체크리스트(TripPreparation)에 더하는 안내.
 *  - weather.py decide()의 준비물(tips: 우산·방한용품·자외선 차단 등) → 문장으로 바꿔 합친다
 *  - 에어코리아 미세먼지 나쁨 이상 → 마스크 안내
 *  - 추천된 관광지 종류(바다·산·계곡, attractionSetting.classifyAttraction) → 종류별로 한 줄에 묶은 준비물
 * 기존 문구(getPreparationTips)와 뜻이 겹치면(같은 주제 낱말) 하나만 남긴다.
 */
import { classifyAttraction, TERRAIN_LABELS, type Terrain } from "./attractionSetting";
import type { Attraction } from "./types";
import type { WeatherSnapshot } from "./weatherRules";

export const MASK_TIP = "미세먼지가 나쁨 이상이에요. 마스크를 준비하세요.";

/** weather.py decide()의 tips 낱말 → 체크리스트 문장 */
const WEATHER_TIP_TEXT: Record<string, string> = {
  우산: "비 소식이 있어요. 우산이나 우비를 챙기세요.",
  "미끄럼 주의": "비·눈길 미끄럼에 주의하세요.",
  방한용품: "추운 날이에요. 장갑·목도리 같은 방한용품을 챙기세요.",
  "어르신·아이 체온 주의": "어르신·아이는 체온이 떨어지지 않게 자주 살펴 주세요.",
  물: "더운 날이에요. 마실 물을 넉넉히 챙기세요.",
  "자외선 차단": "자외선 차단제와 모자를 준비하세요.",
  "한낮 야외 피하기": "한낮에는 야외 활동을 피하세요.",
  마스크: MASK_TIP,
  "가까운 대피소·응급실 확인": "기상특보가 있어요. 가까운 대피소와 응급실 위치를 미리 확인하세요.",
};

/** 같은 주제로 보는 낱말 묶음. 한 묶음이라도 겹치면 같은 안내로 본다. */
const TOPICS: string[][] = [
  ["우산", "우비"],
  ["미끄럼"],
  ["방한", "따뜻한 겉옷"],
  ["체온"],
  ["마실 물", "휴대용 물", "물을 챙기"],
  ["자외선"],
  ["한낮"],
  ["마스크"],
  ["대피소"],
  ["등산화"],
  ["간식"],
  ["바람막이"],
  ["하산"],
  ["보조배터리"],
  ["물때"],
  ["여벌 옷"],
  ["구명조끼"],
  ["불어나는 물"],
  ["등산 스틱", "쉬운 코스"],
];

function topicsOf(tip: string): Set<number> {
  return new Set(TOPICS.flatMap((words, i) => (words.some((word) => tip.includes(word)) ? [i] : [])));
}

export function weatherTipSentences(tips: string[]): string[] {
  return tips.map((tip) => WEATHER_TIP_TEXT[tip] ?? tip);
}

/** 에어코리아 미세먼지 등급(PM10·PM2.5 중 나쁜 쪽)이 나쁨(3) 이상이면 마스크 안내 */
export function airTips(weather: WeatherSnapshot | null): string[] {
  const grade = Math.max(weather?.pm10Grade ?? 0, weather?.pm25Grade ?? 0);
  return grade >= 3 ? [MASK_TIP] : [];
}

/** 한 줄로 묶어 보여 줄 준비물. 예: { label: "산(상당산성 외 2곳)", items: ["등산화", "물·간식"] } */
export interface TipGroup {
  label: string;
  items: string[];
}

function overlapsAny(tip: string, lines: string[]): boolean {
  const topics = topicsOf(tip);
  return lines.some((line) => line === tip || [...topicsOf(line)].some((topic) => topics.has(topic)));
}

/**
 * 기존 안내 뒤에 더하되, 같은 문구나 같은 주제(우산·방한·물·마스크 등)의 안내는 하나만 남긴다.
 * 묶음(TipGroup)은 겹치는 항목만 빼고 "라벨: 항목, 항목" 한 줄로 만든다. 묶음끼리는 겹침을 따지지 않는다
 * — 계곡 줄만 보는 사람도 여벌 옷을 알아야 하기 때문이다.
 */
export function mergeTips(base: string[], extra: (string | TipGroup)[]): string[] {
  const merged = [...base];
  const plain = [...base];
  for (const tip of extra) {
    if (typeof tip === "string") {
      if (!overlapsAny(tip, merged)) {
        merged.push(tip);
        plain.push(tip);
      }
      continue;
    }
    const items = tip.items.filter((item) => !overlapsAny(item, plain));
    if (items.length > 0) merged.push(`${tip.label}: ${items.join(", ")}`);
  }
  return merged;
}

/** 관광지 종류별 준비물 (팀 안내 문구, 공식 기준 아님) */
const TERRAIN_TIP_ITEMS: Record<Terrain, string[]> = {
  mountain: ["등산화", "물·간식", "바람막이", "해 지기 전 하산", "보조배터리"],
  sea: ["자외선 차단제", "여벌 옷·수건", "물때 확인", "갯바위 미끄럼 주의"],
  valley: ["미끄럼 방지 신발", "여벌 옷", "불어나는 물 주의"],
};
const ELDERLY_MOUNTAIN_ITEM = "등산 스틱·쉬운 코스(어르신)";
const CHILD_WATER_ITEM = "아이 구명조끼";
const TERRAIN_ORDER: Terrain[] = ["mountain", "sea", "valley"];

/**
 * 추천된 관광지 가운데 바다·산·계곡이 있을 때만, 종류별로 한 줄에 묶을 준비물을 만든다.
 * 예: 한 곳이면 "바다(정동진): …", 여러 곳이면 "산(상당산성 외 2곳): …"로 보인다.
 */
export function terrainTips(
  attractions: Pick<Attraction, "name" | "category">[],
  party: { withElderly: boolean; withChildren: boolean },
): TipGroup[] {
  const names = new Map<Terrain, string[]>();
  for (const attraction of attractions) {
    for (const terrain of classifyAttraction(attraction).terrains) {
      const list = names.get(terrain) ?? [];
      if (!list.includes(attraction.name)) list.push(attraction.name);
      names.set(terrain, list);
    }
  }
  return TERRAIN_ORDER.flatMap((terrain) => {
    const list = names.get(terrain);
    if (!list?.length) return [];
    const who = list.length === 1 ? list[0] : `${list[0]} 외 ${list.length - 1}곳`;
    const items = [...TERRAIN_TIP_ITEMS[terrain]];
    if (terrain === "mountain" && party.withElderly) items.push(ELDERLY_MOUNTAIN_ITEM);
    if (terrain !== "mountain" && party.withChildren) items.push(CHILD_WATER_ITEM);
    return [{ label: `${TERRAIN_LABELS[terrain]}(${who})`, items }];
  });
}
