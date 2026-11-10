"""실제로 연결해야 할 data.go.kr 데이터셋 설정을 한곳에 모은다.

분야별 설정은 apis/ 아래 파일에 나눠 두었다:
    apis/tourism.py  관광지·방문자
    apis/safety.py   안전 (10주차부터 점수 계산에는 쓰지 않음)
    apis/weather.py  기상청 단기예보·중기예보·기상특보
    apis/air.py      에어코리아 미세먼지·측정소

endpoint/operation이 None인 항목은 아직 활용신청 전이라 fetch()가
DatasetNotConfiguredError를 던진다. 신청 승인 후 해당 apis/ 파일에서 두 값만
채우면 datagokr_client.fetch()가 바로 동작한다 — 나머지 코드는 건드릴
필요 없다.
"""
from __future__ import annotations

from typing import Any

from .apis import air, safety, tourism, weather
from .apis import AIR_DATASETS, SAFETY_DATASETS, TOURISM_DATASETS, WEATHER_DATASETS
from .datagokr_client import DatasetConfig

DATASETS: dict[str, DatasetConfig] = {
    **TOURISM_DATASETS,
    **SAFETY_DATASETS,
    **WEATHER_DATASETS,
    **AIR_DATASETS,
}


def live_sample_params() -> dict[str, dict[str, Any]]:
    """필수 파라미터가 있는 데이터셋(방문자 수·응급의료기관·날씨·대기질)을 fetch_live에서 호출할 때 쓸 예시값."""
    return {**tourism.sample_params(), **safety.sample_params(), **weather.sample_params(), **air.sample_params()}
