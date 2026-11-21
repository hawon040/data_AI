/**
 * 예상 이동 시간(직선거리 기준 어림값)과 최대 이동 시간 거르기.
 *  - 시간 = 직선거리 ÷ 교통편 속도(config/travelTime.ts). 실제 도로·노선 시간이 아니다.
 *  - 최대 이동 시간은 기본 '상관없음'(거르지 않음). 고르면 그 시간을 넘는 관광지를 뺀다.
 *  - 도보 5km·자전거 15km 거리 제한(origin.ts applyDistanceLimit)은 그대로 따로 적용한다.
 */
import { LONG_TRIP_HOURS, TRAVEL_SPEED_KMH } from "../config/travelTime";
import { formatKm, haversineKm, type Origin } from "./origin";
import { TRANSPORT_OPTIONS, type TransportMode, type TripDuration } from "./tripPreferences";
import type { Attraction, RecommendationItem } from "./types";

export const ESTIMATE_NOTE = "직선거리 기준 어림값";
export const LONG_TRIP_REST_TIP = "2시간마다 15분씩 쉬어 가세요.";
export const LONG_TRIP_PARTY_TIP = "어르신·아이와 함께라면 휴게소에서 자주 쉬어 가세요.";
export const FAR_DAY_TRIP_BADGE = "당일치기로는 먼 곳";
export const TRAVEL_HINT = "어르신·아이와 함께라면 편도 2시간 이내를 권해요";
export const TRAVEL_HINT_BUTTON = "2시간 이내로 보기";
export const MAX_TRAVEL_NEEDS_ORIGIN = "출발지를 정하면 쓸 수 있어요";

/** 예상 편도 시간(시간 단위) */
export function travelHours(km: number, transport: TransportMode): number {
  return km / TRAVEL_SPEED_KMH[transport];
}

/** "약 40분", "약 1시간", "약 3시간 10분" (10분 단위로 반올림, 최소 10분) */
export function formatDuration(hours: number): string {
  const minutes = Math.max(10, Math.round((hours * 60) / 10) * 10);
  if (minutes < 60) return `약 ${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `약 ${h}시간` : `약 ${h}시간 ${m}분`;
}

/** "약 187km · 자가용 약 3시간 10분" */
export function travelLabel(km: number, transport: TransportMode): string {
  const label = TRANSPORT_OPTIONS.find((option) => option.value === transport)?.label ?? "";
  return `${formatKm(km)} · ${label} ${formatDuration(travelHours(km, transport))}`;
}

/** 당일치기인데 편도 2시간을 넘으면 "당일치기로는 먼 곳". 1박 이상이면 표시하지 않는다. */
export function isFarForDayTrip(hours: number | null, duration: TripDuration): boolean {
  return duration === "day" && hours != null && hours > LONG_TRIP_HOURS;
}

/** 편도 2시간을 넘는 곳을 고르면 체크리스트에 더할 휴식 안내 */
export function restTips(hours: number | null, party: { withElderly: boolean; withChildren: boolean }): string[] {
  if (hours == null || hours <= LONG_TRIP_HOURS) return [];
  return [LONG_TRIP_REST_TIP, ...(party.withElderly || party.withChildren ? [LONG_TRIP_PARTY_TIP] : [])];
}

/**
 * '최대 이동 시간' 아래 안내. 60대 이상이나 아이 동반일 때만 안내를 보이고, 값이 '상관없음'(null)이고 출발지가 있을 때만
 * [2시간 이내로 보기] 버튼을 둔다(자동으로 바꾸지 않는다. 이미 다른 값을 골랐으면 안내만).
 */
export function travelHintState(state: {
  withElderly: boolean;
  withChildren: boolean;
  maxTravelHours: number | null;
  hasOrigin: boolean;
}): { show: boolean; showButton: boolean } {
  const show = state.withElderly || state.withChildren;
  return { show, showButton: show && state.hasOrigin && state.maxTravelHours == null };
}

export interface TravelTimeExclusion {
  regionCode: string;
  regionName: string;
  attraction: Attraction;
  km: number;
  hours: number;
}

/** 최대 이동 시간을 넘는 관광지를 빼고, 남는 관광지가 없는 지역은 뺀다. 출발지나 최대 시간이 없으면 그대로. */
export function applyTravelTimeLimit(
  items: RecommendationItem[],
  origin: Origin | null,
  transport: TransportMode,
  maxHours: number | null,
): { items: RecommendationItem[]; excluded: TravelTimeExclusion[] } {
  if (!origin || maxHours == null) return { items, excluded: [] };
  const excluded: TravelTimeExclusion[] = [];
  const kept = items.flatMap((item) => {
    const near = item.topAttractions.filter(({ attraction }) => {
      const km = haversineKm(origin, attraction);
      const hours = travelHours(km, transport);
      if (hours > maxHours) excluded.push({ regionCode: item.region.code, regionName: item.region.name, attraction, km, hours });
      return hours <= maxHours;
    });
    const indoor = item.indoorAlternatives?.filter((a) => travelHours(haversineKm(origin, a), transport) <= maxHours);
    return near.length > 0 ? [{ ...item, topAttractions: near, indoorAlternatives: indoor }] : [];
  });
  return { items: kept, excluded };
}
