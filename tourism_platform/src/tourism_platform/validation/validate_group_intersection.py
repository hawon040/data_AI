"""동행자 교집합 추천 검증 (문서 10.2): 인기도 / 대표자 1인 / 평균 / 최솟값 비교.

지표 두 가지:
  1) 추천 상위 10곳에서 '가장 덜 만족하는 동행자'의 참 특화지수 평균
     (1보다 크면 그 동행자도 평균 이상으로 찾는 곳이라는 뜻)
  2) 상위 10곳 중 동행자 전원의 참 특화지수가 1을 넘는 지역의 비율
"""
from __future__ import annotations

import numpy as np

from .simulate_regions import N_GROUPS, simulate_visitor_groups
from .. import indices


def _top10(score: np.ndarray) -> np.ndarray:
    return np.argsort(-score)[:10]


def run(rng: np.random.Generator, n_trials: int = 2000, k: float = 50.0) -> dict:
    v_i, true_pref, v_ig_observed, s_g = simulate_visitor_groups(rng)
    n_regions = len(v_i)

    lq = np.zeros((n_regions, N_GROUPS))
    for g in range(N_GROUPS):
        for i in range(n_regions):
            lq[i, g] = indices.location_quotient(v_ig_observed[i, g], v_i[i], s_g[g], k=k)
    combined_score = lq * np.log(v_i)[:, None]

    metrics = {m: {"least_satisfied_true_lq": [], "all_above_1_ratio": []} for m in ("popularity", "representative", "mean", "min")}

    for _ in range(n_trials):
        group_size = rng.integers(2, 4)  # 2 또는 3개 집단
        companions = rng.choice(N_GROUPS, size=group_size, replace=False)

        top10_by_method = {
            "popularity": _top10(v_i),
            "representative": _top10(combined_score[:, rng.choice(companions)]),
            "mean": _top10(combined_score[:, companions].mean(axis=1)),
            "min": _top10(combined_score[:, companions].min(axis=1)),
        }

        for method, top10 in top10_by_method.items():
            companion_true_lq = true_pref[np.ix_(top10, companions)]  # (10, group_size)
            least_satisfied = companion_true_lq.min(axis=1)  # 지역별 최소 만족 동행자
            metrics[method]["least_satisfied_true_lq"].append(least_satisfied.mean())
            metrics[method]["all_above_1_ratio"].append(float(np.mean((companion_true_lq > 1).all(axis=1))))

    return {
        method: {
            "least_satisfied_true_lq_mean": float(np.mean(vals["least_satisfied_true_lq"])),
            "all_above_1_ratio_pct": float(np.mean(vals["all_above_1_ratio"]) * 100),
        }
        for method, vals in metrics.items()
    }


if __name__ == "__main__":
    result = run(np.random.default_rng(42))
    for method, vals in result.items():
        print(method, vals)
