import type { DayWeather } from "../lib/liveWeather";
import type { PrecipitationType, WeatherDecision, WeatherSnapshot } from "../lib/weatherRules";

const PRECIP_LABELS: Record<PrecipitationType, string> = {
  none: "비·눈 없음",
  rain: "비",
  rain_snow: "비/눈",
  snow: "눈",
  shower: "소나기",
};
const DUST_LABELS = ["", "좋음", "보통", "나쁨", "매우나쁨"];

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일(${"일월화수목금토"[new Date(y, m - 1, d).getDay()]})`;
}

function daySummary(snapshot: WeatherSnapshot): string {
  const parts: string[] = [];
  if (snapshot.pop != null) parts.push(`강수확률 ${snapshot.pop}%`);
  if (snapshot.precipitation && snapshot.precipitation !== "none") parts.push(PRECIP_LABELS[snapshot.precipitation]);
  if (snapshot.minTempC != null || snapshot.maxTempC != null) {
    parts.push(`${snapshot.minTempC ?? "-"}~${snapshot.maxTempC ?? "-"}℃`);
  }
  const dust = Math.max(snapshot.pm10Grade ?? 0, snapshot.pm25Grade ?? 0);
  if (dust > 0) parts.push(`미세먼지 ${DUST_LABELS[dust]}`);
  if (snapshot.warnings.length > 0) parts.push(`${snapshot.warnings.join("·")} 특보`);
  return parts.join(" · ");
}

type WeatherNoticeProps =
  | { mode: "demo"; regionName: string | null; decision: WeatherDecision; demoLabel: string }
  | { mode: "loading"; regionName: string | null }
  | { mode: "live"; regionName: string | null; decision: WeatherDecision; days: DayWeather[] };

export function WeatherNotice(props: WeatherNoticeProps) {
  const place = props.regionName ? `${props.regionName} ` : "";

  if (props.mode === "loading") {
    return (
      <section className="weather-notice" aria-labelledby="weather-notice-heading" aria-busy="true">
        <p className="field-label">{place}날씨</p>
        <h3 id="weather-notice-heading">예보를 불러오는 중…</h3>
      </section>
    );
  }

  const { decision } = props;
  const days = props.mode === "live" ? props.days : [];
  const known = days.filter((day) => day.snapshot);
  const missing = days.filter((day) => !day.snapshot);
  const noForecast = props.mode === "live" && known.length === 0;
  const caution = !noForecast && (decision.indoorOnly || decision.excludedTerrains.length > 0);
  const heading = noForecast
    ? "예보 확인 필요"
    : decision.indoorOnly
      ? "실내 위주로 추천해요"
      : decision.excludedTerrains.length > 0
        ? "바다·산·계곡을 빼고 추천해요"
        : "실내·야외를 함께 추천해요";
  const sources = [...new Set(known.map((day) => day.source).filter((s): s is string => Boolean(s)))];

  return (
    <section
      className={`weather-notice${caution ? " is-caution" : ""}${noForecast ? " is-unknown" : ""}`}
      aria-labelledby="weather-notice-heading"
    >
      <p className="field-label">
        {props.mode === "demo" ? `${place}날씨 · ${props.demoLabel} (시연 모드)` : `${place}날씨 · 실제 예보`}
      </p>
      <h3 id="weather-notice-heading">{heading}</h3>
      {noForecast ? (
        <p className="weather-notice-note">
          이 날짜의 예보가 아직 없거나 불러오지 못했어요. 날씨 조건 없이 추천했으니 출발 2~3일 전에 다시 확인해 주세요.
        </p>
      ) : (
        decision.reasons.length > 0 && (
          <ul>
            {decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )
      )}
      {days.length > 0 && !noForecast && (
        <ul className="weather-days">
          {days.map((day) => (
            <li key={day.date}>
              <strong>{dayLabel(day.date)}</strong> {day.snapshot ? daySummary(day.snapshot) : "예보 확인 필요"}
            </li>
          ))}
        </ul>
      )}
      {known.length > 1 && <p className="weather-notice-note">일정 중 가장 나쁜 날씨 값을 기준으로 판정했어요.</p>}
      {missing.length > 0 && known.length > 0 && (
        <p className="weather-notice-note">
          {missing.map((day) => dayLabel(day.date)).join(", ")}은 예보가 없어 판정에서 뺐어요. 출발 전에 다시 확인해 주세요.
        </p>
      )}
      {!noForecast && decision.notices.map((notice) => (
        <p key={notice} className="weather-notice-note">{notice}</p>
      ))}
      {sources.length > 0 && <p className="weather-notice-source">출처: {sources.join(" / ")}</p>}
    </section>
  );
}
