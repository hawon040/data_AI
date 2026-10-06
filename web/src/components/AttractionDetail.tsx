import { useEffect, useState } from "react";
import { findRealPlace, hasKakaoRestKey, kakaoDirectionsUrl, kakaoSearchUrl, type PlaceDetail } from "../lib/kakaoLocal";
import type { Attraction, Region } from "../lib/types";

const TAG_LABELS: Record<string, string> = {
  history: "역사",
  nature: "자연",
  activity: "체험",
  food: "맛집",
  cafe: "카페",
  shopping: "쇼핑",
  culture: "문화",
  theme_park: "테마파크",
  resort: "리조트",
  view: "전망",
};

export function AttractionDetail({
  attraction,
  region,
  locationLabel,
  seasonalTiming,
  seasonalDescription,
}: {
  attraction: Attraction;
  region: Region | null;
  locationLabel?: string;
  seasonalTiming?: string;
  seasonalDescription?: string;
}) {
  const [lookup, setLookup] = useState<{ attraction: Attraction; place: PlaceDetail | null } | null>(null);
  const place = lookup?.attraction === attraction ? lookup.place : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!hasKakaoRestKey()) return;
    findRealPlace(attraction).then((p) => {
      if (!cancelled) setLookup({ attraction, place: p });
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

      {(locationLabel || region) && (
        <p className="ad-location">{locationLabel ?? `${region?.province} · ${region?.name}`}</p>
      )}
      {seasonalTiming && <p className="ad-location">{seasonalTiming}</p>}
      {seasonalDescription && <p className="ad-hint">{seasonalDescription}</p>}
      <div className="ad-facts">
        {attraction.popularityScore > 0 && (
          <span>인기 지표 <strong>{Math.round(attraction.popularityScore)}/100</strong></span>
        )}
        <span>{attraction.tags.map((tag) => TAG_LABELS[tag] ?? tag).join(" · ")}</span>
        <span>좌표 {attraction.lat.toFixed(4)}, {attraction.lng.toFixed(4)}</span>
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
          {attraction.popularityScore === 0
            ? "실시간 주소·연락처 정보는 연결되지 않았습니다. 지도 링크에서 최신 정보를 확인하세요."
            : "주소와 연락처는 샘플 데이터에 포함되지 않습니다. 지도 링크에서 최신 정보를 확인하세요."}
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
