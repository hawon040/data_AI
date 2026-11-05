"""관광지 좌표 하나로 그날의 날씨·특보·미세먼지를 모아 돌려준다.

    from tourism_platform.data.spot_conditions import get_spot_conditions
    get_spot_conditions(37.7519, 128.8761, region_keywords=["강원", "강릉"])

세 가지 정보는 서로 다른 API에서 오므로, 하나가 실패해도 나머지는 채워서 돌려준다.
실패한 항목은 None으로 두고 이유를 errors에 남긴다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable

from . import datagokr_client
from .apis.air import AIR_DATASETS, GRADE_LABELS
from .geo import haversine_km
from .apis.weather import KST, PTY_LABELS, WEATHER_DATASETS, latest_short_base, latlon_to_grid


@dataclass
class Forecast:
    forecast_at: str          # 예보 시각 YYYYMMDDHHMM
    pop: int | None           # 강수확률(%)
    pty: str | None           # 강수형태 코드
    pty_label: str | None     # 강수형태 이름 (없음/비/눈 …)
    tmp: float | None         # 1시간 기온(℃)


@dataclass
class WarningStatus:
    active: bool | None       # region_keywords가 특보 문구에 나오면 True, 키워드가 없으면 None
    matched: list[str]        # 키워드가 들어간 특보 문구
    texts: list[str]          # 특보현황 원문 (전국)


@dataclass
class AirQuality:
    station: str
    distance_km: float
    data_time: str | None
    pm10_grade: str | None
    pm10_label: str | None
    pm25_grade: str | None
    pm25_label: str | None


@dataclass
class SpotConditions:
    lat: float
    lon: float
    grid: tuple[int, int]
    forecast: Forecast | None = None
    warning: WarningStatus | None = None
    air: AirQuality | None = None
    errors: dict[str, str] = field(default_factory=dict)


def _items(data: dict) -> list[dict]:
    """data.go.kr 응답에서 item 목록을 꺼낸다.

    기상청은 body.items.item(목록 또는 1개짜리 dict), 에어코리아는 body.items(목록) 모양이다.
    """
    items = data.get("response", {}).get("body", {}).get("items") or []
    if isinstance(items, dict):
        items = items.get("item") or []
    if isinstance(items, dict):
        items = [items]
    return list(items)


def _to_number(value: Any, kind: type) -> Any:
    try:
        return kind(value)
    except (TypeError, ValueError):
        return None


def get_forecast(nx: int, ny: int, now: datetime) -> Forecast:
    """단기예보에서 now가 속한 정시(없으면 그 뒤 첫 시각)의 강수확률·강수형태·기온을 꺼낸다."""
    base_date, base_time = latest_short_base(now)
    data = datagokr_client.fetch(
        WEATHER_DATASETS["kma_short_forecast"],
        num_of_rows=1000,
        base_date=base_date, base_time=base_time, nx=nx, ny=ny,
    )
    by_time: dict[str, dict[str, str]] = {}
    for item in _items(data):
        slot = f"{item['fcstDate']}{item['fcstTime']}"
        by_time.setdefault(slot, {})[item["category"]] = item["fcstValue"]
    if not by_time:
        raise RuntimeError("단기예보 응답에 예보 항목이 없습니다")

    target = now.astimezone(KST).replace(minute=0, second=0, microsecond=0).strftime("%Y%m%d%H%M")
    slots = sorted(by_time)
    slot = next((s for s in slots if s >= target), slots[-1])
    values = by_time[slot]
    pty = values.get("PTY")
    return Forecast(
        forecast_at=slot,
        pop=_to_number(values.get("POP"), int),
        pty=pty,
        pty_label=PTY_LABELS.get(pty) if pty is not None else None,
        tmp=_to_number(values.get("TMP"), float),
    )


def get_warning_status(region_keywords: Iterable[str] | None) -> WarningStatus:
    """특보현황(최근 7일)에서 지역 키워드가 들어간 특보가 있는지 본다.

    특보현황 응답의 필드 이름은 상세페이지에서 확인하지 못했다. 그래서 item 안의 문자열 값을
    모두 특보 문구로 보고 검색한다.
    TODO: 실제 응답으로 필드(현재 발효 특보와 예비특보)를 확인한 뒤 필요한 필드만 보도록 좁히기.
    """
    data = datagokr_client.fetch(WEATHER_DATASETS["kma_warning_status"], num_of_rows=10)
    texts = [v for item in _items(data) for v in item.values() if isinstance(v, str) and v.strip()]
    keywords = [k for k in (region_keywords or []) if k]
    if not keywords:
        return WarningStatus(active=None, matched=[], texts=texts)
    matched = [t for t in texts if any(k in t for k in keywords)]
    return WarningStatus(active=bool(matched), matched=matched, texts=texts)


def nearest_station(lat: float, lon: float, stations: list[dict]) -> tuple[dict, float]:
    """측정소 목록에서 가장 가까운 측정소와 거리(km). dmX를 위도, dmY를 경도로 본다(air.py 참고)."""
    best: tuple[dict, float] | None = None
    for st in stations:
        s_lat, s_lon = _to_number(st.get("dmX"), float), _to_number(st.get("dmY"), float)
        if s_lat is None or s_lon is None:
            continue
        d = haversine_km(lat, lon, s_lat, s_lon)
        if best is None or d < best[1]:
            best = (st, d)
    if best is None:
        raise RuntimeError("좌표가 있는 측정소가 없습니다")
    return best


_station_cache: list[dict] | None = None


def _all_stations() -> list[dict]:
    """전국 측정소 목록(수백 곳). 자주 바뀌지 않으므로 프로세스 안에서 한 번만 받는다."""
    global _station_cache
    if _station_cache is None:
        data = datagokr_client.fetch(AIR_DATASETS["airkorea_stations"], num_of_rows=1000)
        _station_cache = _items(data)
    return _station_cache


def get_air_quality(lat: float, lon: float) -> AirQuality:
    """가장 가까운 측정소의 최신 미세먼지(PM10)·초미세먼지(PM2.5) 등급."""
    station, distance = nearest_station(lat, lon, _all_stations())
    name = station["stationName"]
    data = datagokr_client.fetch(AIR_DATASETS["airkorea_station_realtime"], num_of_rows=1, stationName=name)
    items = _items(data)
    latest = items[0] if items else {}
    pm10, pm25 = latest.get("pm10Grade"), latest.get("pm25Grade")
    return AirQuality(
        station=name,
        distance_km=round(distance, 1),
        data_time=latest.get("dataTime"),
        pm10_grade=pm10,
        pm10_label=GRADE_LABELS.get(pm10),
        pm25_grade=pm25,
        pm25_label=GRADE_LABELS.get(pm25),
    )


def get_spot_conditions(
    lat: float,
    lon: float,
    *,
    region_keywords: Iterable[str] | None = None,
    now: datetime | None = None,
) -> SpotConditions:
    """관광지 좌표의 강수확률·강수형태·기온, 특보 여부, 미세먼지 등급.

    region_keywords: 특보 문구에서 찾을 지역 이름(예: ["강원", "강릉"]). 관광지 주소의
    시도·시군구를 넘기면 된다. 특보는 좌표가 아니라 지역 이름으로 발표되기 때문이다.
    """
    now = now or datetime.now(KST)
    grid = latlon_to_grid(lat, lon)
    result = SpotConditions(lat=lat, lon=lon, grid=grid)

    steps = {
        "forecast": lambda: get_forecast(*grid, now),
        "warning": lambda: get_warning_status(region_keywords),
        "air": lambda: get_air_quality(lat, lon),
    }
    for name, step in steps.items():
        try:
            setattr(result, name, step())
        except Exception as e:  # noqa: BLE001 — 한 API가 실패해도 나머지 정보는 돌려준다
            result.errors[name] = str(e)
    return result
