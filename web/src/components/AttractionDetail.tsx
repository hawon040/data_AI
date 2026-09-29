import { useEffect, useState } from "react";
import { findRealPlace, hasKakaoRestKey, kakaoDirectionsUrl, kakaoSearchUrl, type PlaceDetail } from "../lib/kakaoLocal";
import type { Attraction } from "../lib/types";

export function AttractionDetail({ attraction }: { attraction: Attraction }) {
  const [place, setPlace] = useState<PlaceDetail | null | undefined>(undefined); // undefined = 조회 중/안 함

  useEffect(() => {
    let cancelled = false;
    if (!hasKakaoRestKey()) {
      setPlace(null);
      return;
    }
    setPlace(undefined);
    findRealPlace(attraction).then((p) => {
      if (!cancelled) setPlace(p);
    });
    return () => {
      cancelled = true;
    };
  }, [attraction]);

  const directionsUrl = kakaoDirectionsUrl(attraction.name, attraction.lat, attraction.lng);
  const placeUrl = place?.placeUrl ?? kakaoSearchUrl(attraction.name);

  return (
    <div className="attraction-detail">
      <div className="ad-head">
        <h4>{attraction.name}</h4>
        <span className="ad-category">{attraction.category}</span>
      </div>

      {hasKakaoRestKey() ? (
        place === undefined ? (
          <p className="ad-loading">실제 위치 정보를 불러오는 중…</p>
        ) : place ? (
          <div className="ad-info">
            <p>{place.roadAddressName || place.addressName}</p>
            {place.phone && <p>{place.phone}</p>}
          </div>
        ) : (
          <p className="ad-hint">카카오맵에서 이 장소를 찾지 못했습니다 — 이름/좌표를 확인하세요.</p>
        )
      ) : (
        <p className="ad-hint">
          실제 주소·전화번호까지 보려면 카카오 로컬 API REST 키를 <code>VITE_KAKAO_REST_API_KEY</code>로
          설정하세요.
        </p>
      )}

      <div className="ad-actions">
        <a className="pill-mini" href={directionsUrl} target="_blank" rel="noreferrer">
          길찾기
        </a>
        <a className="pill-mini ghost" href={placeUrl} target="_blank" rel="noreferrer">
          카카오맵에서 보기
        </a>
      </div>
    </div>
  );
}
