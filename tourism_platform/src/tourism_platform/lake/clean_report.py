"""정제 리포트(pandas): 정제 규칙별로 몇 건이 걸러졌는지, 정제 뒤 어떤 칸이 비었는지, 값이 튀는 곳이 있는지.

    python -m tourism_platform.lake.clean_report            # 가장 최근 날짜의 raw를 읽는다
    python -m tourism_platform.lake.clean_report 2026-11-05

pipeline.clean_*가 돌려주는 규칙별 건수(stats)와 정제된 레코드를 표로 바꿔 보여 준다.
정제는 pipeline.py에서 하고, 이 모듈은 그 결과를 설명하는 일만 한다.
"""
from __future__ import annotations

import sys
from datetime import date
from typing import Iterable

import pandas as pd

from . import pipeline

RULE_LABELS = {
    "input": "입력",
    "bad_coords": "좌표 없음·국내 범위 밖",
    "duplicates": "이름+좌표 중복",
    "not_shelter": "지진해일대피소 아님",
    "output": "정제 결과",
}


def rule_table(stats: dict[str, int]) -> pd.DataFrame:
    """규칙별 건수 표. 입력 = 걸러진 건수 합 + 결과가 맞는지(consistent)도 함께 돌려준다."""
    rows = [{"규칙": RULE_LABELS.get(key, key), "건수": count} for key, count in stats.items()]
    return pd.DataFrame(rows)


def stats_are_consistent(stats: dict[str, int]) -> bool:
    removed = sum(count for key, count in stats.items() if key not in ("input", "output"))
    return stats.get("input", 0) - removed == stats.get("output", 0)


def missing_table(records: Iterable[dict], columns: Iterable[str]) -> pd.DataFrame:
    """칸별 비어 있는 건수와 비율(%). 빈 문자열과 None을 모두 비어 있다고 본다."""
    df = pd.DataFrame(list(records))
    rows = []
    for col in columns:
        if col not in df:
            rows.append({"칸": col, "빈 건수": len(df), "비율(%)": 100.0 if len(df) else 0.0})
            continue
        empty = df[col].isna() | (df[col].astype(str).str.strip() == "")
        rows.append({"칸": col, "빈 건수": int(empty.sum()), "비율(%)": round(empty.mean() * 100, 1) if len(df) else 0.0})
    return pd.DataFrame(rows)


def outlier_table(records: Iterable[dict], column: str) -> pd.DataFrame:
    """숫자 칸에서 IQR(사분위 범위) 기준으로 값이 튀는 건수. 정제에서 지우지는 않고 알려만 준다."""
    values = pd.to_numeric(pd.DataFrame(list(records)).get(column), errors="coerce").dropna()
    if values.empty:
        return pd.DataFrame([{"칸": column, "건수": 0, "Q1": None, "Q3": None, "상한": None, "상한 초과": 0}])
    q1, q3 = values.quantile(0.25), values.quantile(0.75)
    upper = q3 + 1.5 * (q3 - q1)
    return pd.DataFrame([{"칸": column, "건수": len(values), "Q1": q1, "Q3": q3, "상한": upper,
                          "상한 초과": int((values > upper).sum())}])


def latest_day(dataset: str) -> date | None:
    folders = sorted(p.name for p in (pipeline.RAW_DIR / dataset).glob("*") if p.is_dir())
    return date.fromisoformat(folders[-1]) if folders else None


def report(day: date | None = None) -> str:
    day = day or latest_day("tourist_spots")
    if day is None:
        return "raw 데이터가 없습니다. python -m tourism_platform.lake.run 으로 먼저 받으세요."
    spots, spot_stats = pipeline.clean_tourspots(pipeline.raw_items("tourist_spots", day))
    parts = [
        f"## 전국관광지정보표준데이터 ({day})", "",
        rule_table(spot_stats).to_markdown(index=False),
        f"\n입력 - 걸러진 건수 = 결과: {'맞음' if stats_are_consistent(spot_stats) else '안 맞음'}", "",
        "정제 뒤 비어 있는 칸", missing_table(spots, ["sido", "sigungu", "capacity", "parking"]).to_markdown(index=False), "",
        "값이 튀는 칸", pd.concat([outlier_table(spots, "capacity"), outlier_table(spots, "parking")]).to_markdown(index=False),
    ]
    _, shelter_stats = pipeline.clean_shelters(pipeline.raw_items("kcisa_tour_safety", day))
    if shelter_stats["input"] > 0:  # 대피소 raw가 없으면 관광지 리포트만 보여 준다
        parts += ["", f"## 관광지 안전정보 → 지진해일대피소 ({day})", "", rule_table(shelter_stats).to_markdown(index=False),
                  f"\n입력 - 걸러진 건수 = 결과: {'맞음' if stats_are_consistent(shelter_stats) else '안 맞음'}"]
    return "\n".join(parts)


if __name__ == "__main__":
    print(report(date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else None))
