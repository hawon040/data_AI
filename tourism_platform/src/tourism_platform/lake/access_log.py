"""tourapi 접근 로그(Fluent Bit 출력)를 MongoDB access_logs 컬렉션에 넣고 분석한다.

흐름: api.py(ACCESS_LOG=1) → tourapi/logs/access.jsonl → Fluent Bit(tail → file)
      → tourapi/logs/fluent-out/access.jsonl → 이 모듈 → MongoDB tourlink.access_logs

실행 방법 (tourism_platform 폴더에서):

    python -m tourism_platform.lake.access_log
    python -m tourism_platform.lake.access_log --file ../tourapi/logs/fluent-out/access.jsonl --db tourlink

- 접속 주소는 환경변수 MONGO_URI(기본 mongodb://127.0.0.1:27017)
- 같은 파일을 여러 번 넣어도 중복되지 않는다(줄 내용 + 같은 줄의 순번으로 _id를 만든다).
- 인덱스: level_ts {level: 1, ts: -1}, ts_ttl_30d {ts: 1}(30일 뒤 자동 삭제)
- ts는 api.py가 남긴 한국 시각을 UTC Date로 바꿔 저장한다(TTL 인덱스는 Date 필드에만 동작).
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
DEFAULT_FILE = REPO_ROOT / "tourapi" / "logs" / "fluent-out" / "access.jsonl"
COLLECTION = "access_logs"
KST = dt.timezone(dt.timedelta(hours=9))
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
            local = dt.datetime.strptime(rec["ts"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=KST)
            docs.append({**rec, "_id": f"{digest}-{seen[digest]}", "ts": local.astimezone(dt.timezone.utc)})
    return docs


def connect(db_name: str):
    client = MongoClient(os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"),
                         serverSelectionTimeoutMS=3000, tz_aware=True)
    client.admin.command("ping")
    return client[db_name]


def ensure_indexes(col) -> dict:
    col.create_index([("level", ASCENDING), ("ts", DESCENDING)], name="level_ts")
    col.create_index("ts", expireAfterSeconds=TTL_SECONDS, name="ts_ttl_30d")
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


def path_report(col) -> list[dict]:
    """경로별 요청 수, 4xx 비율, 오류율(5xx), 평균 응답시간."""
    pipeline = [
        {"$group": {
            "_id": "$path",
            "requests": {"$sum": 1},
            "warn": {"$sum": {"$cond": [{"$eq": ["$level", "WARN"]}, 1, 0]}},
            "error": {"$sum": {"$cond": [{"$eq": ["$level", "ERROR"]}, 1, 0]}},
            "avg_ms": {"$avg": "$ms"},
        }},
        {"$project": {
            "_id": 0, "path": "$_id", "requests": 1,
            "warn_pct": {"$round": [{"$multiply": [{"$divide": ["$warn", "$requests"]}, 100]}, 1]},
            "error_pct": {"$round": [{"$multiply": [{"$divide": ["$error", "$requests"]}, 100]}, 1]},
            "avg_ms": {"$round": ["$avg_ms", 1]},
        }},
        {"$sort": {"requests": -1, "path": 1}},
    ]
    return list(col.aggregate(pipeline))


def plan(cursor) -> dict:
    """explain 결과에서 실행 단계와 검사한 키·문서 수를 뽑는다."""
    e = cursor.explain()
    wp = e["queryPlanner"]["winningPlan"]
    stage, stages = wp.get("queryPlan", wp), []
    while stage:
        stages.append(stage["stage"] + (f"({stage['indexName']})" if "indexName" in stage else ""))
        stage = stage.get("inputStage")
    st = e["executionStats"]
    return {"stages": " → ".join(stages), "returned": st["nReturned"],
            "keys": st["totalKeysExamined"], "docs": st["totalDocsExamined"]}


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

    print("\n[경로별 요청 수 · 4xx 비율 · 오류율(5xx) · 평균 응답시간]")
    print(f"  {'path':<28}{'요청':>6}{'4xx%':>8}{'오류%':>8}{'평균ms':>10}")
    for r in path_report(col):
        print(f"  {r['path']:<28}{r['requests']:>6}{r['warn_pct']:>8}{r['error_pct']:>8}{r['avg_ms']:>10}")

    print("\n[explain: level=WARN 최근 순]")
    query = lambda: col.find({"level": "WARN"}).sort("ts", -1)  # noqa: E731
    with_index = plan(query())
    without_index = plan(query().hint([("$natural", 1)]))
    print(f"  인덱스 사용: {with_index}")
    print(f"  인덱스 없이: {without_index}")
    print(f"  IXSCAN 사용: {'예' if 'IXSCAN' in with_index['stages'] else '아니오'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fluent Bit 출력 접근 로그를 MongoDB access_logs에 넣고 분석한다.")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Fluent Bit 출력 파일")
    parser.add_argument("--db", default=os.environ.get("MONGO_DB", "tourlink"), help="MongoDB DB 이름 (기본 tourlink)")
    args = parser.parse_args()
    main(args.file, args.db)
