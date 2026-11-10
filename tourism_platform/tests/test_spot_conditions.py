from datetime import datetime

import pytest

from tourism_platform.data import spot_conditions
from tourism_platform.data.apis.weather import KST
from tourism_platform.data.datasets import DATASETS
from tourism_platform.data.spot_conditions import get_spot_conditions, nearest_station

NOW = datetime(2026, 11, 5, 14, 30, tzinfo=KST)

SHORT_FORECAST = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"items": {"item": [
            {"category": c, "fcstDate": "20261105", "fcstTime": t, "fcstValue": v}
            for t, values in {
                "1400": {"POP": "20", "PTY": "0", "TMP": "12"},
                "1500": {"POP": "70", "PTY": "1", "TMP": "11"},
                "1600": {"POP": "80", "PTY": "1", "TMP": "10"},
            }.items()
            for c, v in values.items()
        ]}},
    }
}
WARNING_STATUS = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"items": {"item": [{"t6": "o 건조경보 : 강원도(강릉시평지, 동해시평지)", "tmFc": "202611051000"}]}},
    }
}
STATIONS = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"items": [
            {"stationName": "종로구", "dmX": "37.572025", "dmY": "127.005028"},
            {"stationName": "옥천동", "dmX": "37.7563", "dmY": "128.8994"},
            {"stationName": "좌표없음", "dmX": "", "dmY": ""},
        ]},
    }
}
AIR_REALTIME = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"items": [{"dataTime": "2026-11-05 14:00", "pm10Grade": "2", "pm25Grade": "3"}]},
    }
}


@pytest.fixture
def fake_fetch(monkeypatch):
    calls = []
    responses = {
        "getVilageFcst": SHORT_FORECAST,
        "getPwnStatus": WARNING_STATUS,
        "getMsrstnList": STATIONS,
        "getMsrstnAcctoRltmMesureDnsty": AIR_REALTIME,
    }

    def fetch(config, **params):
        calls.append((config.operation, params))
        return responses[config.operation]

    monkeypatch.setattr(spot_conditions.datagokr_client, "fetch", fetch)
    monkeypatch.setattr(spot_conditions, "_station_cache", None)
    return calls


def test_spot_conditions_combines_forecast_warning_and_air(fake_fetch):
    result = get_spot_conditions(37.7519, 128.8761, region_keywords=["강릉"], now=NOW)

    assert result.errors == {}
    # 14:30이면 14시 예보를 쓴다.
    assert result.forecast.forecast_at == "202611051400"
    assert (result.forecast.pop, result.forecast.pty_label, result.forecast.tmp) == (20, "없음", 12.0)
    assert result.warning.active is True
    assert result.air.station == "옥천동"
    assert (result.air.pm10_label, result.air.pm25_label) == ("보통", "나쁨")

    short_params = next(p for op, p in fake_fetch if op == "getVilageFcst")
    assert (short_params["nx"], short_params["ny"]) == result.grid
    assert (short_params["base_date"], short_params["base_time"]) == ("20261105", "1400")


def test_forecast_uses_next_slot_when_current_hour_missing(fake_fetch):
    result = get_spot_conditions(37.7519, 128.8761, now=datetime(2026, 11, 5, 13, 20, tzinfo=KST))
    # 13시 예보가 없으면 그 뒤 첫 시각(14시)을 쓴다.
    assert result.forecast.forecast_at == "202611051400"


def test_rain_slot_is_reported(fake_fetch):
    result = get_spot_conditions(37.7519, 128.8761, now=datetime(2026, 11, 5, 15, 5, tzinfo=KST))
    assert (result.forecast.pop, result.forecast.pty_label, result.forecast.tmp) == (70, "비", 11.0)


def test_warning_inactive_when_region_not_mentioned(fake_fetch):
    result = get_spot_conditions(37.5665, 126.9780, region_keywords=["서울"], now=NOW)
    assert result.warning.active is False


def test_warning_unknown_without_keywords(fake_fetch):
    result = get_spot_conditions(37.5665, 126.9780, now=NOW)
    assert result.warning.active is None
    assert result.warning.texts  # 원문은 그대로 돌려준다


def test_one_failing_api_keeps_the_others(fake_fetch, monkeypatch):
    original = spot_conditions.datagokr_client.fetch

    def fetch(config, **params):
        if config.operation == "getPwnStatus":
            raise RuntimeError("특보 API 오류")
        return original(config, **params)

    monkeypatch.setattr(spot_conditions.datagokr_client, "fetch", fetch)
    result = get_spot_conditions(37.7519, 128.8761, region_keywords=["강릉"], now=NOW)

    assert result.warning is None
    assert "특보 API 오류" in result.errors["warning"]
    assert result.forecast is not None and result.air is not None


def test_nearest_station_skips_stations_without_coords():
    station, distance = nearest_station(37.57, 127.0, STATIONS["response"]["body"]["items"])
    assert station["stationName"] == "종로구"
    assert distance < 1


def test_weather_and_air_datasets_are_configured():
    for key in ("kma_short_forecast", "kma_mid_land_forecast", "kma_mid_temperature",
                "kma_warning_status", "airkorea_station_realtime", "airkorea_stations"):
        assert DATASETS[key].endpoint and DATASETS[key].operation
