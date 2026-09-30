"""추천 방식 검증 (문서 10.1): 인기도 단독 vs 특화지수 단독 vs 결합 방식.

주의(문서 10.1 한계): 참 목록을 '특화 정도 x 로그 규모'로 정의했으므로 이
검증은 결합 방식에 유리하다. 실제 적합성은 사용자 반응으로 재검증해야 한다.
"""
from __future__ import annotations

import numpy as np

from .. import indices
from .simulate_regions import N_GROUPS, simulate_visitor_groups


def _top10_by_score(score: np.ndarray) -> np.ndarray:
    return np.argsort(-score)[:10]


def run(rng: np.random.Generator, k: float = 50.0) -> dict:
    v_i, true_pref, v_ig_observed, s_g = simulate_visitor_groups(rng)
    n_regions = len(v_i)

    true_score = true_pref * np.log(v_i)[:, None]  # 참 목록 정의
    true_top10 = {g: set(_top10_by_score(true_score[:, g])) for g in range(N_GROUPS)}

    popularity_top10 = set(_top10_by_score(v_i))

    lq = np.zeros((n_regions, N_GROUPS))
    combined_score = np.zeros((n_regions, N_GROUPS))
    for g in range(N_GROUPS):
        for i in range(n_regions):
            lq[i, g] = indices.location_quotient(v_ig_observed[i, g], v_i[i], s_g[g], k=k)
        combined_score[:, g] = lq[:, g] * np.log(v_i)

    def precision_at_10(score_matrix: np.ndarray | None, use_popularity: bool = False) -> float:
        hits = []
        for g in range(N_GROUPS):
            top10 = popularity_top10 if use_popularity else set(_top10_by_score(score_matrix[:, g]))
            hits.append(len(top10 & true_top10[g]) / 10)
        return float(np.mean(hits))

    precision_popularity = precision_at_10(None, use_popularity=True)
    precision_lq_only = precision_at_10(lq)
    precision_combined = precision_at_10(combined_score)

    # 집단 간 추천 목록 중복도(개인화 정도)
    def avg_overlap(score_matrix: np.ndarray | None, use_popularity: bool = False) -> float:
        tops = [popularity_top10 if use_popularity else set(_top10_by_score(score_matrix[:, g])) for g in range(N_GROUPS)]
        pairs = [(len(tops[a] & tops[b]) / 10) for a in range(N_GROUPS) for b in range(a + 1, N_GROUPS)]
        return float(np.mean(pairs))

    return {
        "precision_at_10": {
            "popularity_only": precision_popularity,
            "lq_only": precision_lq_only,
            "combined": precision_combined,
        },
        "avg_pairwise_overlap": {
            "popularity_only": avg_overlap(None, use_popularity=True),
            "combined": avg_overlap(combined_score),
        },
    }


if __name__ == "__main__":
    result = run(np.random.default_rng(42))
    print(result)
