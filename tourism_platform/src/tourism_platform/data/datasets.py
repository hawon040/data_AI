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
        # ⚠️ 2024-10 확인: 사용자가 올려준 공식 매뉴얼(한국관광공사_TourAPI
        # 활용매뉴얼(관광빅데이터)_v4.1.docx)을 직접 열어보니, DataLabService는
        # 성별·연령대 분포를 전혀 제공하지 않는다 — 시군구×요일×방문자유형
        # (현지인/외지인/외국인)만 준다(아래 visitor_by_region_daily 참고).
        # AreaTarDivService(지난번 사용자가 준 엔드포인트)는 이 매뉴얼에
        # 등장하지 않아 실체를 확인 못 했다 — 별도 문서가 있는지 확인 필요.
        # 이 프로젝트의 LQ 특화지수(성별×연령대 12개 그룹) 전제 자체가 재검토
        # 대상일 수 있다는 뜻 — 추측으로 다른 걸 끼워 넣지 않고 None으로 둔다.
        name="한국관광 데이터랩 - 지역별 방문자 성·연령 분포",
        portal_url="https://www.data.go.kr/data/15101972/openapi.do",
        endpoint=None,  # TODO: AreaTarDivService 실체 확인 또는 대안 데이터 탐색
        operation=None,
    ),
    "visitor_by_region_daily": DatasetConfig(
        # 위 visitor_by_gender_age를 찾다가 실제로 확인된 데이터 — 성·연령은
        # 없지만 시군구×요일×방문자유형(현지인/외지인/외국인)별 방문자 수는
        # 진짜로 제공된다. locgoRegnVisitrDDList가 기초지자체(시군구) 단위.
        # startYmd·endYmd(조회 기간, yyyyMMdd)는 공식 매뉴얼에 필수(1)로
        # 표시돼 있고 조회마다 달라지는 값이라 extra_params에 고정하지 않는다
        # — fetch(config, startYmd="20250101", endYmd="20250107")처럼 매번 넘긴다.
        name="한국관광공사 DataLabService - 기초지자체 지역방문자수 집계",
        portal_url="https://www.data.go.kr/data/15101972/openapi.do",
        endpoint="https://apis.data.go.kr/B551011/DataLabService",
        operation="locgoRegnVisitrDDList",
        extra_params={"MobileOS": "ETC", "MobileApp": "TrueTrip"},
    ),
    "tourist_spots": DatasetConfig(
        # 사용자가 승인받은 건 TourAPI(B551011)가 아니라 행안부 "전국관광지
        # 정보표준데이터"(tn_pubr_public_trrsrt_api)였다. endpoint 자체가 이미
        # 완전한 경로라 operation은 빈 문자열로 둔다.
        # 주의: 샘플 URL/요청변수표를 직접 확인하지 못해서 data.go.kr 공통
        # 규격(serviceKey·pageNo·numOfRows·type=json)을 그대로 가정했다 —
        # 실제 호출해서 안 되면 상세페이지의 "미리보기" 샘플 URL로 재확인 필요.
        name="전국관광지정보표준데이터",
        portal_url="https://www.data.go.kr",
        search_hint="전국관광지정보표준데이터",
        endpoint="https://api.data.go.kr/openapi/tn_pubr_public_trrsrt_api",
        operation="",
    ),
    "tourist_info_centers": DatasetConfig(
        # 원래 7개 목록엔 없었지만 사용자가 추가로 신청해 보내준 데이터셋 —
        # "가까운 관광안내소 찾기" 같은 기능에 쓸 수 있어 등록해 둔다.
        # tourist_spots와 같은 이유로 요청 규격은 가정치다.
        name="전국관광안내소표준데이터",
        portal_url="https://www.data.go.kr",
        search_hint="전국관광안내소표준데이터",
        endpoint="https://api.data.go.kr/openapi/tn_pubr_public_trsmic_api",
        operation="",
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
        # 사용자가 올려준 공식 참고문서(NIA-IFT-OpenAPI 활용가이드 01.
        # 국립중앙의료원_응급의료정보제공 V13.1.hwp)에서 직접 확인한 값 —
        # getEgytLcinfoInqire: "경/위도를 기준으로 응급의료기관 위치 정보를
        # 조회"하는 오퍼레이션으로, emergencyAccessMinutes(가장 가까운
        # 응급의료기관까지 이동 시간) 계산에 정확히 맞는다.
        # 필수 파라미터: WGS84_LON(경도), WGS84_LAT(위도) — 조회 기준점이라
        # extra_params에 고정값으로 넣지 않고, fetch() 호출 시 매번
        # 넘겨야 한다. 예: fetch(config, WGS84_LON=127.0852, WGS84_LAT=37.4881)
        name="국립중앙의료원 - 응급의료기관 위치정보 조회",
        portal_url="https://www.data.go.kr",
        search_hint="국립중앙의료원_응급의료정보제공",
        endpoint="https://apis.data.go.kr/B552657/ErmctInfoInqireService",
        operation="getEgytLcinfoInqire",
    ),
}
