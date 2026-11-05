"""에어코리아 대기오염정보(미세먼지)·측정소정보 API 설정.

공공데이터포털 상세페이지에서 확인했다(2026-11-05):
    대기오염정보 https://www.data.go.kr/data/15073861/openapi.do
    측정소정보   https://www.data.go.kr/data/15073877/openapi.do
영문 오퍼레이션명은 weather.py와 같은 방법(키 없이 호출해 SERVICE_KEY_IS_NULL 응답 확인)으로
검증했다. 에어코리아는 응답 형식 파라미터가 returnType(xml/json)이다.
"""
from __future__ import annotations

from ..datagokr_client import DatasetConfig

AIR_DATASETS: dict[str, DatasetConfig] = {
    "airkorea_station_realtime": DatasetConfig(
        # 필수: stationName, dataTerm(DAILY/MONTH/3MONTH). 선택: ver.
        # 다른 오퍼레이션: getCtprvnRltmMesureDnsty(시도별 실시간), getMinuDustFrcstDspth(예보통보),
        # getMinuDustWeekFrcstDspth(초미세먼지 주간예보), getUnityAirEnvrnIdexSnstiveAboveMsrstnList.
        name="에어코리아 대기오염정보 - 측정소별 실시간 측정정보 조회",
        portal_url="https://www.data.go.kr/data/15073861/openapi.do",
        endpoint="https://apis.data.go.kr/B552584/ArpltnInforInqireSvc",
        operation="getMsrstnAcctoRltmMesureDnsty",
        extra_params={"returnType": "json", "dataTerm": "DAILY", "ver": "1.0"},
    ),
    "airkorea_stations": DatasetConfig(
        # 측정소 목록. 응답의 dmX·dmY가 WGS84 좌표다. 상세페이지에 위도·경도 구분은 없지만
        # 예시값이 dmX=37.57, dmY=127.00이라 dmX를 위도, dmY를 경도로 본다.
        # TODO: 실제 응답으로 한 번 더 확인하기.
        # 다른 오퍼레이션: getNearbyMsrstnList(TM 좌표 기준 근접 측정소), getTMStdrCrdnt.
        name="에어코리아 측정소정보 - 측정소 목록 조회",
        portal_url="https://www.data.go.kr/data/15073877/openapi.do",
        endpoint="https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc",
        operation="getMsrstnList",
        extra_params={"returnType": "json"},
    ),
}

# pm10Grade·pm25Grade 등급(1~4). 상세페이지에는 뜻이 나와 있지 않다.
# 에어코리아의 통합대기환경지수 4단계 구분을 따랐다.
# TODO: 에어코리아 OpenAPI 기술문서로 확인하기.
GRADE_LABELS: dict[str, str] = {"1": "좋음", "2": "보통", "3": "나쁨", "4": "매우나쁨"}


def sample_params() -> dict[str, dict]:
    """fetch_live가 실제 호출할 때 쓸 예시 파라미터."""
    return {
        "airkorea_station_realtime": {"stationName": "종로구"},
        "airkorea_stations": {"addr": "서울"},
    }
