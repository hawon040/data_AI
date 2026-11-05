"""관광지·방문자 관련 data.go.kr 데이터셋 설정."""
from __future__ import annotations

from ..datagokr_client import DatasetConfig

TOURISM_DATASETS: dict[str, DatasetConfig] = {
    "visitor_by_gender_age": DatasetConfig(
        # 실제 호출로 확인(2026-11-03): 이 API는 시군구×일자×방문자구분(현지인/외지인/외국인)
        # 방문자 수만 준다. 성·연령 구분은 없다 — 성·연령 분포는 데이터랩 웹에서 따로 받아야 한다.
        name="한국관광 데이터랩 - 기초지자체 일별 방문자 수 (현지인/외지인/외국인)",
        portal_url="https://www.data.go.kr/data/15101972/openapi.do",
        endpoint="https://apis.data.go.kr/B551011/DataLabService",
        operation="locgoRegnVisitrDDList",  # 광역 단위는 metcoRegnVisitrDDList
        extra_params={
            "MobileOS": "ETC",
            "MobileApp": "TourLink",
            "_type": "json",  # 이 API는 type이 아니라 _type을 받는다
            # startYmd/endYmd 필수. 최근 며칠은 아직 비어 있어(집계 지연) 확인된 날짜를 기본값으로 둔다.
            "startYmd": "20260901",
            "endYmd": "20260901",
        },
    ),
    "national_tourspots": DatasetConfig(
        # 전국관광지정보표준데이터 Open API. response 없이 header/body만 돌려준다(클라이언트가 맞춤).
        # 필드: trrsrtNm(이름), trrsrtSe(구분), rdnmadr/lnmadr(주소), latitude, longitude,
        # aceptncCo(수용인원), prkplceCo(주차), referenceDate. tools/api.py가 쓰는 것과 같은 API다.
        # 2026-11-05 API_KEY로 호출 성공 확인.
        name="전국관광지정보표준데이터",
        portal_url="https://www.data.go.kr/data/15021141/standard.do",  # 2026-11-06 페이지 열어 확인
        endpoint="https://api.data.go.kr/openapi",
        operation="tn_pubr_public_trrsrt_api",
        timeout=60,  # 한 번에 많이 받으면 15초를 넘는다(tools/api.py도 60초)
    ),
    "tourist_spots": DatasetConfig(
        name="한국관광공사 TourAPI - 지역기반 관광정보 목록",
        portal_url="https://www.data.go.kr",
        search_hint="한국관광공사 국문 관광정보 서비스 (TourAPI)",
        endpoint=None,
        operation=None,
    ),
}
