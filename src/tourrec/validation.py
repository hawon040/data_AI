"""성능평가: 정답 레이블이 없는 지수형 문제이므로 (1) 외부 지표와의 수렴 타당도,
(2) 가중치·파라미터 민감도(순위 안정성), (3) 가중치 불확실성의 몬테카를로 전파로 평가한다.
"""
from __future__ import annotations

import itertools

import numpy as np
import pandas as pd

from . import config as C
from .scoring import Features, build_features, profile_weights, recommend, score


def spearman(x: pd.Series, y: pd.Series) -> float:
    """스피어만 순위상관 = 순위(평균 순위)끼리의 피어슨 상관 (scipy 불필요)."""
    df = pd.concat([x, y], axis=1).dropna()
    return float(df.iloc[:, 0].rank().corr(df.iloc[:, 1].rank()))


def jaccard(a, b) -> float:
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 1.0


def convergent_validity(fx: Features, safety_index: pd.DataFrame) -> pd.DataFrame:
    """시군구 원지표와 행정안전부 지역안전지수 등급(1 안전 ~ 5 위험)의 스피어만 상관.

    지역안전지수는 입력에 넣지 않고 검증 기준으로만 쓴다(같은 정보를 입력과 정답에
    동시에 쓰면 상관이 부풀려지는 순환 논리를 피하기 위해). 기대 부호는 양(+).
    등급이 '같은 유형 지자체 안의 상대 등급'이라 유형(시/군/구)별로도 따로 본다.
    """
    a = fx.attractions.drop_duplicates("sgg_code").set_index("sgg_code")
    rows = []
    for field_name, col in [("범죄", "raw_crime_rate"), ("교통사고", "raw_traffic_area")]:
        g = safety_index[safety_index["field"] == field_name].set_index("sgg_code")["grade"]
        df = pd.DataFrame({"x": a[col], "grade": g}).dropna()
        rows.append({"분야": field_name, "지표": col.removeprefix("raw_"), "n": len(df),
                     "spearman": spearman(df["x"], df["grade"])})
    return pd.DataFrame(rows)


def weight_grid_sensitivity(fx: Features, age: str, companion: str, month: int,
                            time_slot: str = "주간", step: float = 0.1, top_n: int = C.DEFAULT_TOP_N,
                            min_alpha: float = 0.0) -> pd.DataFrame:
    """α+β+γ=1 단체(simplex) 격자 전체에서 상위 N 목록이 기준안과 얼마나 겹치는지.

    출력: alpha, beta, gamma, jaccard(상위 N 겹침), spearman(전체 점수 순위 상관)
    """
    base = score(fx, age, companion, month, time_slot)
    base_top = recommend(base, top_n)["content_id"]
    base_score = base.set_index("content_id")["score"]
    rows = []
    n = int(round(1 / step))
    for i, j in itertools.product(range(n + 1), repeat=2):
        if i + j > n:
            continue
        a, b = i * step, j * step
        g = max(0.0, 1 - a - b)
        if a < min_alpha:
            continue
        s = score(fx, age, companion, month, time_slot, a, b, g)
        rows.append({"alpha": round(a, 3), "beta": round(b, 3), "gamma": round(g, 3),
                     "jaccard": jaccard(base_top, recommend(s, top_n)["content_id"]),
                     "spearman": spearman(base_score, s.set_index("content_id")["score"])})
    return pd.DataFrame(rows)


def parameter_sensitivity(tables: dict, age: str, companion: str, month: int,
                          thetas=(0.0, 0.5, 1.0), radii=(0.3, 0.5, 1.0),
                          top_n: int = C.DEFAULT_TOP_N) -> pd.DataFrame:
    """유효인구 θ, 관광지 반경 r 을 바꿔 다시 계산했을 때 상위 N 겹침."""
    base_fx = build_features(tables)
    base_top = recommend(score(base_fx, age, companion, month), top_n)["content_id"]
    rows = []
    for th, r in itertools.product(thetas, radii):
        fx = build_features(tables, theta=th, radius_km=r)
        top = recommend(score(fx, age, companion, month), top_n)["content_id"]
        rows.append({"theta": th, "radius_km": r, "jaccard": jaccard(base_top, top)})
    return pd.DataFrame(rows)


def monte_carlo_ranks(fx: Features, age: str, companion: str, month: int, time_slot: str = "주간",
                      n_runs: int = 300, kappa: float = 30.0, top_n: int = C.DEFAULT_TOP_N,
                      seed: int = 0) -> pd.DataFrame:
    """가중치 불확실성을 디리클레 분포로 표본 추출해 순위 분포를 구한다.

    (α, β, γ) ~ Dir(κ·(α₀, β₀, γ₀)),  w̃ ~ Dir(κ·w̃₀)  — κ 가 클수록 기준안 근처에 모인다.
    출력: 관광지별 상위 N 진입 확률, 순위 5·50·95 백분위
    """
    rng = np.random.default_rng(seed)
    w0 = pd.Series(profile_weights(age, companion, time_slot))
    active = w0[w0 > 0]
    abg0 = np.array([C.DEFAULT_ALPHA, C.DEFAULT_BETA, C.DEFAULT_GAMMA])
    ranks, hits = [], {}
    for _ in range(n_runs):
        a, b, g = rng.dirichlet(kappa * abg0)
        w = w0.copy() * 0
        w[active.index] = rng.dirichlet(kappa * active.to_numpy())
        s = score(fx, age, companion, month, time_slot, a, b, g, weights=w.to_dict())
        s = s[s["eligible"]]
        ranks.append(pd.Series(np.arange(1, len(s) + 1), index=s["content_id"]))
        for cid in recommend(s, top_n)["content_id"]:
            hits[cid] = hits.get(cid, 0) + 1
    R = pd.concat(ranks, axis=1)
    out = pd.DataFrame({"p_top": pd.Series(hits).reindex(R.index).fillna(0) / n_runs,
                        "rank_p05": R.quantile(0.05, axis=1), "rank_p50": R.median(axis=1),
                        "rank_p95": R.quantile(0.95, axis=1)})
    return out.sort_values(["p_top", "rank_p50"], ascending=[False, True])
