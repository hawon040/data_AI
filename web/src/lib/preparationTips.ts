/**
 * 실시간 정보로 여행 체크리스트(TripPreparation)에 더하는 안내.
 * 기존 문구(getPreparationTips)와 겹치는 안내는 하나만 남긴다.
 */
import type { WeatherSnapshot } from "./weatherRules";

export const MASK_TIP = "미세먼지가 나쁨 이상이에요. 마스크를 준비하세요.";

/** 에어코리아 미세먼지 등급(PM10·PM2.5 중 나쁜 쪽)이 나쁨(3) 이상이면 마스크 안내 */
export function airTips(weather: WeatherSnapshot | null): string[] {
  const grade = Math.max(weather?.pm10Grade ?? 0, weather?.pm25Grade ?? 0);
  return grade >= 3 ? [MASK_TIP] : [];
}

/** 기존 안내 뒤에 더하되, 같은 문구는 하나만 남긴다. */
export function mergeTips(base: string[], extra: string[]): string[] {
  const merged = [...base];
  for (const tip of extra) {
    if (!merged.includes(tip)) merged.push(tip);
  }
  return merged;
}
