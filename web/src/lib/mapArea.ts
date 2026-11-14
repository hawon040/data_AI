/**
 * "지도에서 볼 지역"(도 → 시·군·구). 지도 관광지·대피소·관광 수요 순위·지도 범위에만 쓰고,
 * 추천 결과는 바꾸지 않는다(추천은 항상 시범 지역 전체에서 고른다).
 */
import { SIGUNGU } from "../data/sigungu";
import type { MapPlaces, NationalShelter, NationalSpot } from "./nationalData";
import type { Region } from "./types";

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

/** 지도에 그릴 레이어. 대피소와 관광 수요 순위는 시·도를 골랐을 때만 보인다. */
export function mapLayers(
  data: Pick<MapPlaces, "spots" | "shelters" | "demand"> | null,
  area: MapArea,
): { spots: NationalSpot[]; shelters: NationalShelter[]; showDemand: boolean } {
  const nationwide = area.province === "all";
  return {
    spots: (data?.spots ?? []).filter((spot) => inDistrict(spot.district, area.district)),
    shelters: nationwide ? [] : (data?.shelters ?? []).filter((shelter) => inDistrict(shelter.district, area.district)),
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
