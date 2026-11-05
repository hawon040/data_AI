"""안전 관련 data.go.kr 데이터셋 설정.

10주차 방향 전환(2026-11-05)으로 범죄율·사고율 기반 지역 안전도 점수는 서비스에서
뺐다. 설정은 기록으로 남겨 두고, 응급의료기관처럼 "대비 정보"로 보여 줄 수 있는
항목만 앞으로 연동한다.
"""
from __future__ import annotations

from ..datagokr_client import DatasetConfig

SAFETY_DATASETS: dict[str, DatasetConfig] = {
    "crime_by_region": DatasetConfig(
        # 파일데이터지만 odcloud(공공데이터개방표준서비스) API로도 열려 있다. Swagger 명세(namespace=3074462/v1)로
        # 확인해 연결했다. 연도별 스냅샷마다 uddi가 다르다 — 아래는 최신(2024).
        # 3개년 평균(문서 9.5)용: 2023 3074462/v1/uddi:161740bd-8ec5-4734-9a3d-f7a2cde34942,
        #                       2022 3074462/v1/uddi:fe3ae686-8f7d-4d82-8c3a-901a02a0aa75
        # 2024 스키마는 "서울 종로구"처럼 시도+시군구가 공백으로 구분된 컬럼이고, 군 지역도 전부 개별 컬럼이다.
        # 2026-11-06: 지금 키(API_KEY)로 호출하면 401 "유효하지 않은 인증키" — 활용신청 확인 필요.
        name="경찰청 - 범죄 발생 지역별 통계 (2024)",
        portal_url="https://www.data.go.kr/data/3074462/fileData.do",
        endpoint="https://api.odcloud.kr/api",
        operation="3074462/v1/uddi:ae109087-8690-4cb5-bda9-a7876a92f3b8",
        api_style="odcloud",
    ),
    "crime_by_place": DatasetConfig(
        # Swagger 명세(namespace=3074463/v1) 기준. 최신은 2025년. 2023년부터 장소 분류가 36개에서 64개로
        # 세분화돼 λ_k(관광객이 머무는 장소 비중) 계산에 필요한 숙박업소·음식점·카페·기차역·버스터미널·
        # 공항·공원_놀이시설·유원지·해안·야외_산야가 따로 나온다.
        # 3개년 평균용: 2024 3074463/v1/uddi:6bb3e807-69f3-4d88-83f9-dd5febbf6bc6,
        #              2023 3074463/v1/uddi:b375578d-d592-487f-bba7-e26eaededb13 (컬럼명이 조금 다름)
        # 2026-11-06: 지금 키로 401 — 활용신청 확인 필요.
        name="경찰청 - 범죄 발생 장소별 통계 (2025, lambda_k 산출용)",
        portal_url="https://www.data.go.kr/data/3074463/fileData.do",
        endpoint="https://api.odcloud.kr/api",
        operation="3074463/v1/uddi:823ceb7c-4833-41ea-835f-dd8bd4c592d6",
        api_style="odcloud",
    ),
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
        # 필드 이름(tourName, subject, lat, lon, totalCapacity …)은 tools/api.py에서 실제로 쓰는 값이다.
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
