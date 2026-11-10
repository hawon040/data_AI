"""관광지·방문자 관련 data.go.kr 데이터셋 설정."""
from __future__ import annotations

from ..datagokr_client import DatasetConfig

TOURISM_DATASETS: dict[str, DatasetConfig] = {
    "visitor_by_gender_age": DatasetConfig(
        # 공식 매뉴얼(한국관광공사_TourAPI 활용매뉴얼(관광빅데이터)_v4.1)과 실제 호출(2026-11-03)로
        # 확인했다: DataLabService는 성별·연령대 분포를 제공하지 않는다 — 시군구×요일×방문자유형
        # (현지인/외지인/외국인)만 준다(아래 visitor_by_region_daily).
        # AreaTarDivService는 매뉴얼에 없어 실체를 확인하지 못했다. LQ 특화지수(성별×연령대 12개 그룹)
        # 전제 자체가 재검토 대상일 수 있다 — 추측으로 다른 걸 끼워 넣지 않고 None으로 둔다.
        name="한국관광 데이터랩 - 지역별 방문자 성·연령 분포",
        portal_url="https://www.data.go.kr/data/15101972/openapi.do",
        endpoint=None,  # TODO: AreaTarDivService 실체 확인 또는 대안 데이터 탐색
        operation=None,
    ),
    "visitor_by_region_daily": DatasetConfig(
        # 시군구×요일×방문자유형(현지인/외지인/외국인)별 방문자 수. locgoRegnVisitrDDList가 기초지자체 단위
        # (광역은 metcoRegnVisitrDDList). startYmd·endYmd(yyyyMMdd)는 필수이고 조회마다 달라지므로
        # 고정하지 않고 fetch(config, startYmd=..., endYmd=...)로 넘긴다.
        # 이 API는 type이 아니라 _type을 받는다 — type=json을 붙이면 INVALID_REQUEST_PARAMETER_ERROR(type)
        # (2026-11-05 실제 호출로 확인).
        name="한국관광공사 DataLabService - 기초지자체 지역방문자수 집계",
        portal_url="https://www.data.go.kr/data/15101972/openapi.do",
        endpoint="https://apis.data.go.kr/B551011/DataLabService",
        operation="locgoRegnVisitrDDList",
        extra_params={"MobileOS": "ETC", "MobileApp": "TourLink", "_type": "json"},
    ),
    "tourist_spots": DatasetConfig(
        # 전국관광지정보표준데이터 Open API. endpoint 자체가 완전한 경로라 operation은 빈 문자열.
        # response 없이 header/body만 돌려준다(클라이언트가 맞춤).
        # 필드: trrsrtNm(이름), trrsrtSe(구분), rdnmadr/lnmadr(주소), latitude, longitude,
        # aceptncCo(수용인원), prkplceCo(주차), referenceDate. 2026-11-05 호출 성공(전체 897건).
        name="전국관광지정보표준데이터",
        portal_url="https://www.data.go.kr/data/15021141/standard.do",  # 2026-11-06 페이지 열어 확인
        endpoint="https://api.data.go.kr/openapi/tn_pubr_public_trrsrt_api",
        operation="",
        timeout=60,  # 한 번에 많이 받으면 15초를 넘는다(tourapi/api.py도 60초)
    ),
    "tourist_info_centers": DatasetConfig(
        # 전국관광안내소표준데이터 Open API. 키 없이 호출하면 SERVICE_KEY_IS_NULL이라 API는 있다(2026-11-06).
        # 지금 키(API_KEY)로는 SERVICE_KEY_IS_NOT_REGISTERED_ERROR — 활용신청이 필요하다.
        # 승인 전에는 포털에서 CSV를 내려받아 preparedness.load_info_centers()로 읽는다.
        name="전국관광안내소표준데이터",
        portal_url="https://www.data.go.kr/data/15013112/standard.do",
        endpoint="https://api.data.go.kr/openapi/tn_pubr_public_trsmic_api",
        operation="",
    ),
}


def sample_params() -> dict[str, dict]:
    """fetch_live가 실제 호출할 때 쓸 예시 파라미터. 데이터랩은 최근 며칠이 비어 있어(집계 지연) 확인된 날짜를 쓴다."""
    return {"visitor_by_region_daily": {"startYmd": "20260901", "endYmd": "20260901"}}
