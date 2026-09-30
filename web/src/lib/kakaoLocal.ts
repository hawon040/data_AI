/**
 * 카카오 로컬 API 연동 + 길찾기/장소 링크 (사용자 요청: 추천 관광지를 실제
 * 음식점·관광지·공원 정보 API로 보강하고, 정확한 위치를 찾아갈 수 있게 한다).
 *
 * 두 가지를 분리했다:
 *  - kakaoDirectionsUrl / kakaoSearchUrl: API 키 없이도 항상 동작하는
 *    카카오맵 웹 링크. 지금 갖고 있는 좌표만으로 "길찾기"가 바로 된다.
 *  - findRealPlace: 카카오 로컬 API(키워드 검색)로 실제 주소·전화번호·
 *    카카오맵 상세페이지 링크를 가져온다. REST API 키가 있을 때만 동작하고,
 *    없거나 호출이 실패하면 null을 반환해 위 두 링크만으로 대체한다.
 */
import type { Attraction } from "./types";

const REST_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY as string | undefined;

export function hasKakaoRestKey(): boolean {
  return !!REST_KEY;
}

/** 길찾기 — 카카오맵 웹/앱에서 이 좌표로 바로 길안내를 시작한다. API 키 불필요. */
export function kakaoDirectionsUrl(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

/** 카카오맵에서 이름으로 검색 — 실제 장소 상세 링크를 못 구했을 때의 대체. */
export function kakaoSearchUrl(name: string): string {
  return `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
}

export interface PlaceDetail {
  id: string;
  placeName: string;
  categoryName: string;
  phone: string;
  addressName: string;
  roadAddressName: string;
  placeUrl: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, PlaceDetail | null>();

/**
 * 카카오 로컬 API 키워드 검색으로 실제 장소 정보를 가져온다. 좌표 근방
 * (반경 3km) + 이름으로 찾아 첫 결과를 쓴다 — 우리 샘플 좌표가 실제 건물
 * 위치와 정확히 일치하지 않을 수 있어서다.
 *
 * 카카오 로컬 API는 REST API 키를 Authorization 헤더로 요구하고, 그 키가
 * 속한 앱의 Web 플랫폼 도메인 등록이 되어 있어야 브라우저에서 바로 호출된다
 * (JavaScript 키와 같은 앱의 REST API 키를 쓰면 도메인 등록을 그대로 재사용한다).
 */
export async function findRealPlace(attraction: Pick<Attraction, "name" | "lat" | "lng">): Promise<PlaceDetail | null> {
  if (!REST_KEY) return null;

  const cacheKey = `${attraction.name}@${attraction.lat},${attraction.lng}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", attraction.name);
  url.searchParams.set("x", String(attraction.lng));
  url.searchParams.set("y", String(attraction.lat));
  url.searchParams.set("radius", "3000");
  url.searchParams.set("size", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) {
      cache.set(cacheKey, null);
      return null;
    }
    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) {
      cache.set(cacheKey, null);
      return null;
    }
    const place: PlaceDetail = {
      id: doc.id,
      placeName: doc.place_name,
      categoryName: doc.category_name,
      phone: doc.phone,
      addressName: doc.address_name,
      roadAddressName: doc.road_address_name,
      placeUrl: doc.place_url,
      lat: Number(doc.y),
      lng: Number(doc.x),
    };
    cache.set(cacheKey, place);
    return place;
  } catch {
    // 네트워크 오류·CORS 차단 등 — 길찾기/검색 링크만으로 대체한다.
    cache.set(cacheKey, null);
    return null;
  }
}
