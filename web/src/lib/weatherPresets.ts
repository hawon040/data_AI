/**
 * 시연용 날씨 예시. 기상청·에어코리아 실시간 연동 전까지 추천 규칙을 화면에서
 * 확인하기 위한 값이다 — 실제 예보가 아니다.
 */
import type { WeatherSnapshot } from "./weatherRules";

export interface WeatherPreset {
  id: string;
  label: string;
  weather: WeatherSnapshot;
}

const CLEAR: WeatherSnapshot = {
  pop: 10,
  precipitation: "none",
  minTempC: 8,
  maxTempC: 18,
  warnings: [],
  pm10Grade: 1,
  pm25Grade: 2,
};

export const WEATHER_PRESETS: WeatherPreset[] = [
  { id: "clear", label: "맑음", weather: CLEAR },
  { id: "rain-chance", label: "맑음, 오후 비 소식 (강수확률 30%)", weather: { ...CLEAR, pop: 30 } },
  { id: "rain", label: "비 예보 (강수확률 80%)", weather: { ...CLEAR, pop: 80, precipitation: "rain" } },
  { id: "snow", label: "눈 예보", weather: { ...CLEAR, pop: 70, precipitation: "snow", minTempC: -3, maxTempC: 1 } },
  { id: "cold", label: "한파 (최저 -8℃)", weather: { ...CLEAR, minTempC: -8, maxTempC: -1 } },
  { id: "chilly", label: "쌀쌀함 (최저 0℃)", weather: { ...CLEAR, minTempC: 0, maxTempC: 7 } },
  { id: "hot", label: "폭염 (최고 34℃)", weather: { ...CLEAR, minTempC: 25, maxTempC: 34 } },
  { id: "warm", label: "더움 (최고 31℃)", weather: { ...CLEAR, minTempC: 22, maxTempC: 31 } },
  { id: "dust", label: "미세먼지 나쁨", weather: { ...CLEAR, pm10Grade: 3, pm25Grade: 3 } },
  { id: "heavy-rain-warning", label: "호우특보 (강수확률 40%)", weather: { ...CLEAR, pop: 40, warnings: ["호우"] } },
  { id: "typhoon-warning", label: "태풍특보", weather: { ...CLEAR, pop: 90, precipitation: "rain", warnings: ["태풍"] } },
  { id: "wave-warning", label: "풍랑특보 (비 없음)", weather: { ...CLEAR, warnings: ["풍랑"] } },
];

export function findWeatherPreset(id: string): WeatherPreset {
  return WEATHER_PRESETS.find((preset) => preset.id === id) ?? WEATHER_PRESETS[0];
}
