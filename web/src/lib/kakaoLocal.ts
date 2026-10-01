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
import type { Attraction, AttractionTag } from "./types";

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

/**
 * 지역 안 관광지를 10개 안팎으로 직접 큐레이션해둔 것만으로는 다양성이
 * 부족하다는 피드백에 따라, 카카오 로컬 API의 카테고리 검색(장소 이름을
 * 몰라도 좌표 반경 안의 실제 장소를 가져옴)으로 관광명소·문화시설·음식점·
 * 카페를 추가로 찾아온다.
 *
 * 카카오 카테고리 검색은 방문자 수 같은 인기 지표를 주지 않으므로, 검색
 * 정확도(accuracy) 순위를 근사 인기 점수로 대신 쓴다 — 실측치가 아니라는
 * 한계를 호출부에서 "실시간 · 참고용"으로 표시해 숨기지 않는다.
 */
const CATEGORY_INFO: Record<string, { tags: AttractionTag[]; label: string }> = {
  AT4: { tags: ["view", "culture"], label: "관광명소" },
  CT1: { tags: ["culture"], label: "문화시설" },
  FD6: { tags: ["food"], label: "음식점" },
  CE7: { tags: ["cafe"], label: "카페" },
};

export async function findNearbyAttractions(lat: number, lng: number, radius = 5000): Promise<Attraction[]> {
  if (!REST_KEY) return [];

  const perCategory = await Promise.all(
    Object.entries(CATEGORY_INFO).map(async ([code, info]) => {
      const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
      url.searchParams.set("category_group_code", code);
      url.searchParams.set("x", String(lng));
      url.searchParams.set("y", String(lat));
      url.searchParams.set("radius", String(radius));
      url.searchParams.set("sort", "accuracy");
      url.searchParams.set("size", "5");

      try {
        const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${REST_KEY}` } });
        if (!res.ok) return [];
        const data = await res.json();
        const docs = (data.documents ?? []) as Array<{ place_name: string; x: string; y: string }>;
        return docs.map(
          (d, i): Attraction => ({
            name: d.place_name,
            category: info.label,
            tags: info.tags,
            lat: Number(d.y),
            lng: Number(d.x),
            popularityScore: Math.max(40, 95 - i * 12), // 검색 순위 기반 근사치
            source: "kakao",
          }),
        );
      } catch {
        // 네트워크 오류·CORS 차단 등 — 이 카테고리만 빈 목록으로 넘어간다.
        return [];
      }
    }),
  );

  return perCategory.flat();
}
