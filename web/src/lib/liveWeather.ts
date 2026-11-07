/**
 * 실제 예보를 tourapi 서버(/tourapi/api/weather, tourapi/weather.py)에서 불러와
 * 판정 규칙(weatherRules.ts)이 쓰는 WeatherSnapshot으로 바꾼다.
 *
 * weather.py fetch_weather 응답에서 쓰는 필드:
 *   forecast.pop     → pop (그날 강수확률 최댓값, %)
 *   forecast.precip  → precipitation ("비"·"눈"·"비/눈"·"소나기"·"빗방울"·"눈날림" 등)
 *   forecast.tmin    → minTempC,  forecast.tmax → maxTempC
 *   forecast.source·issued → 출처 ("단기예보"/"중기예보", YYYYMMDDHHMM 발표)
 *   warnings.kinds   → warnings (그 시군구에 발효 중인 특보, 오늘·내일만)
 *   air.pm10Grade·pm25Grade·time → pm10Grade·pm25Grade (시도 측정소 중 가장 나쁜 등급, 오늘만)
 * 값이 없으면 null로 둔다(그 규칙은 건너뛴다).
 */
import { addDaysIso, type TripPreferences } from "./tripPreferences";
import type { Region } from "./types";
import type { PrecipitationType, WeatherSnapshot } from "./weatherRules";

const TOURAPI_BASE = "/tourapi";

/** 지역 데이터의 시도 이름 → weather.py SIDO 키 */
const SIDO_KEYS: Record<string, string> = {
  서울특별시: "서울", 인천광역시: "인천", 경기도: "경기", 강원도: "강원", 강원특별자치도: "강원",
  대전광역시: "대전", 세종특별자치시: "세종", 충청남도: "충남", 충청북도: "충북",
  광주광역시: "광주", 전라남도: "전남", 전라북도: "전북", 전북특별자치도: "전북",
  대구광역시: "대구", 경상북도: "경북", 부산광역시: "부산", 울산광역시: "울산", 경상남도: "경남",
  제주특별자치도: "제주",
};

const PRECIP_TYPES: Record<string, PrecipitationType> = {
  비: "rain", 빗방울: "rain", "비/눈": "rain_snow", 빗방울눈날림: "rain_snow",
  눈: "snow", 눈날림: "snow", 소나기: "shower",
};
/** 여러 날·여러 종류를 합칠 때 더 나쁜 쪽을 고르는 순서 */
const PRECIP_SEVERITY: Record<PrecipitationType, number> = { none: 0, shower: 1, rain: 2, snow: 3, rain_snow: 4 };

interface WeatherResponse {
  date: string;
  forecast: {
    source: string;
    pop: number | null;
    precip: string[];
    tmin: number | null;
    tmax: number | null;
    issued?: string;
  } | null;
  air: { pm10Grade?: number | null; pm25Grade?: number | null; time?: string | null } | null;
  warnings: { kinds?: string[] } | null;
}

export interface DayWeather {
  /** YYYY-MM-DD */
  date: string;
  /** 예보가 없으면(범위 밖·서버 오류) null — 화면에는 "예보 확인 필요" */
  snapshot: WeatherSnapshot | null;
  /** 예: "기상청 단기예보 11월 7일 14:00 발표 · 에어코리아 11월 7일 14:00 측정" */
  source: string | null;
}

export interface RegionWeather {
  days: DayWeather[];
  /** 예보가 있는 날들 중 항목별로 가장 나쁜 값. 예보가 하나도 없으면 null */
  worst: WeatherSnapshot | null;
}

export const EMPTY_WEATHER: WeatherSnapshot = {
  pop: null,
  precipitation: null,
  minTempC: null,
  maxTempC: null,
  warnings: [],
  pm10Grade: null,
  pm25Grade: null,
};

/** 방문일부터 종료일(방문일 + 박 수)까지 날짜 목록. 당일치기면 방문일 하루. */
export function tripDates(preferences: Pick<TripPreferences, "duration" | "visitDate" | "nights">): string[] {
  const nights = preferences.duration === "overnight" ? preferences.nights : 0;
  return Array.from({ length: nights + 1 }, (_, i) => addDaysIso(preferences.visitDate, i));
}

function monthDayTime(digits: string): string {
  // "YYYYMMDDHHMM" → "11월 7일 14:00"
  const d = digits.replace(/\D/g, "");
  if (d.length < 12) return "";
  return `${Number(d.slice(4, 6))}월 ${Number(d.slice(6, 8))}일 ${d.slice(8, 10)}:${d.slice(10, 12)}`;
}

function precipitationOf(labels: string[]): PrecipitationType {
  let worst: PrecipitationType = "none";
  for (const label of labels) {
    const type = PRECIP_TYPES[label];
    if (type && PRECIP_SEVERITY[type] > PRECIP_SEVERITY[worst]) worst = type;
  }
  return worst;
}

/** weather.py 응답 하나를 WeatherSnapshot과 출처 문구로 바꾼다. 예보가 없으면 snapshot null. */
export function toDayWeather(date: string, response: WeatherResponse): DayWeather {
  const forecast = response.forecast;
  if (!forecast) return { date, snapshot: null, source: null };
  const issued = monthDayTime(forecast.issued ?? "");
  const sources = [`기상청 ${forecast.source}${issued ? ` ${issued}` : ""} 발표`];
  if (response.air?.time && (response.air.pm10Grade != null || response.air.pm25Grade != null)) {
    sources.push(`에어코리아 ${monthDayTime(response.air.time)} 측정`);
  }
  return {
    date,
    snapshot: {
      pop: forecast.pop ?? null,
      precipitation: precipitationOf(forecast.precip ?? []),
      minTempC: forecast.tmin ?? null,
      maxTempC: forecast.tmax ?? null,
      warnings: response.warnings?.kinds ?? [],
      pm10Grade: response.air?.pm10Grade ?? null,
      pm25Grade: response.air?.pm25Grade ?? null,
    },
    source: sources.join(" · "),
  };
}

const maxOrNull = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v != null);
  return known.length ? Math.max(...known) : null;
};
const minOrNull = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v != null);
  return known.length ? Math.min(...known) : null;
};

/** 여러 날을 항목별로 가장 나쁜 값으로 합친다(1박 이상 일정은 가장 나쁜 날 기준으로 판정). */
export function worstOf(snapshots: WeatherSnapshot[]): WeatherSnapshot | null {
  if (snapshots.length === 0) return null;
  return {
    pop: maxOrNull(snapshots.map((s) => s.pop)),
    precipitation: snapshots.reduce<PrecipitationType | null>((worst, s) => {
      if (s.precipitation == null) return worst;
      if (worst == null || PRECIP_SEVERITY[s.precipitation] > PRECIP_SEVERITY[worst]) return s.precipitation;
      return worst;
    }, null),
    minTempC: minOrNull(snapshots.map((s) => s.minTempC)),
    maxTempC: maxOrNull(snapshots.map((s) => s.maxTempC)),
    warnings: [...new Set(snapshots.flatMap((s) => s.warnings))],
    pm10Grade: maxOrNull(snapshots.map((s) => s.pm10Grade)),
    pm25Grade: maxOrNull(snapshots.map((s) => s.pm25Grade)),
  };
}

/** 브라우저에서 같은 지역·날짜 예보를 다시 쓰는 시간. 서버(weather.py)는 1시간 저장한다. */
const CLIENT_CACHE_MS = 30 * 60 * 1000;
const dayRequests = new Map<string, { at: number; request: Promise<DayWeather> }>();

/** 지역 하나의 하루 예보. 같은 지역·날짜는 30분 동안 다시 부르지 않는다(실패하면 다음에 다시 부른다). */
function loadDay(region: Region, date: string): Promise<DayWeather> {
  const key = `${region.code}|${date}`;
  const cached = dayRequests.get(key);
  let request = cached && Date.now() - cached.at < CLIENT_CACHE_MS ? cached.request : undefined;
  if (!request) {
    const params = new URLSearchParams({
      lat: String(region.lat),
      lon: String(region.lng),
      sido: SIDO_KEYS[region.province] ?? region.province,
      gungu: region.name,
      date: date.replace(/-/g, ""),
    });
    request = fetch(`${TOURAPI_BASE}/api/weather?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return toDayWeather(date, (await response.json()) as WeatherResponse);
      })
      .catch((error: unknown) => {
        // 서버가 꺼졌거나 오류면 이 날은 "예보 확인 필요". 자세한 원인은 콘솔에만 남긴다.
        console.warn(`날씨 예보를 불러오지 못함 (${region.name} ${date})`, error);
        dayRequests.delete(key);
        return { date, snapshot: null, source: null };
      });
    dayRequests.set(key, { at: Date.now(), request });
  }
  return request;
}

/** 지역 하나의 일정 전체 예보. */
export async function loadRegionWeather(region: Region, dates: string[]): Promise<RegionWeather> {
  const days = await Promise.all(dates.map((date) => loadDay(region, date)));
  return { days, worst: worstOf(days.flatMap((day) => (day.snapshot ? [day.snapshot] : []))) };
}
