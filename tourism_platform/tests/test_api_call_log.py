import datetime as dt
import json
import os

import pytest

from tourism_platform.lake import api_call_log

ROWS = [
    {"time": "2026-11-07T05:30:05.123+00:00", "api": "getA", "name": "A", "elapsed_ms": 100.0, "ok": True,
     "status": 200, "rows": 3, "error": None},
    {"time": "2026-11-07T05:31:00.000+00:00", "api": "getA", "name": "A", "elapsed_ms": 300.0, "ok": False,
     "status": 403, "rows": None, "error": "HTTP 403"},
    {"time": "2026-11-07T05:31:00.000+00:00", "api": "getA", "name": "A", "elapsed_ms": 300.0, "ok": False,
     "status": 403, "rows": None, "error": "HTTP 403"},
]


def _write(tmp_path):
    path = tmp_path / "api_calls.jsonl"
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in ROWS) + "\n", encoding="utf-8")
    return path


def test_read_records_converts_time_to_utc_date(tmp_path):
    docs = api_call_log.read_records(_write(tmp_path))
    assert len(docs) == 3
    assert docs[0]["time"] == dt.datetime(2026, 11, 7, 5, 30, 5, 123000, tzinfo=dt.timezone.utc)
    assert isinstance(docs[0]["time"], dt.datetime)


def test_identical_lines_get_distinct_ids_but_rereading_gives_same_ids(tmp_path):
    path = _write(tmp_path)
    first = [d["_id"] for d in api_call_log.read_records(path)]
    second = [d["_id"] for d in api_call_log.read_records(path)]
    assert len(set(first)) == 3  # 같은 내용의 두 줄도 순번으로 구분된다
    assert first == second  # 다시 읽어도 같은 _id라 재적재해도 중복되지 않는다


def test_service_key_is_not_part_of_documents(tmp_path):
    docs = api_call_log.read_records(_write(tmp_path))
    assert all("serviceKey" not in d and "params" not in d for d in docs)


def _mongo_or_skip():
    pymongo = pytest.importorskip("pymongo")
    client = pymongo.MongoClient(os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=1000)
    try:
        client.admin.command("ping")
    except Exception:
        pytest.skip("MongoDB에 연결할 수 없어 건너뜀")
    return client


def test_mongo_load_is_idempotent_and_report_matches_pandas(tmp_path):
    from tourism_platform.lake import api_log_report

    client = _mongo_or_skip()
    db = client["tourlink_lab_test"]
    try:
        col = db["api_calls"]
        docs = api_call_log.read_records(_write(tmp_path))
        indexes = api_call_log.ensure_indexes(col)
        assert indexes["time_ttl_30d"][1] == api_call_log.TTL_SECONDS
        assert api_call_log.load(col, docs) == 3
        assert api_call_log.load(col, docs) == 0  # 두 번째는 모두 중복
        report = {r["api"]: r for r in api_call_log.api_report(col)}
        by_api, _ = api_log_report.summarize(api_log_report.load_log(_write(tmp_path)))
        pandas_row = by_api.set_index("api").loc["getA"]
        assert report["getA"]["calls"] == pandas_row["calls"]
        assert report["getA"]["success_rate_pct"] == pandas_row["success_rate_pct"]
    finally:
        client.drop_database("tourlink_lab_test")
