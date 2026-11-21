/**
 * 출발지(현재 위치 또는 시·군·구)와 거리.
 *  - 추천 순위 계산은 바꾸지 않는다. 직선거리를 보여 주고, 도보·자전거일 때만 먼 관광지를 뺀다.
 *  - 좌표는 브라우저 안에서만 쓴다. 서버로 보내거나 저장하지 않는다.
 */
import { MAX_DISTANCE_KM } from "../config/travelDistance";
import { SIGUNGU } from "../data/sigungu";
import type { RankingMode, TransportMode, TripDuration } from "./tripPreferences";
import type { Attraction, RecommendationItem } from "./types";

export interface Origin {
  /** 화면에 보여 줄 이름 (예: "현재 위치", "충청북도 청주시") */
  label: string;
  lat: number;
  lng: number;
  source: "gps" | "district";
  /** 현재 위치(gps)일 때 브라우저가 알려 준 오차 반경(m, coords.accuracy) */
  accuracy?: number;
}

export const ORIGIN_FALLBACK_MESSAGE = "출발지를 직접 골라 주세요";
export const NEEDS_ORIGIN_MESSAGE = "도보·자전거는 출발지를 정해야 가까운 곳을 추천할 수 있어요";
export const NO_NEARBY_MESSAGE = "출발지 근처에 추천할 곳이 없어요. 교통편을 바꿔 보세요";
/** 현재 위치 오차가 이 값(m)을 넘으면 정확하지 않을 수 있다고 안내한다 */
export const LOW_ACCURACY_M = 1000;
export const LOW_ACCURACY_MESSAGE = "위치가 정확하지 않을 수 있어요";
/** 현재 위치를 쓸 때 브라우저 위치 옵션: 정확한 위치(GPS)를 새로 받고, 최대 15초 기다린다 */
export const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };

/** 현재 위치의 오차가 커서(1000m 초과) 안내가 필요한지 */
export function isLowAccuracy(origin: Pick<Origin, "source" | "accuracy"> | null): boolean {
  return origin?.source === "gps" && origin.accuracy != null && origin.accuracy > LOW_ACCURACY_M;
}

/** 두 좌표 사이의 직선거리(km, 하버사인 공식, 지구 반지름 6371km) */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "약 12km" (10km 미만은 소수 한 자리) */
export function formatKm(km: number): string {
  const value = km < 10 ? Math.max(0.1, Math.round(km * 10) / 10).toFixed(1) : Math.round(km).toLocaleString("ko-KR");
  return `약 ${value}km`;
}

/** "출발지에서 약 12km" */
export function formatDistance(km: number): string {
  return `출발지에서 ${formatKm(km)}`;
}

/** 지역 카드의 추천 관광지 중 출발지에서 가장 가까운 곳까지 거리(km). 관광지가 없으면 null */
export function nearestAttractionKm(item: Pick<RecommendationItem, "topAttractions">, origin: Origin): number | null {
  if (item.topAttractions.length === 0) return null;
  return Math.min(...item.topAttractions.map(({ attraction }) => haversineKm(origin, attraction)));
}

/** 가까운 순: 지역 안 추천 관광지 중 가장 가까운 곳의 거리로 정렬한다(같으면 원래 순서). 점수는 바꾸지 않는다. */
export function sortByNearest(items: RecommendationItem[], origin: Origin): RecommendationItem[] {
  return items
    .map((item, index) => ({ item, index, km: nearestAttractionKm(item, origin) ?? haversineKm(origin, item.region) }))
    .sort((a, b) => a.km - b.km || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * 실제로 쓸 추천 순서. 출발지가 있고 당일치기면 기본값을 "가까운 순"으로 하고, 사용자가 직접 바꿨으면 그대로 둔다.
 * 출발지가 없으면 "가까운 순"은 쓸 수 없어 연령대·동행 선호로 돌아간다.
 */
export function effectiveRanking(state: {
  stored: RankingMode;
  touched: boolean;
  hasOrigin: boolean;
  duration: TripDuration;
}): RankingMode {
  const { stored, touched, hasOrigin, duration } = state;
  if (!touched) return hasOrigin && duration === "day" ? "nearest" : stored === "nearest" ? "companion" : stored;
  return stored === "nearest" && !hasOrigin ? "companion" : stored;
}

export const NEAREST_NEEDS_ORIGIN = "출발지를 정하면 쓸 수 있어요";

/** 저장소의 시군구 좌표(data/sigungu.ts)에서 찾는다. 없으면 null. */
export function districtCoords(province: string, district: string): { lat: number; lng: number } | null {
  const row = SIGUNGU[province]?.find(([name]) => name === district);
  return row ? { lat: row[1], lng: row[2] } : null;
}

/** 시·군·구 출발지. 좌표표에 없으면 주소 검색(geocode, 기본은 카카오 Geocoder)으로 구한다. */
export async function districtOrigin(
  province: string,
  district: string,
  geocode: (address: string) => Promise<{ lat: number; lng: number } | null>,
): Promise<Origin | null> {
  const coords = districtCoords(province, district) ?? (await geocode(`${province} ${district}`));
  return coords ? { label: `${province} ${district}`, ...coords, source: "district" } : null;
}

type GeolocationLike = Pick<Geolocation, "getCurrentPosition">;

/** 브라우저 현재 위치. 권한을 거부하거나 실패하면 ok: false와 "출발지를 직접 골라 주세요". */
export function locateCurrentPosition(
  geolocation: GeolocationLike | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation,
  options: PositionOptions = GEOLOCATION_OPTIONS,
): Promise<{ ok: true; origin: Origin } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    if (!geolocation) {
      resolve({ ok: false, message: ORIGIN_FALLBACK_MESSAGE });
      return;
    }
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          origin: {
            label: "현재 위치",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            source: "gps",
            accuracy: position.coords.accuracy,
          },
        }),
      () => resolve({ ok: false, message: ORIGIN_FALLBACK_MESSAGE }),
      options,
    );
  });
}

export interface DistanceExclusion {
  regionCode: string;
  regionName: string;
  attraction: Attraction;
  km: number;
}

export interface DistanceResult {
  items: RecommendationItem[];
  excluded: DistanceExclusion[];
  /** 이 교통편의 거리 기준(km). 거르지 않는 교통편이면 null */
  limitKm: number | null;
  /** 도보·자전거인데 출발지가 없어 거르지 못했을 때 true */
  needsOrigin: boolean;
}

/**
 * 도보·자전거면 출발지에서 기준보다 먼 관광지를 빼고, 남는 관광지가 없는 지역은 추천에서 뺀다.
 * 그 밖의 교통편이나 출발지가 없으면 그대로 돌려준다.
 */
export function applyDistanceLimit(
  items: RecommendationItem[],
  origin: Origin | null,
  transport: TransportMode,
): DistanceResult {
  const limitKm = MAX_DISTANCE_KM[transport] ?? null;
  if (limitKm == null) return { items, excluded: [], limitKm, needsOrigin: false };
  if (!origin) return { items, excluded: [], limitKm, needsOrigin: true };

  const excluded: DistanceExclusion[] = [];
  const kept = items.flatMap((item) => {
    const near = item.topAttractions.filter(({ attraction }) => {
      const km = haversineKm(origin, attraction);
      if (km > limitKm) excluded.push({ regionCode: item.region.code, regionName: item.region.name, attraction, km });
      return km <= limitKm;
    });
    const indoor = item.indoorAlternatives?.filter((attraction) => haversineKm(origin, attraction) <= limitKm);
    return near.length > 0 ? [{ ...item, topAttractions: near, indoorAlternatives: indoor }] : [];
  });
  return { items: kept, excluded, limitKm, needsOrigin: false };
}
