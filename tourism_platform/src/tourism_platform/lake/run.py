"""작은 규모로 레이크 → MongoDB → 리포트를 한 번에 실행한다.

    DATA_GO_KR_SERVICE_KEY=... KCISA_API_KEY=... python -m tourism_platform.lake.run
"""
from __future__ import annotations

import json
from datetime import datetime

import pandas as pd

from ..data.apis.weather import KST
from . import api_log_report, mongo_lab, pipeline

WEATHER_SAMPLE_SPOTS = 5  # 날씨는 수용인원이 큰 강원 관광지 5곳만 받는다(작은 규모)


def main() -> None:
    now = datetime.now(KST)
    day = now.date()

    print("## 1. raw — API 원본 저장")
    for dataset in ("national_tourspots", "kcisa_tour_safety"):
        rows = 3000 if dataset == "kcisa_tour_safety" else 1000
        paths = pipeline.ingest(dataset, day=day, num_of_rows=rows)
        print(f"- {dataset}: {len(paths)}개 파일 → {paths[0].parent}")

    print("\n## 2. processed — 정제")
    spots, spot_stats = pipeline.clean_tourspots(pipeline.raw_items("national_tourspots", day))
    shelters, shelter_stats = pipeline.clean_shelters(pipeline.raw_items("kcisa_tour_safety", day))
    sample = sorted((s for s in spots if s["sido"] == "강원" and s["capacity"]), key=lambda s: -s["capacity"])
    weather, weather_errors = pipeline.fetch_weather_for_spots(sample[:WEATHER_SAMPLE_SPOTS], now=now)
    for name, records, stats in (("tourspots", spots, spot_stats), ("shelters", shelters, shelter_stats),
                                 ("weather", weather, {"spots_tried": min(len(sample), WEATHER_SAMPLE_SPOTS),
                                                       "failed": len(weather_errors)})):
        path = pipeline.write_jsonl(records, name, day)
        print(f"- {name}: {json.dumps(stats, ensure_ascii=False)} → {path}")
    for err in weather_errors[:2]:
        print(f"  - 날씨 실패 예: {err[:120]}")

    print("\n## 3. gold — 지표 Parquet")
    gold = pipeline.build_gold(spots, shelters)
    for name, path in pipeline.write_gold(gold).items():
        back = pd.read_parquet(path)
        print(f"- {name}: {len(back)}행 → {path}")
    print(gold["region_indicators"].sort_values("spots", ascending=False).head(8).to_markdown(index=False))

    print("\n## 4. MongoDB")
    db = mongo_lab.connect()
    print(f"- 적재: {mongo_lab.load(db, spots=spots, shelters=shelters, weather=weather)} (DB {mongo_lab.DB_NAME})")
    print("\n### ESR 복합 인덱스 — 강원 관광지 중 주차 100면 이상, 수용인원 많은 순")
    print(pd.DataFrame(mongo_lab.esr_experiment(db, sido="강원", min_parking=100)).to_markdown(index=False))
    weather_esr = mongo_lab.weather_esr_experiment(db)
    print("\n### 날씨 컬렉션 ESR")
    print(pd.DataFrame(weather_esr).to_markdown(index=False) if weather_esr else "- 날씨 문서가 없어 건너뜀")
    print("\n### 2dsphere — 가장 가까운 지진해일대피소 ($geoNear vs 파이썬 하버사인)")
    geo_rows, near_plan = mongo_lab.geo_experiment(db, spots, shelters)
    print(pd.DataFrame(geo_rows).to_markdown(index=False))
    print(f"- $nearSphere explain: {near_plan}")
    print("\n### aggregate vs pandas — 시도별 관광지 수·수용인원")
    merged, same = mongo_lab.aggregate_vs_pandas(db, spots)
    print(merged.head(8).to_markdown(index=False))
    print(f"- 전체 {len(merged)}개 시도 결과 일치: {same}")

    print("\n## 5. API 호출 리포트")
    print(api_log_report.report())


if __name__ == "__main__":
    main()
