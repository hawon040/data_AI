"""안전 관련 data.go.kr 데이터셋 설정.

10주차 방향 전환(2026-11-05)으로 범죄율·사고율 기반 지역 안전도 점수는 서비스에서
뺐다. 경찰청 범죄 통계 설정은 지웠고(2026-11-06), 응급의료기관·지진해일대피소처럼
"대비 정보"로 보여 줄 항목만 연동한다.
"""
from __future__ import annotations

from ..datagokr_client import DatasetConfig

SAFETY_DATASETS: dict[str, DatasetConfig] = {
    "pedestrian_accidents": DatasetConfig(
        name="도로교통공단 - 보행자 사고 통계",
        portal_url="https://www.data.go.kr",
        search_hint="도로교통공단 보행자 사고",
        endpoint=None,
        operation=None,
    ),
    "fire_incidents": DatasetConfig(
        name="소방청 - 화재 발생 통계",
        portal_url="https://www.data.go.kr",
        search_hint="소방청 화재 발생 통계",
        endpoint=None,
        operation=None,
    ),
    "emergency_facilities": DatasetConfig(
        # 응급의료기관 위치정보 조회: 좌표(WGS84_LON, WGS84_LAT 필수) 주변 기관 목록.
        # 응답 필드: dutyName, dutyAddr, dutyTel1, latitude, longitude, distance, hpid.
        # 응급실 전화(dutyTel3)는 기본정보 조회(getEgytBassInfoInqire, HPID)에만 있다.
        # 상세페이지 기준 XML만 제공한다 — datagokr_client가 XML도 읽는다.
        # 오퍼레이션명은 키 없이 호출해 SERVICE_KEY_IS_NULL 응답으로 확인했다(2026-11-05).
        # 공식 참고문서(국립중앙의료원_응급의료정보제공 활용가이드 V13.1)에도 같은 값이 있다.
        name="국립중앙의료원 전국 응급의료기관 정보 조회 서비스 - 응급의료기관 위치정보 조회",
        portal_url="https://www.data.go.kr/data/15000563/openapi.do",
        endpoint="https://apis.data.go.kr/B552657/ErmctInfoInqireService",
        operation="getEgytLcinfoInqire",
    ),
    "kcisa_tour_safety": DatasetConfig(
        # 관광지 안전정보: 지진해일대피소(subject="지진해일대피소")·응급의료기관·관광지가 함께 들어 있다.
        # 필드 이름(tourName, subject, lat, lon, totalCapacity …)은 tourapi/api.py에서 실제로 쓰는 값이다.
        # 응급의료기관 항목은 좌표가 비어 있어 거리 계산에는 emergency_facilities를 쓴다.
        name="한국문화정보원 관광지 안전정보",
        portal_url="https://api.kcisa.kr",
        search_hint="관광지 안전정보 (api.kcisa.kr convergence2018/conver10)",
        endpoint="https://api.kcisa.kr/openapi/service/rest/convergence2018",
        operation="conver10",
        service_key_env="KCISA_API_KEY",
    ),
}

# 관광안내소 설정은 apis/tourism.py의 tourist_info_centers에 있다(Open API, 활용신청 필요).


def sample_params() -> dict[str, dict]:
    """fetch_live가 실제 호출할 때 쓸 예시 파라미터(서울시청 좌표)."""
    return {"emergency_facilities": {"WGS84_LAT": 37.5665, "WGS84_LON": 126.9780}}
