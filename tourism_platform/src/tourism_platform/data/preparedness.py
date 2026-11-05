"""대비 정보: 관광지에서 가장 가까운 응급의료기관·지진해일대피소·관광안내소와 거리.

    from tourism_platform.data.preparedness import fetch_preparedness, load_info_centers
    centers = load_info_centers("data/raw/tourist_info_centers.csv")
    fetch_preparedness(37.7519, 128.8761, info_centers=centers)

거리는 하버사인(대원거리) 직선거리다. 실제 이동 거리·시간과는 다르다.

데이터 출처
    응급의료기관   국립중앙의료원 응급의료기관 위치정보 조회 (apis/safety.py emergency_facilities)
    지진해일대피소 한국문화정보원 관광지 안전정보 (apis/safety.py kcisa_tour_safety)
    관광안내소     전국관광안내소표준데이터 (apis/tourism.py tourist_info_centers — Open API는 활용신청 후,
                   그 전에는 포털 CSV를 load_info_centers()로 읽는다)
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from . import datagokr_client
from .apis.safety import SAFETY_DATASETS
from .geo import haversine_km, valid_korea_coords


@dataclass(frozen=True)
class Facility:
    kind: str        # "응급의료기관" / "지진해일대피소" / "관광안내소"
    name: str
    lat: float
    lon: float
    address: str = ""
    phone: str = ""


@dataclass(frozen=True)
class NearestFacility:
    facility: Facility
    distance_km: float


@dataclass
class Preparedness:
    lat: float
    lon: float
    emergency: NearestFacility | None = None
    shelter: NearestFacility | None = None
    info_center: NearestFacility | None = None
    errors: dict[str, str] = field(default_factory=dict)


def nearest_facility(lat: float, lon: float, facilities: Iterable[Facility]) -> NearestFacility | None:
    """facilities 중 (lat, lon)에서 하버사인 거리가 가장 가까운 곳. 후보가 없으면 None."""
    best: NearestFacility | None = None
    for facility in facilities:
        distance = haversine_km(lat, lon, facility.lat, facility.lon)
        if best is None or distance < best.distance_km:
            best = NearestFacility(facility, distance)
    if best is None:
        return None
    return NearestFacility(best.facility, round(best.distance_km, 2))


def nearest_preparedness(
    lat: float,
    lon: float,
    *,
    hospitals: Iterable[Facility] = (),
    shelters: Iterable[Facility] = (),
    info_centers: Iterable[Facility] = (),
) -> Preparedness:
    """이미 받아 둔 시설 목록으로 세 종류의 가장 가까운 시설을 고른다(네트워크 호출 없음)."""
    return Preparedness(
        lat=lat,
        lon=lon,
        emergency=nearest_facility(lat, lon, hospitals),
        shelter=nearest_facility(lat, lon, shelters),
        info_center=nearest_facility(lat, lon, info_centers),
    )


# ---------------------------------------------------------------------------
# 원본 데이터 → Facility. 좌표가 비었거나 국내 범위를 벗어난 항목은 뺀다.
# ---------------------------------------------------------------------------

def _facility(kind: str, name: str, lat: object, lon: object, address: str = "", phone: str = "") -> Facility | None:
    coords = valid_korea_coords(lat, lon)
    if coords is None or not name:
        return None
    return Facility(kind=kind, name=name, lat=coords[0], lon=coords[1], address=address, phone=phone)


def hospitals_from_items(items: Iterable[dict]) -> list[Facility]:
    """응급의료기관 위치정보 조회 응답 item → Facility."""
    out = [
        _facility("응급의료기관", it.get("dutyName", ""), it.get("latitude"), it.get("longitude"),
                  it.get("dutyAddr", ""), it.get("dutyTel1", ""))
        for it in items
    ]
    return [f for f in out if f]


def shelters_from_kcisa(items: Iterable[dict]) -> list[Facility]:
    """관광지 안전정보 item 중 지진해일대피소만 → Facility."""
    out = [
        _facility("지진해일대피소", it.get("tourName", ""), it.get("lat"), it.get("lon"),
                  it.get("address2") or it.get("address", ""), it.get("operateContact") or it.get("contact", ""))
        for it in items
        if it.get("subject") == "지진해일대피소"
    ]
    return [f for f in out if f]


def info_centers_from_rows(rows: Iterable[dict]) -> list[Facility]:
    """전국관광안내소표준데이터 행 → Facility. 열 이름은 포털 상세페이지의 항목명을 따른다."""
    out = [
        _facility("관광안내소", (row.get("관광안내소명") or "").strip(), row.get("위도"), row.get("경도"),
                  (row.get("소재지도로명주소") or row.get("소재지지번주소") or "").strip(),
                  (row.get("안내소전화번호") or "").strip())
        for row in rows
    ]
    return [f for f in out if f]


def load_info_centers(csv_path: str | Path) -> list[Facility]:
    """내려받은 관광안내소 CSV를 읽는다. 포털 CSV는 보통 CP949라 UTF-8이 안 되면 CP949로 다시 읽는다."""
    for encoding in ("utf-8-sig", "cp949"):
        try:
            with open(csv_path, encoding=encoding, newline="") as f:
                return info_centers_from_rows(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"{csv_path}를 UTF-8·CP949 어느 쪽으로도 읽지 못했습니다")


def _items(data: dict) -> list[dict]:
    items = data.get("response", {}).get("body", {}).get("items") or []
    if isinstance(items, dict):
        items = items.get("item") or []
    return [items] if isinstance(items, dict) else list(items)


_shelter_cache: list[Facility] | None = None


def _all_shelters() -> list[Facility]:
    """관광지 안전정보 전체(1,500여 건, tools/api.py와 같은 3,000행 한 번 요청)에서 대피소만. 프로세스 안에서 한 번만 받는다."""
    global _shelter_cache
    if _shelter_cache is None:
        data = datagokr_client.fetch(SAFETY_DATASETS["kcisa_tour_safety"], num_of_rows=3000)
        _shelter_cache = shelters_from_kcisa(_items(data))
    return _shelter_cache


def fetch_preparedness(lat: float, lon: float, *, info_centers: Iterable[Facility] = ()) -> Preparedness:
    """API를 호출해 가장 가까운 응급의료기관·지진해일대피소를 찾고, 관광안내소는 넘겨받은 목록에서 찾는다.

    하나가 실패해도 나머지는 채워서 돌려주고, 실패 이유는 errors에 남긴다.
    """
    result = Preparedness(lat=lat, lon=lon)
    try:
        data = datagokr_client.fetch(
            SAFETY_DATASETS["emergency_facilities"], num_of_rows=10, WGS84_LAT=lat, WGS84_LON=lon,
        )
        result.emergency = nearest_facility(lat, lon, hospitals_from_items(_items(data)))
    except Exception as e:  # noqa: BLE001 — 한 데이터가 실패해도 나머지 대비 정보는 돌려준다
        result.errors["emergency"] = str(e)
    try:
        result.shelter = nearest_facility(lat, lon, _all_shelters())
    except Exception as e:  # noqa: BLE001
        result.errors["shelter"] = str(e)
    result.info_center = nearest_facility(lat, lon, info_centers)
    if result.info_center is None:
        result.errors["info_center"] = "관광안내소 목록이 비어 있습니다. load_info_centers()로 CSV를 불러와 넘기세요."
    return result
