import { SIGUNGU } from "../data/sigungu";
import { mapProvinces, type MapArea } from "../lib/mapArea";

/** 지도 바로 위 "지도에서 볼 지역" 선택. 추천 결과는 바꾸지 않는다. */
export function MapAreaPicker({
  area,
  provinces,
  onChange,
}: {
  area: MapArea;
  /** 지도 데이터(tourapi)에 있는 시·도 목록 */
  provinces?: string[];
  onChange: (area: MapArea) => void;
}) {
  return (
    <div className="map-area-picker" role="group" aria-label="지도에서 볼 지역">
      <span className="field-title">지도에서 볼 지역</span>
      <select
        aria-label="지도 시·도"
        value={area.province}
        onChange={(e) => onChange({ province: e.target.value, district: "all" })}
      >
        <option value="all">전국</option>
        {mapProvinces(provinces).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select
        aria-label="지도 시·군·구"
        value={area.district}
        disabled={area.province === "all"}
        onChange={(e) => onChange({ ...area, district: e.target.value })}
      >
        <option value="all">전체</option>
        {(SIGUNGU[area.province] ?? []).map(([name]) => <option key={name} value={name}>{name}</option>)}
      </select>
      <span className="map-area-note">지도만 바뀌고 추천 결과는 그대로예요</span>
    </div>
  );
}
