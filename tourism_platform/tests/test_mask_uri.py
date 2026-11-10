"""tourapi/api.py의 _mask_uri와 /api/db/status 응답이 MongoDB 접속 주소의 아이디·비밀번호를 내보내지 않는지 확인한다."""
import importlib.util
import sys
from pathlib import Path

import pytest

TOURAPI = Path(__file__).resolve().parents[2] / "tourapi"
sys.path.insert(0, str(TOURAPI))

SECRET = "s3cr%40Pw"


@pytest.fixture(scope="module")
def api():
    spec = importlib.util.spec_from_file_location("tour_app_mask", TOURAPI / "api.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("uri", "masked"),
    [
        # 비밀번호가 있는 주소 (비밀번호 안의 @는 %40으로 인코딩된다)
        (f"mongodb://tourlink:{SECRET}@db.example.com:27017/tourlink?authSource=admin",
         "mongodb://***@db.example.com:27017"),
        # 로컬 주소: 계정이 없으면 그대로
        ("mongodb://localhost:27017", "mongodb://localhost:27017"),
        ("mongodb://127.0.0.1:27017/", "mongodb://127.0.0.1:27017"),
        # Atlas srv 주소: 경로·옵션도 뺀다
        (f"mongodb+srv://tourlink:{SECRET}@cluster0.abcd.mongodb.net/?retryWrites=true&w=majority",
         "mongodb+srv://***@cluster0.abcd.mongodb.net"),
        # 여러 호스트(복제 세트)
        (f"mongodb://u:{SECRET}@h1:27017,h2:27017/?replicaSet=rs0", "mongodb://***@h1:27017,h2:27017"),
        # 형식이 이상하면 통째로 가린다
        (f"tourlink:{SECRET}@host", "***"),
        ("", "***"),
    ],
)
def test_mask_uri(api, uri, masked):
    assert api._mask_uri(uri) == masked
    assert SECRET not in api._mask_uri(uri)


def test_db_status_hides_credentials(api, monkeypatch):
    uri = f"mongodb+srv://tourlink:{SECRET}@cluster0.abcd.mongodb.net/?retryWrites=true"
    monkeypatch.setattr(api, "MONGO_URI", uri)

    monkeypatch.setattr(api, "_mongo_db", lambda: None)
    offline = api.fetch_db_status()
    assert offline["host"] == "mongodb+srv://***@cluster0.abcd.mongodb.net"
    assert "uri" not in offline

    mongomock = pytest.importorskip("mongomock")
    db = mongomock.MongoClient()["tourlink"]
    db["_meta"].insert_one({"_id": "tourspots", "kind": "list", "count": 1, "savedAt": 0})
    monkeypatch.setattr(api, "_mongo_db", lambda: db)
    online = api.fetch_db_status()
    assert online["connected"] is True and "uri" not in online
    assert SECRET not in repr(online) and "tourlink:" not in online["host"]
