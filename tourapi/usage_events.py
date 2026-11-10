"""서비스 사용자 기록(성별·연령대, 방문 후 평가, 길찾기 클릭) 받기·저장·요약.

받는 것은 성별·연령대·지역·관광지·행동뿐이다. 이름, 연락처, 정확한 나이, 좌표 같은 개인 식별 정보는 받지 않고,
허용하지 않은 필드가 하나라도 있으면 기록 전체를 거절한다. IP는 요청 제한에만 쓰고 저장하지 않는다.
anon_id는 브라우저가 만든 임의 값으로, 같은 사람의 반복 기록을 한 번만 세는 데만 쓴다.

형식 검증과 요약 계산은 tourism_platform/usage/(events.py, aggregate.py, affinity.py)와 같은 규칙이다.
Vercel에는 이 폴더의 파일만 올라가서 표준 라이브러리만으로 다시 적었고,
tourism_platform/tests/test_usage_api.py가 두 구현의 결과가 같은지 확인한다.

POST /api/usage          기록 한 건 저장 (201 저장, 200 중복, 400 형식 오류, 413 너무 큼, 429 요청 제한, 503 저장소 없음)
GET  /api/usage/summary  지역×집단 건수와 평가 통계 (웹이 특화지수·선호 가중치를 계산하는 재료)
"""
import datetime as dt
import hashlib
import json
import math
import threading
import time
from collections import defaultdict

import rediscache

COLLECTION = "usage_events"
MAX_BODY_BYTES = 2048

GENDERS = ("M", "F")
AGE_GROUPS = ("10s", "20s", "30s", "40s", "50s", "60plus")
KINDS = ("rating", "directions")
ALLOWED_FIELDS = frozenset({"anon_id", "kind", "region_code", "attraction", "gender", "age_group", "occurred_at", "score"})
TEXT_LIMIT = 100  # 문자열 필드 길이 제한

# usage/aggregate.py, usage/affinity.py와 같은 값
EVENT_WEIGHTS = {"rating": 1.0, "directions": 0.5}
DECAY_DAYS = 180.0

# 요청 제한 (잠정값): 같은 anon_id는 시간당 30건, 같은 IP는 시간당 200건
LIMIT_PER_ANON = 30
LIMIT_PER_IP = 200
WINDOW_SECONDS = 3600


def parse_event(raw):
    """JSON으로 받은 기록 한 건을 검증해 저장용 dict로 바꾼다. 형식이 틀리면 ValueError."""
    if not isinstance(raw, dict):
        raise ValueError("기록은 JSON 객체여야 합니다")
    extra = set(raw) - ALLOWED_FIELDS
    if extra:
        raise ValueError(f"허용하지 않는 필드입니다: {sorted(extra)}")
    for field in ("anon_id", "kind", "region_code", "attraction", "gender", "age_group", "occurred_at"):
        if not raw.get(field):
            raise ValueError(f"{field}가 없습니다")
    for field in ("anon_id", "region_code", "attraction"):
        if not isinstance(raw[field], str) or len(raw[field]) > TEXT_LIMIT:
            raise ValueError(f"{field}는 {TEXT_LIMIT}자 이하의 문자열이어야 합니다")
    if raw["kind"] not in KINDS:
        raise ValueError(f"kind는 {KINDS} 중 하나여야 합니다: {raw['kind']!r}")
    if raw["gender"] not in GENDERS:
        raise ValueError(f"gender는 {GENDERS} 중 하나여야 합니다: {raw['gender']!r}")
    if raw["age_group"] not in AGE_GROUPS:
        raise ValueError(f"age_group은 {AGE_GROUPS} 중 하나여야 합니다: {raw['age_group']!r}")

    score = raw.get("score")
    if raw["kind"] == "rating":
        if isinstance(score, bool) or not isinstance(score, int) or not 1 <= score <= 5:
            raise ValueError(f"평가 점수는 1~5의 정수여야 합니다: {score!r}")
    elif score is not None:
        raise ValueError("길찾기 기록에는 score를 넣을 수 없습니다")

    try:
        when = dt.datetime.fromisoformat(raw["occurred_at"]) if isinstance(raw["occurred_at"], str) else None
    except ValueError:
        when = None
    if when is None or when.tzinfo is None:
        raise ValueError("occurred_at은 시간대가 있는 시각이어야 합니다 (예: 2026-11-10T09:00:00+09:00)")

    return {
        "anon_id": raw["anon_id"], "kind": raw["kind"], "region_code": raw["region_code"],
        "attraction": raw["attraction"], "gender": raw["gender"], "age_group": raw["age_group"],
        "occurred_at": when.astimezone(dt.timezone.utc), "score": score,
    }


def event_id(event):
    """같은 사람이 같은 날 같은 관광지에 같은 행동을 반복해도 한 건으로 세도록 _id를 만든다."""
    key = "|".join([event["anon_id"], event["kind"], event["region_code"], event["attraction"],
                    event["occurred_at"].date().isoformat()])
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# 요청 제한: Redis가 있으면 인스턴스끼리 함께 세고, 없으면 이 프로세스 안에서만 센다.
# ---------------------------------------------------------------------------

_local_hits = defaultdict(list)
_local_lock = threading.Lock()


def allow(key, limit, window=WINDOW_SECONDS):
    """key로 window초 동안 limit번까지 허용한다. 넘으면 False."""
    conn = rediscache.client()
    if conn is not None:
        try:
            redis_key = rediscache.KEY_PREFIX + "rate:" + key
            count = conn.incr(redis_key)
            if count == 1:
                conn.expire(redis_key, window)
            return count <= limit
        except Exception as error:
            print(f"[Redis] 요청 제한 확인 실패, 이 서버 안에서만 셉니다: {error}")
    now = time.time()
    with _local_lock:
        hits = [t for t in _local_hits[key] if now - t < window]
        hits.append(now)
        _local_hits[key] = hits
        return len(hits) <= limit


def reset_limits():
    with _local_lock:
        _local_hits.clear()


# ---------------------------------------------------------------------------
# 저장과 요약
# ---------------------------------------------------------------------------

_index_ready = {"ready": False}


def ensure_indexes(db):
    if _index_ready["ready"]:
        return
    col = db[COLLECTION]
    col.create_index([("region_code", 1), ("gender", 1), ("age_group", 1)], name="region_group")
    col.create_index([("attraction", 1), ("age_group", 1), ("occurred_at", -1)], name="attraction_age_time")
    _index_ready["ready"] = True


def save_event(db, event):
    """저장하면 True, 이미 같은 기록(같은 _id)이 있으면 False."""
    ensure_indexes(db)
    try:
        db[COLLECTION].insert_one({**event, "_id": event_id(event)})
        return True
    except Exception as error:
        if getattr(error, "code", None) == 11000 or type(error).__name__ == "DuplicateKeyError":
            return False
        raise


def handle_post(db, body, client_ip):
    """POST /api/usage 처리. (HTTP 상태, 응답 dict)를 돌려준다."""
    if len(body) > MAX_BODY_BYTES:
        return 413, {"error": "요청이 너무 큽니다."}
    try:
        event = parse_event(json.loads(body.decode("utf-8")))
    except (ValueError, UnicodeDecodeError) as error:
        return 400, {"error": str(error)}
    ip_key = hashlib.sha1(client_ip.encode("utf-8")).hexdigest()[:16]
    if not allow("anon:" + event["anon_id"], LIMIT_PER_ANON) or not allow("ip:" + ip_key, LIMIT_PER_IP):
        return 429, {"error": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."}
    if db is None:
        return 503, {"error": "기록 저장소가 설정되지 않았습니다."}
    saved = save_event(db, event)
    return (201 if saved else 200), {"saved": saved, "duplicate": not saved}


def _decay(now, when):
    days = max((now - when).total_seconds() / 86400.0, 0.0)
    return math.exp(-days / DECAY_DAYS)


def summarize(docs, now):
    """기록 목록 → 웹이 특화지수와 선호 가중치를 계산할 재료."""
    region_counts = defaultdict(lambda: defaultdict(float))
    age_pairs = defaultdict(list)
    attraction_pairs = defaultdict(lambda: defaultdict(list))
    total = 0
    for doc in docs:
        total += 1
        group = f"{doc['gender']}_{doc['age_group']}"
        region_counts[doc["region_code"]][group] += EVENT_WEIGHTS[doc["kind"]]
        if doc["kind"] == "rating":
            when = doc["occurred_at"]
            if when.tzinfo is None:
                when = when.replace(tzinfo=dt.timezone.utc)
            pair = (_decay(now, when), float(doc["score"]))
            age_pairs[doc["age_group"]].append(pair)
            attraction_pairs[doc["attraction"]][doc["age_group"]].append(pair)

    def stat(pairs):
        weight = sum(w for w, _ in pairs)
        return {"n": round(weight, 4), "mean": round(sum(w * s for w, s in pairs) / weight, 4), "count": len(pairs)}

    return {
        "available": True,
        "total": total,
        "generatedAt": now.isoformat(),
        "regionGroupCounts": {r: {g: round(c, 4) for g, c in groups.items()} for r, groups in region_counts.items()},
        "ageRatings": {age: stat(pairs) for age, pairs in age_pairs.items()},
        # 관광지 이름에 '.' 같은 글자가 있어도 MongoDB 필드 이름 제한에 걸리지 않게 목록으로 둔다.
        "attractionRatings": [
            {"attraction": a, "ageGroup": age, **stat(p)}
            for a, ages in sorted(attraction_pairs.items()) for age, p in sorted(ages.items())
        ],
    }


def empty_summary():
    return {"available": False, "total": 0, "generatedAt": None, "regionGroupCounts": {},
            "ageRatings": {}, "attractionRatings": []}


def load_summary(db, now=None):
    if db is None:
        return empty_summary()
    now = now or dt.datetime.now(dt.timezone.utc)
    docs = db[COLLECTION].find({}, {"_id": 0, "kind": 1, "region_code": 1, "attraction": 1, "gender": 1,
                                    "age_group": 1, "occurred_at": 1, "score": 1})
    return summarize(docs, now)
