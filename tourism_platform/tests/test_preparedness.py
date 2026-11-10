import math

import pytest

from tourism_platform.data import datagokr_client, preparedness
from tourism_platform.data.datagokr_client import parse_xml_response
from tourism_platform.data.geo import haversine_km, valid_korea_coords
from tourism_platform.data.preparedness import (
    Facility,
    fetch_preparedness,
    hospitals_from_items,
    info_centers_from_rows,
    load_info_centers,
    nearest_facility,
    nearest_preparedness,
    shelters_from_kcisa,
)

GYEONGPO = (37.7956, 128.9083)  # 경포해변


def test_haversine_one_degree_on_equator():
    # 적도에서 경도 1도 = 2πR/360
    assert haversine_km(0, 0, 0, 1) == pytest.approx(2 * math.pi * 6371 / 360, rel=1e-9)


def test_haversine_seoul_busan():
    # 서울시청 ↔ 부산시청 직선거리 약 325km
    assert haversine_km(37.5665, 126.9780, 35.1796, 129.0756) == pytest.approx(325, abs=3)


def test_haversine_is_symmetric_and_zero_on_same_point():
    a, b = (37.5, 127.0), (36.0, 128.5)
    assert haversine_km(*a, *b) == pytest.approx(haversine_km(*b, *a))
    assert haversine_km(*a, *a) == 0


@pytest.mark.parametrize("lat, lon, ok", [
    ("37.5", "127.0", True),
    ("", "127.0", False),
    (None, None, False),
    ("127.0", "37.5", False),  # 위경도가 뒤바뀐 값
    ("0", "0", False),
])
def test_valid_korea_coords(lat, lon, ok):
    assert (valid_korea_coords(lat, lon) is not None) is ok


def test_nearest_facility_picks_closest():
    near = Facility("관광안내소", "가까운 곳", 37.7960, 128.9090)
    far = Facility("관광안내소", "먼 곳", 37.7640, 128.8990)
    result = nearest_facility(*GYEONGPO, [far, near])
    assert result.facility == near
    assert result.distance_km == pytest.approx(haversine_km(*GYEONGPO, near.lat, near.lon), abs=0.005)


def test_nearest_facility_empty_returns_none():
    assert nearest_facility(*GYEONGPO, []) is None


def test_nearest_preparedness_combines_three_kinds():
    result = nearest_preparedness(
        *GYEONGPO,
        hospitals=[Facility("응급의료기관", "강릉아산병원", 37.8182, 128.8574)],
        shelters=[Facility("지진해일대피소", "경포초등학교", 37.7953, 128.8960)],
        info_centers=[],
    )
    assert result.emergency.facility.name == "강릉아산병원"
    assert result.shelter.distance_km < result.emergency.distance_km
    assert result.info_center is None


def test_hospitals_from_items_skips_bad_coords():
    items = [
        {"dutyName": "A병원", "latitude": "37.8", "longitude": "128.9", "dutyAddr": "강릉", "dutyTel1": "033-1"},
        {"dutyName": "좌표없음", "latitude": "", "longitude": ""},
    ]
    assert [f.name for f in hospitals_from_items(items)] == ["A병원"]


def test_shelters_from_kcisa_keeps_only_tsunami_shelters():
    items = [
        {"tourName": "대피소1", "subject": "지진해일대피소", "lat": "37.79", "lon": "128.90"},
        {"tourName": "병원1", "subject": "응급의료기관", "lat": "", "lon": ""},
        {"tourName": "관광지1", "subject": "관광지", "lat": "37.7", "lon": "128.9"},
    ]
    assert [f.name for f in shelters_from_kcisa(items)] == ["대피소1"]


ROWS = [
    {"관광안내소명": "경포 관광안내소", "위도": "37.7975", "경도": "128.9070",
     "소재지도로명주소": "강원특별자치도 강릉시 창해로", "안내소전화번호": "033-640-4537"},
    {"관광안내소명": "좌표없는 안내소", "위도": "", "경도": ""},
]


def test_info_centers_from_rows():
    centers = info_centers_from_rows(ROWS)
    assert [c.name for c in centers] == ["경포 관광안내소"]
    assert centers[0].phone == "033-640-4537"


@pytest.mark.parametrize("encoding", ["utf-8-sig", "cp949"])
def test_load_info_centers_reads_utf8_and_cp949(tmp_path, encoding):
    path = tmp_path / "centers.csv"
    header = "관광안내소명,위도,경도,소재지도로명주소,안내소전화번호\n"
    path.write_text(header + "경포 관광안내소,37.7975,128.9070,강릉시 창해로,033-640-4537\n", encoding=encoding)
    assert [c.name for c in load_info_centers(path)] == ["경포 관광안내소"]


ER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
<body><items>
<item><dutyName>강릉아산병원</dutyName><dutyAddr>강원특별자치도 강릉시 사천면</dutyAddr><dutyTel1>033-610-3114</dutyTel1>
<latitude>37.8182</latitude><longitude>128.8574</longitude><distance>5.1</distance></item>
<item><dutyName>강릉동인병원</dutyName><dutyAddr>강릉시 강릉대로</dutyAddr><dutyTel1>033-650-6114</dutyTel1>
<latitude>37.7720</latitude><longitude>128.9180</longitude><distance>2.7</distance></item>
</items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>2</totalCount></body></response>"""


def test_parse_xml_response_matches_json_shape():
    data = parse_xml_response(ER_XML)
    assert data["response"]["header"]["resultCode"] == "00"
    assert len(data["response"]["body"]["items"]["item"]) == 2
    assert data["response"]["body"]["totalCount"] == "2"


def test_parse_xml_gateway_error():
    text = ("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
            "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
            "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>")
    assert parse_xml_response(text)["response"]["header"]["resultCode"] == "30"


def test_fetch_reads_xml_only_api(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")

    class XmlResponse:
        text = ER_XML

        def raise_for_status(self):
            pass

        def json(self):
            raise ValueError("not json")

    seen = {}

    def fake_get(url, params, timeout):
        seen.update(url=url, params=params)
        return XmlResponse()

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", fake_get)
    config = preparedness.SAFETY_DATASETS["emergency_facilities"]
    data = datagokr_client.fetch(config, WGS84_LAT=37.79, WGS84_LON=128.9)
    assert seen["url"].endswith("/B552657/ErmctInfoInqireService/getEgytLcinfoInqire")
    assert (seen["params"]["WGS84_LAT"], seen["params"]["WGS84_LON"]) == (37.79, 128.9)
    assert len(data["response"]["body"]["items"]["item"]) == 2


def test_fetch_preparedness_picks_nearest_of_each_kind(monkeypatch):
    responses = {
        "getEgytLcinfoInqire": parse_xml_response(ER_XML),
        "conver10": {"response": {"header": {"resultCode": "0000"}, "body": {"items": {"item": [
            {"tourName": "경포초등학교", "subject": "지진해일대피소", "lat": "37.7953", "lon": "128.8960"},
            {"tourName": "주문진항 대피소", "subject": "지진해일대피소", "lat": "37.8930", "lon": "128.8270"},
        ]}}}},
    }
    monkeypatch.setattr(preparedness.datagokr_client, "fetch", lambda config, **_: responses[config.operation])
    monkeypatch.setattr(preparedness, "_shelter_cache", None)

    result = fetch_preparedness(*GYEONGPO, info_centers=info_centers_from_rows(ROWS))

    assert result.errors == {}
    assert result.emergency.facility.name == "강릉동인병원"
    assert result.shelter.facility.name == "경포초등학교"
    assert result.info_center.facility.name == "경포 관광안내소"
    assert result.info_center.distance_km < 0.5


def test_fetch_preparedness_reports_failures_separately(monkeypatch):
    def fetch(config, **_):
        raise RuntimeError(f"{config.operation} 실패")

    monkeypatch.setattr(preparedness.datagokr_client, "fetch", fetch)
    monkeypatch.setattr(preparedness, "_shelter_cache", None)
    result = fetch_preparedness(*GYEONGPO)

    assert result.emergency is None and result.shelter is None
    assert set(result.errors) == {"emergency", "shelter", "info_center"}
