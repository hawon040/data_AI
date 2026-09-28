"""정규화 함수. 모든 하위지표를 '클수록 위험'한 0~1 값으로 바꾼다."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C


def robust_minmax(x: pd.Series, reference: pd.Series | None = None, log: bool = True,
                  lower_q: float = C.NORM_LOWER_Q, upper_q: float = C.NORM_UPPER_Q) -> pd.Series:
    """분위수 절단 min-max 정규화.

    r = clip((g(x) - Q_lo) / (Q_hi - Q_lo), 0, 1),  g = log1p (log=True) 또는 항등.

    - reference: 분위수를 구하는 기준 모집단. 사용자가 지역 필터를 걸어도 점수가
      바뀌지 않도록 항상 '전국 전체'를 넘긴다(필터 불변성).
    - log1p: 건수·비율처럼 오른쪽 꼬리가 긴 분포를 펴 준다. 0은 0으로 유지된다.
    - Q_hi <= Q_lo (값 대부분이 0인 희소 지표): Q_hi 를 최댓값으로 올리고,
      그래도 같으면 정보가 없는 지표이므로 0을 돌려준다.
    - 결측(NaN)은 결측으로 남긴다(가중치 재정규화 단계에서 처리).
    """
    ref = x if reference is None else reference
    g = np.log1p if log else (lambda v: v)
    gx = g(x.astype(float))
    gr = g(ref.dropna().astype(float))
    if gr.empty:
        return pd.Series(np.nan, index=x.index)
    lo, hi = gr.quantile(lower_q), gr.quantile(upper_q)
    if hi <= lo:
        hi = gr.max()
    if hi <= lo:
        return pd.Series(np.where(x.isna(), np.nan, 0.0), index=x.index)
    return ((gx - lo) / (hi - lo)).clip(0, 1)


def percentile_rank(x: pd.Series) -> pd.Series:
    """동률은 평균 순위를 쓰는 백분위(0~1). 가장 작은 값 0, 가장 큰 값 1."""
    n = x.notna().sum()
    if n <= 1:
        return pd.Series(np.where(x.isna(), np.nan, 0.5), index=x.index)
    return (x.rank(method="average") - 1) / (n - 1)


def lq_to_unit(lq: pd.Series, cap: float = C.LQ_CAP) -> pd.Series:
    """입지계수(LQ)를 0~1로. 로그를 써서 1을 중심으로 대칭이 되게 한다.

    F' = clip(0.5 + ln(LQ) / (2·ln(cap)), 0, 1) → LQ=1 이면 0.5, LQ=cap 이면 1, LQ=1/cap 이면 0.
    LQ 2배와 1/2배가 중립에서 같은 거리만큼 떨어지므로 '많이 찾는 곳'과
    '덜 찾는 곳'을 대칭으로 다룬다.
    """
    return (0.5 + np.log(lq) / (2 * np.log(cap))).clip(0, 1)
