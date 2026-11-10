import os

import pandas as pd
import pytest

from tourism_platform.lake import api_log_report, pipeline

SPOT_ITEMS = [
    {"trrsrtNm": "경포해변", "trrsrtSe": "관광지", "rdnmadr": "강원특별자치도 강릉시 창해로 514",
     "latitude": "37.8057", "longitude": "128.9083", "aceptncCo": "1,000", "prkplceCo": "300"},
    {"trrsrtNm": "경포해변", "trrsrtSe": "관광지", "rdnmadr": "강원특별자치도 강릉시 창해로 514",
     "latitude": "37.80571", "longitude": "128.90829", "aceptncCo": "1000", "prkplceCo": "300"},  # 중복
    {"trrsrtNm": "좌표없음", "latitude": "", "longitude": ""},
    {"trrsrtNm": "석정온천관광지", "rdnmadr": "", "lnmadr": "전북특별자치도 고창군 고창읍 석정리 733",
     "latitude": "35.43", "longitude": "126.74", "aceptncCo": "", "prkplceCo": "840"},
]


@pytest.mark.parametrize("text, short", [
    ("강원특별자치도 강릉시", "강원"), ("강원도", "강원"), ("충청남도 공주시", "충남"),
    ("전북특별자치도 고창군", "전북"), ("서울특별시 중구", "서울"), ("", ""),
])
def test_sido_short(text, short):
    assert pipeline.sido_short(text) == short


def test_clean_tourspots_drops_bad_coords_and_duplicates():
    spots, stats = pipeline.clean_tourspots(SPOT_ITEMS)
    assert stats == {"input": 4, "bad_coords": 1, "duplicates": 1, "output": 2}
    gyeongpo, seokjeong = spots
    assert (gyeongpo["sido"], gyeongpo["sigungu"], gyeongpo["capacity"], gyeongpo["parking"]) == ("강원", "강릉시", 1000, 300)
    assert seokjeong["sido"] == "전북" and seokjeong["capacity"] is None  # 지번주소로 시도를 찾고, 빈 숫자는 None


def test_clean_shelters_keeps_only_tsunami_shelters():
    items = [
        {"tourName": "경포초", "subject": "지진해일대피소", "sido": "강원도", "gungu": "강릉시", "lat": "37.79", "lon": "128.89"},
        {"tourName": "병원", "subject": "지역응급의료기관 > 병원", "lat": "37.7", "lon": "128.8"},
    ]
    shelters, stats = pipeline.clean_shelters(items)
    assert [s["name"] for s in shelters] == ["경포초"] and shelters[0]["sido"] == "강원"
    assert stats["not_shelter"] == 1


def test_build_gold_region_and_nearest_shelter():
    spots, _ = pipeline.clean_tourspots(SPOT_ITEMS)
    shelters, _ = pipeline.clean_shelters([
        {"tourName": "경포초", "subject": "지진해일대피소", "sido": "강원도", "lat": "37.7953", "lon": "128.8960"}])
    gold = pipeline.build_gold(spots, shelters)
    region = gold["region_indicators"].set_index("sido")
    assert region.loc["강원", "spots"] == 1 and region.loc["강원", "shelters"] == 1
    assert region.loc["전북", "shelters"] == 0
    nearest = gold["spot_nearest_shelter"].set_index("name")
    assert nearest.loc["경포해변", "nearest_shelter"] == "경포초"
    assert 1 < nearest.loc["경포해변", "nearest_shelter_km"] < 2


def test_gold_round_trips_through_parquet(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "GOLD_DIR", tmp_path)
    spots, _ = pipeline.clean_tourspots(SPOT_ITEMS)
    paths = pipeline.write_gold(pipeline.build_gold(spots, []))
    back = pd.read_parquet(paths["region_indicators"])
    assert set(back["sido"]) == {"강원", "전북"}


def test_api_log_summary(tmp_path):
    log = tmp_path / "log.jsonl"
    rows = [
        '{"time": "t1", "api": "getA", "name": "A", "elapsed_ms": 100, "ok": true, "status": 200, "rows": 3, "error": null}',
        '{"time": "t2", "api": "getA", "name": "A", "elapsed_ms": 300, "ok": false, "status": 403, "rows": null, "error": "HTTP 403"}',
        '{"time": "t3", "api": "getB", "name": "B", "elapsed_ms": 50, "ok": false, "status": null, "rows": null, "error": "API 오류: 30"}',
    ]
    log.write_text("\n".join(rows), encoding="utf-8")
    by_api, errors = api_log_report.summarize(api_log_report.load_log(log))
    a = by_api.set_index("api").loc["getA"]
    assert (a["calls"], a["success"], a["success_rate_pct"], a["mean_ms"]) == (2, 1, 50.0, 200)
    assert set(errors["error_type"]) == {"HTTP 403", "API 오류"}


def _mongo_or_skip():
    pymongo = pytest.importorskip("pymongo")
    client = pymongo.MongoClient(os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=1000)
    try:
        client.admin.command("ping")
    except Exception:
        pytest.skip("MongoDB에 연결할 수 없어 건너뜀")
    return client


def test_mongo_esr_avoids_in_memory_sort_and_aggregate_matches_pandas():
    from tourism_platform.lake import mongo_lab

    client = _mongo_or_skip()
    db = client["tourlink_lab_test"]
    try:
        spots = [{"name": f"s{i}", "sido": "강원" if i % 2 else "충남", "capacity": i * 10, "parking": i,
                  "lat": 37.0 + i / 1000, "lon": 128.0 + i / 1000} for i in range(200)]
        mongo_lab.load(db, spots=spots, shelters=[], weather=[])
        cases = {r["case"]: r for r in mongo_lab.esr_experiment(db, sido="강원", min_parking=50)}
        assert cases["인덱스 없음"]["stages"].endswith("COLLSCAN")
        assert cases["E-R-S 순서 {sido, parking, capacity}"]["in_memory_sort"] is True
        esr = cases["ESR 순서 {sido, capacity, parking}"]
        assert "IXSCAN" in esr["stages"] and esr["in_memory_sort"] is False
        assert esr["docsExamined"] == esr["nReturned"]
        _, same = mongo_lab.aggregate_vs_pandas(db, spots)
        assert same
    finally:
        client.drop_database("tourlink_lab_test")
