"""데이터 결합·정제 원칙 (문서 5.3).

좌표는 WGS84로 통일하고, 위·경도가 뒤바뀐 값과 한국 영역 밖 좌표, 반경 10m
이내 중복 시설을 걸러낸다. 지자체 표준데이터는 등록한 만큼만 존재하므로
인구·면적 대비 등록 건수가 비정상적으로 낮은 지역은 결측(0이 아님)으로
처리하고, 결측 영역이 전체의 1/3을 넘으면 '평가 불가'로 표시한다.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

# 대한민국 대략적 경계 상자 (위도, 경도) — 이 범위를 벗어나면 이상값으로 간주한다.
KOREA_LAT_RANGE = (33.0, 43.0)
KOREA_LON_RANGE = (124.0, 132.0)


def _in_korea(lat: float, lon: float) -> bool:
    return KOREA_LAT_RANGE[0] <= lat <= KOREA_LAT_RANGE[1] and KOREA_LON_RANGE[0] <= lon <= KOREA_LON_RANGE[1]


def filter_out_of_bounds_coords(
    records: Sequence[dict[str, Any]], lat_key: str = "lat", lon_key: str = "lon"
) -> list[dict[str, Any]]:
    """위·경도가 뒤바뀐 값과 한국 영역 밖 좌표를 걸러낸다.

    lat/lon이 뒤바뀐 경우(예: 위도 127, 경도 37) 자동으로 교정을 시도한 뒤,
    그래도 한국 영역을 벗어나면 제외한다.
    """
    cleaned = []
    for rec in records:
        lat, lon = rec[lat_key], rec[lon_key]
        if _in_korea(lat, lon):
            cleaned.append(rec)
            continue
        if _in_korea(lon, lat):  # 위·경도가 뒤바뀐 경우 교정
            fixed = dict(rec)
            fixed[lat_key], fixed[lon_key] = lon, lat
            cleaned.append(fixed)
        # 둘 다 아니면 이상값으로 제외
    return cleaned


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def dedupe_nearby_facilities(
    records: Sequence[dict[str, Any]],
    lat_key: str = "lat",
    lon_key: str = "lon",
    radius_m: float = 10.0,
) -> list[dict[str, Any]]:
    """반경 radius_m 이내에 있는 시설을 같은 시설로 보고 하나만 남긴다.

    지자체 표준데이터는 같은 시설이 여러 출처로 중복 등록되는 경우가 흔하다.
    """
    kept: list[dict[str, Any]] = []
    for rec in records:
        lat, lon = rec[lat_key], rec[lon_key]
        if any(_haversine_m(lat, lon, k[lat_key], k[lon_key]) <= radius_m for k in kept):
            continue
        kept.append(rec)
    return kept


def flag_low_registration_regions(
    registration_rate: dict[str, float],
    low_threshold_ratio: float = 0.3,
    missing_fraction_limit: float = 1 / 3,
) -> dict[str, str]:
    """지역별 인구·면적 대비 등록 건수 비율로 결측/평가불가 지역을 표시한다.

    registration_rate: 지역코드 -> (해당 지역 등록률) / (전국 평균 등록률).
        전국 평균 대비 low_threshold_ratio 미만이면 '시설이 적은 것'이 아니라
        '등록이 덜 된 것'으로 보고 결측 처리한다 (점수를 0으로 두지 않는다).
    반환값: 지역코드 -> "ok" | "missing" | "평가 불가"
        missing 지역이 전체의 missing_fraction_limit을 넘으면 해당 지역들은
        "평가 불가"로 승격한다.
    """
    status = {
        code: ("missing" if rate < low_threshold_ratio else "ok")
        for code, rate in registration_rate.items()
    }
    missing_count = sum(1 for s in status.values() if s == "missing")
    if registration_rate and missing_count / len(registration_rate) > missing_fraction_limit:
        status = {code: ("평가 불가" if s == "missing" else s) for code, s in status.items()}
    return status
