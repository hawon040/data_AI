/**
 * 카카오 지도 JavaScript SDK 불러오기(지도·클러스터·주소 검색).
 * 지도(MapView)와 출발지 주소 검색(origin.ts의 geocodeWithKakao)이 같은 SDK를 한 번만 불러 쓴다.
 */
export const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;

let sdkRequest: Promise<void> | null = null;

export function loadKakaoSdk(appKey: string): Promise<void> {
  if (window.kakao?.maps) return Promise.resolve();
  sdkRequest ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=clusterer,services&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => {
      sdkRequest = null;
      reject(new Error("카카오맵 SDK 로드 실패"));
    };
    document.head.appendChild(script);
  });
  return sdkRequest;
}

/** 주소를 좌표로 바꾼다(카카오 Geocoder). 지도 키가 없거나 찾지 못하면 null. */
export async function geocodeWithKakao(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_MAP_KEY) return null;
  try {
    await loadKakaoSdk(KAKAO_MAP_KEY);
  } catch {
    return null;
  }
  const services = window.kakao?.maps?.services;
  if (!services) return null;
  return new Promise((resolve) => {
    new services.Geocoder().addressSearch(address, (result: { x: string; y: string }[], status: string) => {
      if (status !== services.Status.OK || result.length === 0) {
        resolve(null);
        return;
      }
      resolve({ lat: Number(result[0].y), lng: Number(result[0].x) });
    });
  });
}
