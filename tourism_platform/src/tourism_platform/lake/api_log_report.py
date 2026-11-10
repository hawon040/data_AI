"""API 호출 로그(data/logs/api_calls.jsonl) → API별 성공률·응답시간·오류 리포트.

    python -m tourism_platform.lake.api_log_report
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd

from ..data.datagokr_client import DEFAULT_API_LOG


def load_log(path: Path | None = None) -> pd.DataFrame:
    path = Path(path or os.environ.get("TOURLINK_API_LOG") or DEFAULT_API_LOG)
    if not path.exists():
        return pd.DataFrame(columns=["time", "api", "name", "elapsed_ms", "ok", "status", "rows", "error"])
    return pd.DataFrame([json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line])


def summarize(log: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(API별 요약, 오류 유형별 건수)."""
    if log.empty:
        return pd.DataFrame(), pd.DataFrame()
    by_api = (
        log.groupby("api")
        .agg(calls=("ok", "size"), success=("ok", "sum"),
             mean_ms=("elapsed_ms", "mean"), p50_ms=("elapsed_ms", "median"),
             p95_ms=("elapsed_ms", lambda s: s.quantile(0.95)), max_ms=("elapsed_ms", "max"))
        .reset_index()
    )
    by_api["success_rate_pct"] = (by_api["success"] / by_api["calls"] * 100).round(1)
    by_api[["mean_ms", "p50_ms", "p95_ms", "max_ms"]] = by_api[["mean_ms", "p50_ms", "p95_ms", "max_ms"]].round(0)
    failures = log[~log["ok"].astype(bool)].copy()
    if failures.empty:
        return by_api, pd.DataFrame()
    failures["error_type"] = failures.apply(
        lambda r: f"HTTP {int(r['status'])}" if pd.notna(r["status"]) else str(r["error"]).split(":")[0][:60], axis=1)
    errors = failures.groupby(["api", "error_type"]).size().rename("count").reset_index()
    return by_api, errors


def report(path: Path | None = None) -> str:
    log = load_log(path)
    by_api, errors = summarize(log)
    if by_api.empty:
        return "호출 로그가 없습니다."
    lines = [f"호출 {len(log)}건 · 기간 {log['time'].min()} ~ {log['time'].max()} (UTC)", "",
             by_api.to_markdown(index=False)]
    if not errors.empty:
        lines += ["", errors.to_markdown(index=False)]
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())
