"""공공데이터 호출 로그(Fluent Bit 출력)를 MongoDB api_calls 컬렉션에 넣고 분석한다.

흐름: datagokr_client.fetch → data/logs/api_calls.jsonl → Fluent Bit(tail → file)
      → tourapi/logs/fluent-out/api_calls.jsonl → 이 모듈 → MongoDB tourlink.api_calls

실행 방법 (tourism_platform 폴더에서):

    python -m tourism_platform.lake.api_call_log
    python -m tourism_platform.lake.api_call_log --file ../tourapi/logs/fluent-out/api_calls.jsonl --db tourlink

- 접속 주소는 환경변수 MONGO_URI(기본 mongodb://127.0.0.1:27017)
- 같은 파일을 여러 번 넣어도 중복되지 않는다(줄 내용 + 같은 줄의 순번으로 _id를 만든다).
- 인덱스: api_time {api: 1, time: -1}, time_ttl_30d {time: 1}(30일 뒤 자동 삭제)
- time은 UTC Date로 저장한다(TTL 인덱스는 Date 필드에만 동작).
- 서비스키와 요청 파라미터 값은 원본 로그에 없으므로 여기에도 없다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from collections import Counter
from pathlib import Path

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import BulkWriteError

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_FILE = REPO_ROOT / "tourapi" / "logs" / "fluent-out" / "api_calls.jsonl"
COLLECTION = "api_calls"
TTL_SECONDS = 30 * 24 * 60 * 60


def read_records(path: Path) -> list[dict]:
    """Fluent Bit 출력(JSON 한 줄씩)을 읽어 MongoDB 문서로 바꾼다."""
    docs, seen = [], Counter()
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            digest = hashlib.sha1(line.encode("utf-8")).hexdigest()
            seen[digest] += 1
            when = dt.datetime.fromisoformat(rec["time"]).astimezone(dt.timezone.utc)
            docs.append({**rec, "_id": f"{digest}-{seen[digest]}", "time": when})
    return docs


def connect(db_name: str):
    client = MongoClient(os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"),
                         serverSelectionTimeoutMS=3000, tz_aware=True)
    client.admin.command("ping")
    return client[db_name]


def ensure_indexes(col) -> dict:
    col.create_index([("api", ASCENDING), ("time", DESCENDING)], name="api_time")
    col.create_index("time", expireAfterSeconds=TTL_SECONDS, name="time_ttl_30d")
    return {name: (info["key"], info.get("expireAfterSeconds")) for name, info in col.index_information().items()}


def load(col, docs: list[dict]) -> int:
    """새 문서만 넣고, 넣은 수를 돌려준다(이미 있는 _id는 건너뛴다)."""
    if not docs:
        return 0
    try:
        return len(col.insert_many(docs, ordered=False).inserted_ids)
    except BulkWriteError as error:
        dup = [e for e in error.details["writeErrors"] if e["code"] == 11000]
        if len(dup) != len(error.details["writeErrors"]):
            raise
        return error.details["nInserted"]


def api_report(col) -> list[dict]:
    """API별 호출 수, 성공 수, 성공률(%), 평균 응답시간(ms)."""
    pipeline = [
        {"$group": {
            "_id": "$api",
            "calls": {"$sum": 1},
            "success": {"$sum": {"$cond": ["$ok", 1, 0]}},
            "avg_ms": {"$avg": "$elapsed_ms"},
        }},
        {"$project": {
            "_id": 0, "api": "$_id", "calls": 1, "success": 1,
            "success_rate_pct": {"$round": [{"$multiply": [{"$divide": ["$success", "$calls"]}, 100]}, 1]},
            "avg_ms": {"$round": ["$avg_ms", 0]},
        }},
        {"$sort": {"calls": -1, "api": 1}},
    ]
    return list(col.aggregate(pipeline))


def main(file: Path = DEFAULT_FILE, db_name: str = "tourlink") -> None:
    col = connect(db_name)[COLLECTION]
    docs = read_records(file)
    indexes = ensure_indexes(col)
    inserted = load(col, docs)
    print(f"파일 {file}")
    print(f"읽은 줄 {len(docs)}, 새로 넣은 문서 {inserted}, 컬렉션 {db_name}.{COLLECTION} 문서 {col.count_documents({})}")
    print("인덱스:")
    for name, (key, ttl) in indexes.items():
        print(f"  {name}: {key}" + (f", expireAfterSeconds={ttl}" if ttl is not None else ""))
    print("\n[API별 호출 수 · 성공률 · 평균 응답시간]")
    print(f"  {'api':<30}{'호출':>6}{'성공률%':>9}{'평균ms':>9}")
    for r in api_report(col):
        print(f"  {r['api']:<30}{r['calls']:>6}{r['success_rate_pct']:>9}{r['avg_ms']:>9}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fluent Bit 출력 API 호출 로그를 MongoDB api_calls에 넣고 분석한다.")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Fluent Bit 출력 파일")
    parser.add_argument("--db", default=os.environ.get("MONGO_DB", "tourlink"), help="MongoDB DB 이름 (기본 tourlink)")
    args = parser.parse_args()
    main(args.file, args.db)
