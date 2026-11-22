/**
 * "지도에서 볼 지역"(도 → 시·군·구). 지도 관광지·대피소·관광 수요 순위·지도 범위에만 쓰고,
 * 추천 결과는 바꾸지 않는다(추천은 항상 시범 지역 전체에서 고른다).
 */
import { SIGUNGU } from "../data/sigungu";
import { haversineKm } from "./origin";
import type { MapPlaces, MedicalPlace, NationalShelter, NationalSpot, PetPlace } from "./nationalData";
import type { Attraction, RecommendationItem, Region } from "./types";

export interface MapArea {
  /** "all"(전국) 또는 시·도 전체 이름 (예: "충청북도") */
  province: string;
  /** "all"(전체) 또는 시·군·구 이름 (예: "청주시") */
  district: string;
}

export const NATIONWIDE: MapArea = { province: "all", district: "all" };

/** 시·도 목록: 데이터에 있는 시·도와 시군구 좌표표의 시·도를 합친다. */
export function mapProvinces(fromData: string[] = []): string[] {
  return [...new Set([...fromData, ...Object.keys(SIGUNGU)])];
}

/** 관광지·대피소의 시군구(예: "청주시")가 고른 시·군·구에 들어가는지. 구까지 있는 이름("청주시 상당구")도 맞춘다. */
export function inDistrict(placeDistrict: string, district: string): boolean {
  if (district === "all") return true;
  if (!placeDistrict) return false;
  return district.startsWith(placeDistrict) || placeDistrict.startsWith(district);
}

/** 추천 카드(지역)를 눌렀을 때 지도에서 볼 지역. 시군구 좌표표에서 가장 길게 맞는 이름을 고른다. */
export function mapAreaForRegion(region: Pick<Region, "province" | "name">): MapArea {
  const names = (SIGUNGU[region.province] ?? []).map(([name]) => name);
  const match = names
    .filter((name) => region.name === name || region.name.startsWith(`${name} `) || region.name.startsWith(name))
    .sort((a, b) => b.length - a.length)[0];
  return { province: region.province, district: match ?? "all" };
}

/** 주소("충청북도 청주시 상당구 …")의 앞쪽 낱말에 고른 시·군·구 이름이 있는지. "청주시"를 고르면 "청주시 상당구·서원구…"도 들어간다. */
export function addressInDistrict(address: string, district: string): boolean {
  if (district === "all") return true;
  return address.split(/\s+/).slice(0, 3).some((word) => word === district || word.startsWith(district));
}

/**
 * 좌표에서 가장 가까운 시군구 대표점(data/sigungu.ts)의 이름. 의료관광 정보는 주소가 영어라 이름으로 시군구를 가를 수 없어
 * 이 방법으로 나눈다(대표점 기준이라 경계 근처는 옆 시군구로 갈 수 있는 근사치다).
 */
export function nearestDistrict(province: string, point: { lat: number; lng: number }): string | null {
  let best: { name: string; km: number } | null = null;
  for (const [name, lat, lng] of SIGUNGU[province] ?? []) {
    const km = haversineKm(point, { lat, lng });
    if (!best || km < best.km) best = { name, km };
  }
  return best?.name ?? null;
}

/** 목록 제목에 쓸 범위 이름: 시군구를 골랐으면 시군구, 도만 골랐으면 도, 아니면 "전국" */
export function areaLabel(area: MapArea): string {
  if (area.province === "all") return "전국";
  return area.district === "all" ? area.province : area.district;
}

/** 추천 지역이 지도에서 고른 지역 안에 있는지 (지도 목록 맨 위 추천 줄에 쓴다) */
export function regionInArea(region: Pick<Region, "province" | "name">, area: MapArea): boolean {
  if (area.province === "all") return true;
  if (region.province !== area.province) return false;
  return area.district === "all" || mapAreaForRegion(region).district === area.district;
}

/** 지도에 그릴 레이어. 대피소와 관광 수요 순위는 시·도를 골랐을 때만 보인다. 시·군·구를 고르면 모두 그 시군구로 좁힌다. */
export function mapLayers(
  data: Pick<MapPlaces, "spots" | "shelters" | "demand"> & Partial<Pick<MapPlaces, "pets" | "medical">> | null,
  area: MapArea,
): { spots: NationalSpot[]; shelters: NationalShelter[]; pets: PetPlace[]; medical: MedicalPlace[]; showDemand: boolean } {
  const nationwide = area.province === "all";
  const byDistrict = area.district !== "all" && !nationwide;
  return {
    spots: (data?.spots ?? []).filter((spot) => inDistrict(spot.district, area.district)),
    shelters: nationwide ? [] : (data?.shelters ?? []).filter((shelter) => inDistrict(shelter.district, area.district)),
    pets: (data?.pets ?? []).filter((place) => !byDistrict || addressInDistrict(place.address, area.district)),
    medical: (data?.medical ?? []).filter((place) => !byDistrict || nearestDistrict(area.province, place) === area.district),
    showDemand: !nationwide && data?.demand != null,
  };
}

/**
 * 관광지 버튼을 눌렀을 때: 그 관광지가 속한 시범 지역과, 지도에서 볼 지역(그 지역의 도·시군구).
 * 시범 지역에 없는 관광지(카카오 주변 장소 등)는 지역·지도 지역을 바꾸지 않는다(null).
 */
export function selectionForAttraction(
  attraction: { name: string },
  regions: Region[],
): { region: Region; area: MapArea } | null {
  const region = regions.find((candidate) => candidate.attractions.some((item) => item.name === attraction.name));
  return region ? { region, area: mapAreaForRegion(region) } : null;
}

/** 지도 목록 맨 위 추천 요약 줄에 쓸 관광지: 화면의 추천 카드와 같은 결과(목적·날씨·거리·동행자로 걸러진 것) */
export function regionSummaryAttractions(items: RecommendationItem[], limit = 4): Map<string, Attraction[]> {
  const map = new Map<string, Attraction[]>();
  for (const item of items) {
    if (!map.has(item.region.code)) map.set(item.region.code, item.topAttractions.slice(0, limit).map(({ attraction }) => attraction));
  }
  return map;
}
