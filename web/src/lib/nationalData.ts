/**
 * tourapi/api.py 서버의 공공데이터 API를 지도용으로 불러온다.
 *
 * 개발 중에는 vite 프록시가 /tourapi → api.py(기본 127.0.0.1:8000)로,
 * 배포에서는 vercel.json rewrite가 /tourapi → tourapi-demo.vercel.app으로 넘긴다.
 * 인증키는 api.py 서버에만 있고 브라우저로 내려오지 않는다.
 */

const TOURAPI_BASE = "/tourapi";

export interface NationalSpot {
  name: string;
  kind: string;
  province: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number | null;
  parking: number | null;
  phone: string;
  facilities: string;
  intro: string;
  referenceDate: string;
}

export interface NationalShelter {
  name: string;
  province: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number | null;
  shelterType: string;
  altitude: string;
  operating: string;
  contact: string;
}

export interface NationalHospital {
  name: string;
  kind: string;
  province: string;
  district: string;
  address: string;
  contact: string;
}

export interface PetPlace {
  name: string;
  kind: string;
  address: string;
  lat: number;
  lng: number;
  image: string;
  phone: string;
  contentId: string;
  contentTypeId: string;
}

export interface MedicalPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  contentId: string;
}

export interface DemandRow {
  name: string;
  code: string;
  value: number;
  rank: number;
}

export interface MapPlaces {
  province: string;
  provinces: string[];
  spots: NationalSpot[];
  shelters: NationalShelter[];
  hospitals: NationalHospital[];
  medical: MedicalPlace[];
  pets: PetPlace[];
  demand: { baseYm: string; areaName: string; indicatorName: string; areaTotal: number | null; rows: DemandRow[] } | null;
  errors: Record<string, string>;
}

/** 지도에서 고른 장소 — 종류별로 오른쪽 패널 내용이 다르다. */
export type MapSelection =
  | { type: "spot"; place: NationalSpot }
  | { type: "pet"; place: PetPlace }
  | { type: "medical"; place: MedicalPlace };

async function getJson<T>(path: string): Promise<T> {
  // 서버 켜는 방법은 web/README.md에 있다. 자세한 원인은 개발자 도구 콘솔에만 남긴다.
  const failed = (detail: unknown) => {
    console.warn(`tourapi ${path} 요청 실패`, detail);
    return new Error("실시간 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  };
  let response: Response;
  try {
    response = await fetch(`${TOURAPI_BASE}${path}`);
  } catch (error) {
    throw failed(error);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    throw failed(`HTTP ${response.status} ${body?.error ?? ""}`);
  }
  return body as T;
}

const placeRequests = new Map<string, Promise<MapPlaces>>();

/** province가 "all"이면 전국 관광지·의료관광만, 시도면 그 시도의 모든 레이어를 받는다. */
export function loadMapPlaces(province: string): Promise<MapPlaces> {
  const key = province === "all" ? "" : province;
  let request = placeRequests.get(key);
  if (!request) {
    request = getJson<MapPlaces>(`/api/map/places?${new URLSearchParams({ province: key })}`);
    request.catch(() => placeRequests.delete(key));
    placeRequests.set(key, request);
  }
  return request;
}

/** 반려동물 동반 상세(동반 조건·사고 대비사항)는 패널을 열 때만 불러온다. */
export function loadPetDetail(place: PetPlace) {
  const params = new URLSearchParams({ contentId: place.contentId, contentTypeId: place.contentTypeId });
  return getJson<{ pet?: Record<string, string>[] }>(`/api/pet/detail?${params}`);
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestShelter(spot: { lat: number; lng: number }, shelters: NationalShelter[]) {
  let best: { shelter: NationalShelter; distanceKm: number } | null = null;
  for (const shelter of shelters) {
    const distance = distanceKm(spot, shelter);
    if (!best || distance < best.distanceKm) best = { shelter, distanceKm: distance };
  }
  return best;
}

/** 응급의료기관 데이터에는 좌표가 없어 같은 시군구의 기관을 찾는다. */
export function districtHospitals(spot: NationalSpot, hospitals: NationalHospital[]) {
  return hospitals.filter(
    (hospital) => hospital.province === spot.province && hospital.district === spot.district,
  );
}

export function districtDemand(spot: NationalSpot, data: MapPlaces) {
  if (!data.demand || !spot.district) return null;
  const row = data.demand.rows.find((candidate) => candidate.name === spot.district);
  return row ? { row, total: data.demand.rows.length, baseYm: data.demand.baseYm } : null;
}
