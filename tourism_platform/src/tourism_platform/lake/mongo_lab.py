"""MongoDB 실습: 관광지·대피소·날씨 컬렉션 적재, ESR 복합 인덱스·2dsphere 인덱스, explain 비교, aggregate ↔ pandas.

DB는 tourlink_lab을 쓴다 — tools/api.py가 쓰는 tourlink DB와 섞이지 않게 하려고 따로 둔다.
접속 주소는 환경변수 MONGO_URI(기본 mongodb://127.0.0.1:27017).
"""
from __future__ import annotations

import os
from typing import Any

import pandas as pd
from pymongo import ASCENDING, DESCENDING, GEOSPHERE, MongoClient

from ..data.preparedness import Facility, nearest_facility

DB_NAME = "tourlink_lab"


def connect():
    client = MongoClient(os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=3000)
    client.admin.command("ping")
    return client[DB_NAME]


def _with_location(records: list[dict]) -> list[dict]:
    # GeoJSON 좌표 순서는 [경도, 위도]다.
    return [{**r, "location": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}} for r in records]


def load(db, *, spots: list[dict], shelters: list[dict], weather: list[dict]) -> dict[str, int]:
    """컬렉션을 비우고 다시 넣는다(같은 날 여러 번 돌려도 결과가 같게)."""
    counts = {}
    for name, records in (("spots", _with_location(spots)), ("shelters", _with_location(shelters)), ("weather", weather)):
        db[name].drop()
        if records:
            db[name].insert_many([dict(r) for r in records])
        counts[name] = db[name].count_documents({})
    return counts


def _stages(plan: dict) -> list[str]:
    """winningPlan을 바깥 단계부터 펼친다 (예: ["SORT", "COLLSCAN"])."""
    out = []
    while plan:
        out.append(plan.get("stage"))
        plan = plan.get("inputStage") or (plan.get("inputStages") or [None])[0]
    return out


def explain_summary(cursor) -> dict[str, Any]:
    ex = cursor.explain()
    plan = ex["queryPlanner"]["winningPlan"]
    plan = plan.get("queryPlan", plan)  # 슬롯 기반 엔진(SBE)은 queryPlan 아래에 있다
    stats = ex["executionStats"]
    stages = _stages(plan)
    return {
        "stages": " → ".join(stages),
        "index": next((s.get("indexName") for s in _walk(plan) if s.get("indexName")), None),
        "in_memory_sort": "SORT" in stages,
        "nReturned": stats["nReturned"],
        "keysExamined": stats["totalKeysExamined"],
        "docsExamined": stats["totalDocsExamined"],
        "ms": stats["executionTimeMillis"],
    }


def _walk(plan: dict):
    while plan:
        yield plan
        plan = plan.get("inputStage") or (plan.get("inputStages") or [None])[0]


def esr_experiment(db, *, sido: str, min_parking: int) -> list[dict]:
    """같은 질의를 인덱스 없음 / 순서가 틀린 인덱스(E-R-S) / ESR 인덱스로 explain해 비교한다.

    질의: 한 시도(Equality)의 주차 min_parking 이상(Range) 관광지를 수용인원 많은 순(Sort)으로.
    """
    query = {"sido": sido, "parking": {"$gte": min_parking}}
    sort = [("capacity", DESCENDING)]
    spots = db["spots"]
    results = []
    for label, keys in (
        ("인덱스 없음", None),
        ("E-R-S 순서 {sido, parking, capacity}", [("sido", ASCENDING), ("parking", ASCENDING), ("capacity", DESCENDING)]),
        ("ESR 순서 {sido, capacity, parking}", [("sido", ASCENDING), ("capacity", DESCENDING), ("parking", ASCENDING)]),
    ):
        spots.drop_indexes()
        if keys:
            spots.create_index(keys)
        results.append({"case": label, **explain_summary(spots.find(query).sort(sort))})
    return results


def weather_esr_experiment(db) -> list[dict] | None:
    """날씨: 관광지(E)·항목(E)의 예보를 시각 순(S)으로, 지금 이후(R, 같은 필드)."""
    weather = db["weather"]
    sample = weather.find_one()
    if sample is None:
        return None
    query = {"spot": sample["spot"], "category": "POP", "fcst_at": {"$gte": sample["fcst_at"]}}
    results = []
    for label, keys in (
        ("인덱스 없음", None),
        ("ESR {spot, category, fcst_at}", [("spot", ASCENDING), ("category", ASCENDING), ("fcst_at", ASCENDING)]),
    ):
        weather.drop_indexes()
        if keys:
            weather.create_index(keys)
        results.append({"case": label, **explain_summary(weather.find(query).sort("fcst_at", ASCENDING))})
    return results


def geo_experiment(db, spots: list[dict], shelters: list[dict], *, sample_size: int = 5) -> tuple[list[dict], dict | None]:
    """2dsphere 인덱스로 관광지마다 가장 가까운 대피소를 찾고, 파이썬 하버사인 결과와 비교한다."""
    db["shelters"].create_index([("location", GEOSPHERE)])
    db["spots"].create_index([("location", GEOSPHERE)])
    facilities = [Facility("지진해일대피소", s["name"], s["lat"], s["lon"]) for s in shelters]
    # 대피소가 있는 해안 관광지 중 가까운 대피소가 있는 곳을 고른다
    candidates = [s for s in spots if (n := nearest_facility(s["lat"], s["lon"], facilities)) and n.distance_km < 10]
    rows = []
    for spot in candidates[:sample_size]:
        mongo = next(db["shelters"].aggregate([
            {"$geoNear": {"near": {"type": "Point", "coordinates": [spot["lon"], spot["lat"]]},
                          "distanceField": "dist_m", "spherical": True}},
            {"$limit": 1},
        ]))
        py = nearest_facility(spot["lat"], spot["lon"], facilities)
        rows.append({
            "spot": spot["name"],
            "mongo_nearest": mongo["name"],
            "mongo_km": round(mongo["dist_m"] / 1000, 3),
            "python_nearest": py.facility.name,
            "python_km": round(py.distance_km, 3),
            "same": mongo["name"] == py.facility.name,
        })
    near_plan = explain_summary(db["shelters"].find({"location": {"$nearSphere": {
        "$geometry": {"type": "Point", "coordinates": [candidates[0]["lon"], candidates[0]["lat"]]},
        "$maxDistance": 10_000}}}).limit(3)) if candidates else None
    return rows, near_plan


def aggregate_vs_pandas(db, spots: list[dict]) -> tuple[pd.DataFrame, bool]:
    """시도별 관광지 수·수용인원 합계·평균을 MongoDB aggregate와 pandas로 각각 구해 비교한다."""
    mongo = pd.DataFrame(list(db["spots"].aggregate([
        {"$group": {"_id": "$sido", "spots": {"$sum": 1}, "capacity_sum": {"$sum": "$capacity"},
                    "capacity_mean": {"$avg": "$capacity"}}},
        {"$sort": {"_id": 1}},
    ]))).rename(columns={"_id": "sido"})
    pdf = (pd.DataFrame(spots).groupby("sido")
           .agg(spots=("name", "size"), capacity_sum=("capacity", "sum"), capacity_mean=("capacity", "mean"))
           .reset_index().sort_values("sido"))
    merged = mongo.merge(pdf, on="sido", suffixes=("_mongo", "_pandas"))
    same = (
        len(merged) == len(mongo) == len(pdf)
        and (merged["spots_mongo"] == merged["spots_pandas"]).all()
        and (merged["capacity_sum_mongo"] == merged["capacity_sum_pandas"]).all()
        and ((merged["capacity_mean_mongo"] - merged["capacity_mean_pandas"]).abs().fillna(0) < 1e-9).all()
    )
    return merged, bool(same)
