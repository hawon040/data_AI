"""tourapi/usage_events.py(기록 받기·저장·요약)와 api.py 경로 테스트.

MongoDB 서버가 없어도 돌도록 mongomock을 쓰고, tourism_platform/usage/의 계산과 결과가 같은지 대조한다."""
import datetime as dt
import importlib.util
import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

mongomock = pytest.importorskip("mongomock")

TOURAPI = Path(__file__).resolve().parents[2] / "tourapi"
sys.path.insert(0, str(TOURAPI))
import usage_events as ue  # noqa: E402

from tourism_platform.usage import affinity, aggregate, events  # noqa: E402

NOW = dt.datetime(2026, 11, 10, tzinfo=dt.timezone.utc)


def raw(**over):
    base = {"anon_id": "a1", "kind": "rating", "region_code": "44130", "attraction": "독립기념관",
            "gender": "F", "age_group": "60plus", "occurred_at": "2026-11-09T09:00:00+09:00", "score": 5}
    base.update(over)
    return base


@pytest.fixture(autouse=True)
def fresh_state():
    ue.reset_limits()
    ue._index_ready["ready"] = False
    yield


@pytest.fixture
def db():
    return mongomock.MongoClient().tourlink


CASES = [
    raw(), raw(kind="directions", score=None), raw(gender="X"), raw(age_group="70s"), raw(kind="like"),
    raw(score=0), raw(score=6), raw(score=4.5), raw(score=True), raw(occurred_at="2026-11-09T09:00:00"),
    raw(occurred_at="아무말"), raw(anon_id=""), raw(name="홍길동"), raw(email="a@b.c"), raw(lat=37.5),
    raw(kind="directions", score=3), raw(attraction="가" * 101),
]


@pytest.mark.parametrize("case", CASES, ids=lambda c: f"{c['kind']}-{c.get('gender')}-{c.get('score')}-{len(c)}")
def test_validation_matches_tourism_platform_usage_events(case):
    def accepts(parse):
        try:
            parse(case)
            return True
        except ValueError:
            return False
    ours = accepts(ue.parse_event)
    # 관광지 이름 길이 제한은 tourapi 쪽에만 있다(저장소 보호용)
    expected = accepts(events.parse_event) and len(case.get("attraction", "")) <= ue.TEXT_LIMIT
    assert ours == expected


def test_post_saves_then_reports_duplicate(db):
    body = json.dumps(raw(), ensure_ascii=False).encode("utf-8")
    assert ue.handle_post(db, body, "1.2.3.4") == (201, {"saved": True, "duplicate": False})
    assert ue.handle_post(db, body, "1.2.3.4") == (200, {"saved": False, "duplicate": True})
    assert db[ue.COLLECTION].count_documents({}) == 1


def test_post_never_stores_ip_or_extra_fields(db):
    ue.handle_post(db, json.dumps(raw()).encode(), "9.9.9.9")
    doc = db[ue.COLLECTION].find_one()
    assert set(doc) == {"_id", "anon_id", "kind", "region_code", "attraction", "gender", "age_group", "occurred_at", "score"}
    assert "9.9.9.9" not in json.dumps(doc, default=str)


@pytest.mark.parametrize("body,status", [
    (b"not json", 400), (json.dumps(raw(name="x")).encode(), 400), (b"x" * 3000, 413), (b"\xff\xfe", 400),
])
def test_bad_requests(db, body, status):
    assert ue.handle_post(db, body, "1.1.1.1")[0] == status


def test_no_database_returns_503_after_validation():
    assert ue.handle_post(None, json.dumps(raw()).encode(), "1.1.1.1")[0] == 503
    assert ue.handle_post(None, b"{}", "1.1.1.1")[0] == 400  # 형식 오류는 저장소보다 먼저 거른다


def test_rate_limit_per_anon_id(db):
    codes = [ue.handle_post(db, json.dumps(raw(attraction=f"관광지{i}")).encode(), f"10.0.0.{i}")[0]
             for i in range(ue.LIMIT_PER_ANON + 3)]
    assert codes[:ue.LIMIT_PER_ANON] == [201] * ue.LIMIT_PER_ANON
    assert codes[ue.LIMIT_PER_ANON:] == [429] * 3
    assert ue.handle_post(db, json.dumps(raw(anon_id="other")).encode(), "10.9.9.9")[0] == 201  # 다른 사람은 영향 없음


def test_rate_limit_per_ip(db):
    codes = [ue.handle_post(db, json.dumps(raw(anon_id=f"u{i}")).encode(), "7.7.7.7")[0]
             for i in range(ue.LIMIT_PER_IP + 2)]
    assert codes[-2:] == [429, 429] and codes[0] == 201


def test_summary_matches_tourism_platform_calculations(db):
    rows = [
        raw(anon_id="a", score=5, occurred_at="2026-11-09T00:00:00+00:00"),
        raw(anon_id="b", score=1, occurred_at="2025-11-10T00:00:00+00:00"),
        raw(anon_id="c", kind="directions", score=None, gender="M", age_group="20s", region_code="42150"),
        raw(anon_id="d", score=4, gender="M", age_group="20s", attraction="경포대", region_code="42150"),
    ]
    for r in rows:
        assert ue.handle_post(db, json.dumps(r).encode(), "1.1.1.1")[0] == 201
    summary = ue.load_summary(db, NOW)

    parsed = [events.parse_event(r) for r in rows]
    counts = aggregate.region_group_counts(parsed)
    for region, groups in counts.items():
        for group, value in groups.items():
            assert summary["regionGroupCounts"].get(region, {}).get(group, 0) == pytest.approx(value, abs=1e-3)
    age_means, stats = affinity.rating_stats(parsed, NOW)
    for age, stat in age_means.items():
        assert summary["ageRatings"][age]["n"] == pytest.approx(stat.n_eff, abs=1e-3)
        assert summary["ageRatings"][age]["mean"] == pytest.approx(stat.mean, abs=1e-3)
    by_key = {(r["attraction"], r["ageGroup"]): r for r in summary["attractionRatings"]}
    for (attraction, age), stat in stats.items():
        assert by_key[(attraction, age)]["n"] == pytest.approx(stat.n_eff, abs=1e-3)
        assert by_key[(attraction, age)]["mean"] == pytest.approx(stat.mean, abs=1e-3)
    assert by_key[("독립기념관", "60plus")]["count"] == 2


def test_summary_without_database_says_unavailable():
    summary = ue.load_summary(None)
    assert summary["available"] is False and summary["regionGroupCounts"] == {}


def test_attraction_names_with_dots_are_safe_to_store_in_mongo_meta(db):
    ue.handle_post(db, json.dumps(raw(attraction="St.Mary's $공원")).encode(), "1.1.1.1")
    summary = ue.load_summary(db, NOW)
    db["_meta"].insert_one({"_id": "usage_summary", "kind": "value", "value": summary})  # 필드 이름 제한에 걸리지 않는다
    assert summary["attractionRatings"][0]["attraction"] == "St.Mary's $공원"


# --- HTTP까지 한 번에 -----------------------------------------------------------

@pytest.fixture
def server(db, monkeypatch):
    spec = importlib.util.spec_from_file_location("tour_app_usage", TOURAPI / "api.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    monkeypatch.setattr(api, "_mongo_db", lambda: db)
    monkeypatch.setattr(api.rediscache, "client", lambda: None)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), api.TourRequestHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()
    httpd.server_close()


def _post(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=5) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def test_http_post_then_summary(server):
    assert _post(server + "/api/usage", raw())[0] == 201
    assert _post(server + "/api/usage", raw())[0] == 200
    assert _post(server + "/api/usage", raw(name="x"))[0] == 400
    assert _post(server + "/api/other", raw())[0] == 404
    with urllib.request.urlopen(server + "/api/usage/summary", timeout=5) as res:
        summary = json.loads(res.read())
    assert summary["available"] is True and summary["total"] == 1
    assert summary["regionGroupCounts"]["44130"]["F_60plus"] == 1.0
