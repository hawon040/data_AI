/**
 * 결과 카드·장소 상세에 쓰는 날씨 한 줄 요약: 하늘 · 기온(최저/최고) · 강수확률 · 미세먼지.
 * 판정(weatherRules.ts)과 별개로, 판정 문장이 없어도 이 기본 요약은 항상 보여 준다.
 */
import type { RegionWeather } from "./liveWeather";
import type { PrecipitationType, WeatherSnapshot } from "./weatherRules";

export const WEATHER_FAILED_MESSAGE = "날씨 정보를 불러오지 못했어요";
export const WEATHER_NO_FORECAST_MESSAGE = "이 날짜 예보가 아직 없어요. 출발 2~3일 전에 다시 확인해 주세요";

const PRECIP_SKY: Record<Exclude<PrecipitationType, "none">, string> = {
  rain: "비",
  rain_snow: "비/눈",
  snow: "눈",
  shower: "소나기",
};
const DUST_LABELS = ["", "좋음", "보통", "나쁨", "매우나쁨"];

export type WeatherBrief = { kind: "ok"; text: string } | { kind: "failed"; text: string } | { kind: "none"; text: string };

/** 하늘 문구. 예보의 하늘 상태가 없으면 강수 형태로 대신한다(시연 날씨 포함). */
function skyLabel(sky: string | null, snapshot: WeatherSnapshot): string | null {
  if (snapshot.precipitation && snapshot.precipitation !== "none") {
    const rainy = PRECIP_SKY[snapshot.precipitation];
    return sky && sky.includes(rainy) ? sky : rainy;
  }
  return sky;
}

/** 스냅숏 하나를 한 줄로. 아는 값만 넣는다. */
export function briefLine(snapshot: WeatherSnapshot, sky: string | null = null): string {
  const parts: string[] = [];
  const skyText = skyLabel(sky, snapshot);
  if (skyText) parts.push(skyText);
  if (snapshot.minTempC != null || snapshot.maxTempC != null) {
    parts.push(`최저 ${snapshot.minTempC ?? "-"}℃ / 최고 ${snapshot.maxTempC ?? "-"}℃`);
  }
  if (snapshot.pop != null) parts.push(`강수확률 ${snapshot.pop}%`);
  const dust = Math.max(snapshot.pm10Grade ?? 0, snapshot.pm25Grade ?? 0);
  if (dust > 0) parts.push(`미세먼지 ${DUST_LABELS[dust]}`);
  return parts.join(" · ");
}

/**
 * 지역의 방문일 날씨 요약.
 *  - 시연 모드: 예시 날씨(demo)로 만든다
 *  - 서버에 연결하지 못했으면 "날씨 정보를 불러오지 못했어요"
 *  - 예보가 아직 없으면(범위 밖) 다시 확인 안내
 * 1박 이상이면 일정 중 가장 나쁜 값(worst)과 첫날 하늘 상태로 만든다.
 */
export function weatherBrief(region: RegionWeather | undefined, demo: WeatherSnapshot | null = null): WeatherBrief {
  if (demo) return { kind: "ok", text: briefLine(demo) || "예시 날씨" };
  if (!region || region.days.length === 0) return { kind: "failed", text: WEATHER_FAILED_MESSAGE };
  if (region.days.every((day) => day.unreachable)) return { kind: "failed", text: WEATHER_FAILED_MESSAGE };
  if (!region.worst) return { kind: "none", text: WEATHER_NO_FORECAST_MESSAGE };
  const sky = region.days.find((day) => day.sky)?.sky ?? null;
  const text = briefLine(region.worst, sky);
  return text ? { kind: "ok", text } : { kind: "none", text: WEATHER_NO_FORECAST_MESSAGE };
}
