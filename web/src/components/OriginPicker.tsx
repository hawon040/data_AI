import { useRef, useState } from "react";
import { SIGUNGU } from "../data/sigungu";
import { geocodeWithKakao } from "../lib/kakaoMapSdk";
import { districtOrigin, locateCurrentPosition, ORIGIN_FALLBACK_MESSAGE, type Origin } from "../lib/origin";

/**
 * 출발지 입력(선택 사항): 시·도 → 시·군·구, 또는 "현재 위치"(브라우저 위치 권한).
 * 좌표는 이 화면 안에서 거리 계산에만 쓰고 서버로 보내거나 저장하지 않는다.
 */
export function OriginPicker({
  origin,
  onChange,
  showLocateButton = true,
}: {
  origin: Origin | null;
  onChange: (origin: Origin | null) => void;
  /** false면 "현재 위치" 버튼을 숨긴다(모바일은 지도의 "◎ 내 위치" 버튼 하나만 쓴다) */
  showLocateButton?: boolean;
}) {
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "locating" | "error"; message?: string }>({ kind: "idle" });
  const provinceRef = useRef<HTMLSelectElement>(null);

  const chooseDistrict = async (nextProvince: string, nextDistrict: string) => {
    setDistrict(nextDistrict);
    if (!nextDistrict) {
      onChange(null);
      return;
    }
    const next = await districtOrigin(nextProvince, nextDistrict, geocodeWithKakao);
    if (next) {
      setStatus({ kind: "idle" });
      onChange(next);
    } else {
      setStatus({ kind: "error", message: "이 시·군·구의 위치를 찾지 못했어요. 다른 곳을 골라 주세요." });
    }
  };

  const locateNow = async () => {
    setStatus({ kind: "locating" });
    const result = await locateCurrentPosition();
    if (result.ok) {
      setProvince("");
      setDistrict("");
      setStatus({ kind: "idle" });
      onChange(result.origin);
    } else {
      setStatus({ kind: "error", message: result.message });
      provinceRef.current?.focus();
    }
  };

  return (
    <fieldset className="origin-field">
      <legend className="field-title">
        출발지 <span className="field-optional">선택</span>
      </legend>
      <div className="origin-controls">
        <select
          ref={provinceRef}
          aria-label="출발지 시·도"
          value={origin?.source === "gps" ? "" : province}
          onChange={(e) => {
            setProvince(e.target.value);
            setDistrict("");
            if (origin) onChange(null);
          }}
        >
          <option value="">시·도</option>
          {Object.keys(SIGUNGU).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select
          aria-label="출발지 시·군·구"
          value={origin?.source === "gps" ? "" : district}
          disabled={!province || origin?.source === "gps"}
          onChange={(e) => void chooseDistrict(province, e.target.value)}
        >
          <option value="">시·군·구</option>
          {(SIGUNGU[province] ?? []).map(([name]) => <option key={name} value={name}>{name}</option>)}
        </select>
        {showLocateButton && (
          <button type="button" className="pill-mini ghost" onClick={() => void locateNow()} disabled={status.kind === "locating"}>
            {status.kind === "locating" ? "위치 확인 중…" : "현재 위치"}
          </button>
        )}
        {origin && (
          <button
            type="button"
            className="remove-btn"
            aria-label="출발지 지우기"
            onClick={() => {
              setProvince("");
              setDistrict("");
              onChange(null);
            }}
          >
            ×
          </button>
        )}
      </div>
      {origin && <p className="origin-state">출발지: {origin.label}</p>}
      {status.kind === "error" && (
        <p className="origin-error" role="alert">{status.message ?? ORIGIN_FALLBACK_MESSAGE}</p>
      )}
    </fieldset>
  );
}
