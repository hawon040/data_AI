"""안전도 순위 불확실성 검증 (문서 10.7).

여러 하위 지표(범죄 위해지수, 보행자 사고율, 화재 발생률, 응급의료 접근성)를
합성할 때 가중치를 무작위로 바꾸면 순위가 얼마나 흔들리는지 측정한다.
영역 간 상관을 0으로 둔 조건이라 실제보다 불확실성을 크게 잡는다 — 실제
지표는 서로 상관되어 있어 폭이 줄어들 것이다.
"""
from __future__ import annotations

import numpy as np

N_SUBINDICATORS = 4  # 범죄 위해지수, 보행자 사고율, 화재 발생률, 응급의료 접근성


def run(rng: np.random.Generator, n_regions: int = 250, n_trials: int = 2000) -> dict:
    # 영역 간 상관 0: 하위 지표를 서로 독립인 표준정규분포로 생성한다.
    sub_indicators = rng.normal(0, 1, size=(n_regions, N_SUBINDICATORS))

    ranks = np.zeros((n_trials, n_regions), dtype=int)
    for t in range(n_trials):
        weights = rng.dirichlet(np.ones(N_SUBINDICATORS))
        composite = sub_indicators @ weights  # 클수록 안전
        order = np.argsort(-composite)  # 1위가 가장 안전
        rank = np.empty(n_regions, dtype=int)
        rank[order] = np.arange(1, n_regions + 1)
        ranks[t] = rank

    p5 = np.percentile(ranks, 5, axis=0)
    p95 = np.percentile(ranks, 95, axis=0)
    width = p95 - p5

    return {
        "median_90pct_interval_width": float(np.median(width)),
        "fraction_width_over_50_pct": float(np.mean(width > 50) * 100),
    }


if __name__ == "__main__":
    print(run(np.random.default_rng(42)))
