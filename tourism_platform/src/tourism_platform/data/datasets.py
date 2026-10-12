"""실제로 연결해야 할 data.go.kr 데이터셋 설정 (About 페이지 "연동 예정" 항목과 1:1 대응).

endpoint/operation이 None인 항목은 아직 활용신청 전이라 fetch()가
DatasetNotConfiguredError를 던진다. 신청 승인 후 이 파일에서 해당 두 값만
채우면 datagokr_client.fetch()가 바로 동작한다 — 나머지 코드는 건드릴
필요 없다.
"""
from __future__ import annotations

from .datagokr_client import DatasetConfig

DATASETS: dict[str, DatasetConfig] = {
    "visitor_by_gender_age": DatasetConfig(
        name="한국관광 데이터랩 - 지역별 방문자 성·연령 분포",
        portal_url="https://www.data.go.kr/data/15101972/openapi.do",
        endpoint=None,  # TODO: 승인 후 상세페이지 "참고문서"에서 채우기
        operation=None,
    ),
    "tourist_spots": DatasetConfig(
        name="한국관광공사 TourAPI - 지역기반 관광정보 목록",
        portal_url="https://www.data.go.kr",
        search_hint="한국관광공사 국문 관광정보 서비스 (TourAPI)",
        endpoint=None,
        operation=None,
    ),
    "crime_by_region": DatasetConfig(
        # 사용자가 실제 Swagger 명세(namespace=3074462/v1)를 확인해 연결했다.
        # odcloud.kr은 연도별 스냅샷을 각각 다른 uddi로 따로 제공한다 — 아래는
        # 최신(2024) 것. 3개년 평균(문서 9.5)을 쓰려면 2023·2022년도 같이 받아야
        # 하는데, 그 uddi는 다음과 같다 (Operation 문자열만 바꿔 넣으면 된다):
        #   2023: 3074462/v1/uddi:161740bd-8ec5-4734-9a3d-f7a2cde34942
        #   2022: 3074462/v1/uddi:fe3ae686-8f7d-4d82-8c3a-901a02a0aa75
        # 2024년 스키마는 "서울 종로구"처럼 시도+시군구가 공백으로 구분돼 있고,
        # 울산 울주군·경북 군위군 등 군 지역도 전부 개별 컬럼으로 나온다 —
        # data/raw/README.md에 "확인 필요"로 남겨뒀던 질문의 답이 나온 것이다.
        name="경찰청 - 범죄 발생 지역별 통계 (2024)",
        portal_url="https://www.data.go.kr/data/3074462/fileData.do",
        endpoint="https://api.odcloud.kr/api",
        operation="3074462/v1/uddi:ae109087-8690-4cb5-bda9-a7876a92f3b8",
        api_style="odcloud",
    ),
    "crime_by_place": DatasetConfig(
        name="경찰청 - 범죄 발생 장소별 통계 (lambda_k 산출용)",
        portal_url="https://www.data.go.kr/data/3074463/fileData.do",
        endpoint=None,
        operation=None,
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
        name="국립중앙의료원 - 응급의료기관 위치",
        portal_url="https://www.data.go.kr",
        search_hint="국립중앙의료원 응급의료기관",
        endpoint=None,
        operation=None,
    ),
}
