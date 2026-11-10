import { useEffect, useState } from "react";
import {
  districtDemand,
  districtHospitals,
  loadPetDetail,
  nearestShelter,
  type MapPlaces,
  type MapSelection,
  type NationalSpot,
  type PetPlace,
} from "../lib/nationalData";

/** 해일대피소는 해안 가까운 관광지에만 의미가 있어 이 거리 안쪽만 보여준다. */
const SHELTER_RADIUS_KM = 10;

const PET_FIELDS: [string, string][] = [
  ["acmpyTypeCd", "동반 구분"],
  ["acmpyPsblCpam", "동반 가능 동물"],
  ["acmpyNeedMtr", "동반 시 필요사항"],
  ["relaAcdntRiskMtr", "사고 대비사항"],
  ["relaPosesFclty", "관련 구비시설"],
  ["etcAcmpyInfo", "기타 동반 정보"],
];

function formatCount(value: number | null, unit: string) {
  return value == null ? "정보 없음" : `${value.toLocaleString("ko-KR")}${unit}`;
}

function cleanText(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function directionsUrl(name: string, lat: number, lng: number) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

function NearbyShelter({ point, data }: { point: { lat: number; lng: number }; data: MapPlaces }) {
  const shelter = nearestShelter(point, data.shelters);
  if (!shelter || shelter.distanceKm > SHELTER_RADIUS_KM) {
    return <span>{SHELTER_RADIUS_KM}km 안에 지정된 대피소가 없어요 (해안 지역만 지정).</span>;
  }
  const { shelter: place, distanceKm } = shelter;
  return (
    <span>
      {place.name} · {distanceKm.toFixed(1)}km
      {place.capacity != null && ` · 수용 ${place.capacity.toLocaleString("ko-KR")}명`}
      {place.altitude && ` · 해발 ${place.altitude}m`}
    </span>
  );
}

function SpotBody({ spot, data }: { spot: NationalSpot; data: MapPlaces }) {
  const hospitals = districtHospitals(spot, data.hospitals);
  const demand = districtDemand(spot, data);
  return (
    <>
      <dl className="nsp-facts">
        <div>
          <dt>수용인원</dt>
          <dd>{formatCount(spot.capacity, "명")}</dd>
        </div>
        <div>
          <dt>주차</dt>
          <dd>{formatCount(spot.parking, "대")}</dd>
        </div>
        <div>
          <dt>관광수요</dt>
          <dd>{demand ? `${demand.total}곳 중 ${demand.row.rank}위` : "정보 없음"}</dd>
        </div>
      </dl>
      {spot.intro && <p className="nsp-intro">{spot.intro}</p>}
      {spot.facilities && <p className="nsp-facilities">편의시설: {spot.facilities}</p>}
      {spot.phone && <p className="nsp-facilities">문의: {spot.phone}</p>}

      <h4>안전 정보</h4>
      <ul className="nsp-safety">
        <li>
          <strong>응급의료기관</strong>
          {hospitals.length ? (
            <span>
              같은 {spot.district || spot.province}에 {hospitals.length}곳 —{" "}
              {hospitals
                .slice(0, 3)
                .map((hospital) => `${hospital.name}${hospital.contact ? ` (${hospital.contact})` : ""}`)
                .join(", ")}
              {hospitals.length > 3 && " 외"}
            </span>
          ) : (
            <span className="nsp-warning">같은 시군구에 등록된 응급의료기관이 없어요. 이동 거리를 미리 확인하세요.</span>
          )}
        </li>
        <li>
          <strong>지진해일대피소</strong>
          <NearbyShelter point={spot} data={data} />
        </li>
        {demand && (
          <li>
            <strong>혼잡 참고</strong>
            <span>
              {demand.baseYm.slice(0, 4)}년 {Number(demand.baseYm.slice(4))}월 관광서비스 수요지수{" "}
              {demand.row.value.toFixed(1)} — {demand.row.rank <= 3 ? "사람이 많이 몰리는 지역이에요." : "도내 중간 이하 수준이에요."}
            </span>
          </li>
        )}
      </ul>
      <p className="nsp-source">
        출처: 전국관광지정보표준데이터{spot.referenceDate && ` (기준일 ${spot.referenceDate})`} · 한국문화정보원
        관광지 안전정보 · 한국관광공사 관광수요지수. 거리는 직선거리입니다.
      </p>
    </>
  );
}

function PetBody({ place, data }: { place: PetPlace; data: MapPlaces }) {
  const [detail, setDetail] = useState<{ key: string; fields: [string, string][] | null; error?: string }>({
    key: "",
    fields: null,
  });
  const loaded = detail.key === place.contentId;

  useEffect(() => {
    let cancelled = false;
    loadPetDetail(place)
      .then((response) => {
        if (cancelled) return;
        const record = response.pet?.[0] ?? {};
        const fields = PET_FIELDS.flatMap(([key, label]): [string, string][] => {
          const value = cleanText(record[key] ?? "");
          return value ? [[label, value.replace(/\s*- /g, "\n- ").trim()]] : [];
        });
        setDetail({ key: place.contentId, fields });
      })
      .catch((error: Error) => {
        if (!cancelled) setDetail({ key: place.contentId, fields: [], error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [place]);

  return (
    <>
      {place.image && <img className="nsp-image" src={place.image} alt="" loading="lazy" />}
      {place.phone && <p className="nsp-facilities">문의: {cleanText(place.phone)}</p>}
      <h4>반려동물 동반 안전수칙</h4>
      {!loaded ? (
        <p className="nsp-facilities">동반 정보를 불러오는 중…</p>
      ) : detail.error ? (
        <p className="nsp-warning">{detail.error}</p>
      ) : detail.fields?.length ? (
        <dl className="nsp-rules">
          {detail.fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="nsp-facilities">등록된 동반 조건이 없어요. 방문 전 시설에 확인하세요.</p>
      )}
      <h4>안전 정보</h4>
      <ul className="nsp-safety">
        <li>
          <strong>지진해일대피소</strong>
          <NearbyShelter point={place} data={data} />
        </li>
      </ul>
      <p className="nsp-source">출처: 한국관광공사 반려동물 동반여행 서비스 · 한국문화정보원 관광지 안전정보.</p>
    </>
  );
}

export function NationalSpotPanel({
  selection,
  data,
  onClose,
}: {
  selection: MapSelection;
  data: MapPlaces;
  onClose: () => void;
}) {
  const { place } = selection;
  const kind =
    selection.type === "spot"
      ? selection.place.kind
      : selection.type === "pet"
        ? `반려동물 동반 · ${selection.place.kind}`
        : "의료 관광기관";

  return (
    <section className={`national-spot-panel is-${selection.type}`} aria-labelledby="national-spot-name">
      <div className="nsp-head">
        <div>
          <span className="nsp-kind">{kind}</span>
          <h3 id="national-spot-name">{place.name}</h3>
          <p className="nsp-address">{place.address}</p>
        </div>
        <button type="button" className="nsp-close" onClick={onClose} aria-label="장소 정보 닫기">
          ×
        </button>
      </div>

      {selection.type === "spot" && <SpotBody spot={selection.place} data={data} />}
      {selection.type === "pet" && <PetBody place={selection.place} data={data} />}
      {selection.type === "medical" && (
        <>
          {selection.place.phone && <p className="nsp-facilities">문의: {selection.place.phone}</p>}
          <p className="nsp-facilities">
            외국인 환자 유치 의료기관입니다. 응급 상황에는 119 또는 가까운 응급의료기관을 이용하세요.
          </p>
          <p className="nsp-source">출처: 한국관광공사 의료관광 정보 서비스.</p>
        </>
      )}

      <div className="ad-actions">
        <a className="pill-mini" href={directionsUrl(place.name, place.lat, place.lng)} target="_blank" rel="noreferrer">
          카카오맵 길찾기
        </a>
      </div>
    </section>
  );
}
