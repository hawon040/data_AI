"""실내/야외 분류 정확도 비교: 지금 쓰는 키워드 규칙 vs Orange로 만든 분류 모델.

    python -m tourism_platform.validation.setting_compare
    python -m tourism_platform.validation.setting_compare --orange data/orange/orange_predictions.csv --orange-col "Logistic Regression"

입력
  data/orange/attractions.csv        web/scripts/attraction_setting_cli.ts가 만든 파일. label 칸에 팀이 정답(indoor/outdoor)을 적는다.
  data/orange/orange_predictions.csv (선택) Orange에서 Save Data로 내보낸 예측. region, name 열과 예측 열이 있어야 한다.

정답(label)이 적힌 행만 비교한다. 정답은 사람이 적는 값이라 이 모듈은 만들어 내지 않는다.
교차검증 없이 학습에 쓴 행으로 정확도를 재면 부풀려지므로, Orange 쪽 정확도는 Orange의 Test and Score(교차검증) 값을 함께 확인한다.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

DEFAULT_LABELED = Path(__file__).resolve().parents[3] / "data" / "orange" / "attractions.csv"
VALID = {"indoor", "outdoor"}


def load_labeled(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str).fillna("")
    df["label"] = df["label"].str.strip().str.lower()
    bad = sorted(set(df.loc[(df["label"] != "") & ~df["label"].isin(VALID), "label"]))
    if bad:
        raise ValueError(f"label은 indoor 또는 outdoor만 쓸 수 있습니다: {bad}")
    return df[df["label"] != ""].reset_index(drop=True)


def evaluate(df: pd.DataFrame, pred_col: str, label_col: str = "label") -> dict:
    """정확도, 혼동행렬(행=정답, 열=예측), 틀린 행 목록."""
    wrong = df[df[pred_col] != df[label_col]]
    return {
        "n": len(df),
        "correct": len(df) - len(wrong),
        "accuracy_pct": round((len(df) - len(wrong)) / len(df) * 100, 1) if len(df) else None,
        "confusion": pd.crosstab(df[label_col], df[pred_col]).reindex(index=sorted(VALID), columns=sorted(VALID), fill_value=0),
        "wrong": wrong,
    }


def merge_orange(df: pd.DataFrame, orange_csv: Path, orange_col: str) -> pd.DataFrame:
    pred = pd.read_csv(orange_csv, dtype=str).fillna("")
    for needed in ("region", "name", orange_col):
        if needed not in pred:
            raise ValueError(f"{orange_csv}에 '{needed}' 열이 없습니다. 있는 열: {list(pred.columns)}")
    pred = pred[["region", "name", orange_col]].rename(columns={orange_col: "orange"})
    pred["orange"] = pred["orange"].str.strip().str.lower()
    merged = df.merge(pred, on=["region", "name"], how="left")
    return merged[merged["orange"].isin(VALID)].reset_index(drop=True)


def report(labeled: Path = DEFAULT_LABELED, orange: Path | None = None, orange_col: str = "Logistic Regression") -> str:
    df = load_labeled(labeled)
    if df.empty:
        return "label 칸이 비어 있습니다. data/orange/attractions.csv에 정답(indoor/outdoor)을 먼저 적으세요."
    out = []
    for title, frame, col in [("키워드 규칙 (현재 서비스)", df, "rule_setting")] + (
        [(f"Orange ({orange_col})", merge_orange(df, orange, orange_col), "orange")] if orange else []
    ):
        result = evaluate(frame, col)
        out += [f"## {title}", f"정답이 있는 관광지 {result['n']}곳 중 {result['correct']}곳 일치 (정확도 {result['accuracy_pct']}%)", "",
                "혼동행렬 (행=정답, 열=예측)", result["confusion"].to_markdown(), ""]
        if len(result["wrong"]):
            out += ["틀린 곳", result["wrong"][["region", "name", "category", "label", col]].to_markdown(index=False), ""]
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="실내/야외 분류 정확도: 키워드 규칙 vs Orange")
    ap.add_argument("--labeled", type=Path, default=DEFAULT_LABELED)
    ap.add_argument("--orange", type=Path, default=None)
    ap.add_argument("--orange-col", default="Logistic Regression")
    args = ap.parse_args()
    print(report(args.labeled, args.orange, args.orange_col))
