"""좌표 계산 공통 함수."""
from __future__ import annotations

import math

EARTH_RADIUS_KM = 6371.0

# 국내 좌표 범위 — 빈 값이나 위경도가 뒤바뀐 좌표를 거리 계산에서 뺄 때 쓴다(tools/api.py와 같은 범위).
KOREA_LAT = (33.0, 39.0)
KOREA_LON = (124.0, 132.0)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 위경도 사이의 대원거리(km)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def valid_korea_coords(lat: object, lon: object) -> tuple[float, float] | None:
    """문자열·숫자 좌표를 float로 바꾸고, 국내 범위를 벗어나면 None."""
    try:
        lat_f, lon_f = float(lat), float(lon)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not (KOREA_LAT[0] <= lat_f <= KOREA_LAT[1] and KOREA_LON[0] <= lon_f <= KOREA_LON[1]):
        return None
    return lat_f, lon_f
