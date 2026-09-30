"""안전도 지표 검증 (문서 10.3~10.5): 분모 선택, 3개년 평균, 경험적 베이즈 축소.

전부 참값을 아는 가상 지역에서 각 방법의 복원 정확도(RMSE, 순위 상관)를
재는 몬테카를로 시뮬레이션이며, 실제 지역의 결과가 아니다.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import spearmanr

from .. import indices
from .simulate_regions import simulate_safety_regions


def _rmse(estimate: np.ndarray, truth: np.ndarray) -> float:
    return float(np.sqrt(np.mean((estimate - truth) ** 2)))


def _denominator_once(rng: np.random.Generator) -> dict:
    p_res, v_pd, h_bar, true_rate, observed_counts, p_eff, stay_days = simulate_safety_regions(rng)
    year0_count = observed_counts[:, 0]

    rate_resident_only = year0_count / (p_res / 100_000)

    p_eff_old = np.array(
        [indices.effective_population_double_counted(pr, vp, sd) for pr, vp, sd in zip(p_res, v_pd, stay_days)]
    )
    rate_old = year0_count / (p_eff_old / 100_000)

    rate_corrected = year0_count / (p_eff / 100_000)

    results = {}
    for name, rate in (
        ("resident_only", rate_resident_only),
        ("old_double_counted", rate_old),
        ("corrected_effective_population", rate_corrected),
    ):
        rho, _ = spearmanr(rate, true_rate)
        results[name] = {"rmse": _rmse(rate, true_rate), "rank_correlation": float(rho)}
    return results


def validate_denominator(rng: np.random.Generator, n_worlds: int = 100) -> dict:
    """10.4: 거주 인구만 / 이전(이중계산) 방법 / 수정 방법의 RMSE·순위상관 비교.

    가상 지역 250개를 한 번만 뽑으면 우연히 한쪽에 유리한 표본이 나올 수 있으므로,
    독립된 가상 세계를 n_worlds번 다시 뽑아 평균한다.
    """
    runs = [_denominator_once(rng) for _ in range(n_worlds)]
    methods = runs[0].keys()
    return {
        method: {
            "rmse": float(np.mean([r[method]["rmse"] for r in runs])),
            "rank_correlation": float(np.mean([r[method]["rank_correlation"] for r in runs])),
        }
        for method in methods
    }


def _averaging_and_shrinkage_once(rng: np.random.Generator, small_region_pop: float) -> dict:
    p_res, v_pd, h_bar, true_rate, observed_counts, p_eff, stay_days = simulate_safety_regions(rng)
    small_mask = p_res < small_region_pop

    single_year_rate = observed_counts[:, 0] / (p_eff / 100_000)
    three_year_rate = observed_counts.mean(axis=1) / (p_eff / 100_000)

    n_years = observed_counts.shape[1]
    r_bar = float(np.average(three_year_rate, weights=p_eff))
    # 방법적률추정: R_i의 전체 분산 ≈ 지역간 참분산(sigma2) + 표집분산(r_bar/n_i).
    # three_year_rate는 3개년 평균이므로 표집분산은 단년 분산의 1/n_years이다 —
    # 이걸 안 나누면 sigma2가 과소추정되어 과도한 축소(w가 지나치게 작아짐)로
    # 이어지고, 오히려 3개년 평균보다 RMSE가 나빠지는 결과를 낳는다.
    sampling_var = (r_bar / (p_eff / 100_000)) / n_years
    sigma2 = max(float(np.var(three_year_rate)) - float(np.mean(sampling_var)), 1e-6)

    # empirical_bayes_shrinkage의 w_i = sigma2/(sigma2 + r_bar/p_eff_i) 식은 rate와
    # 같은 단위의 '유효 표본 크기'를 기대한다. rate가 3개년 평균·10만 명당이므로
    # p_eff_i 자리에는 (유효인구/10만) * 3개년을 넣어 표집분산 축소를 반영한다.
    eb_rate = np.array(
        [
            indices.empirical_bayes_shrinkage(r, r_bar, sigma2, pe / 100_000 * n_years)[0]
            for r, pe in zip(three_year_rate, p_eff)
        ]
    )

    def rmse_pair(rate: np.ndarray) -> tuple[float, float]:
        return _rmse(rate, true_rate), _rmse(rate[small_mask], true_rate[small_mask])

    overall_single, small_single = rmse_pair(single_year_rate)
    overall_3yr, small_3yr = rmse_pair(three_year_rate)
    overall_eb, small_eb = rmse_pair(eb_rate)

    return {
        "single_year": {"rmse_overall": overall_single, "rmse_small_regions": small_single},
        "three_year_avg": {"rmse_overall": overall_3yr, "rmse_small_regions": small_3yr},
        "three_year_avg_plus_eb": {"rmse_overall": overall_eb, "rmse_small_regions": small_eb},
        "n_small_regions": int(small_mask.sum()),
    }


def validate_averaging_and_shrinkage(
    rng: np.random.Generator, small_region_pop: float = 30_000, n_worlds: int = 100
) -> dict:
    """10.5: 단년 / 3개년 평균 / +경험적 베이즈 축소의 RMSE 비교 (전체 vs 소규모 지역).

    sigma2를 표본 하나짜리 방법적률추정으로 구하므로 세계 하나로는 추정이 튈 수
    있다 — n_worlds번 반복해 평균 RMSE로 비교한다.
    """
    runs = [_averaging_and_shrinkage_once(rng, small_region_pop) for _ in range(n_worlds)]
    methods = ("single_year", "three_year_avg", "three_year_avg_plus_eb")
    result = {
        method: {
            "rmse_overall": float(np.mean([r[method]["rmse_overall"] for r in runs])),
            "rmse_small_regions": float(np.mean([r[method]["rmse_small_regions"] for r in runs])),
        }
        for method in methods
    }
    result["n_small_regions_avg"] = float(np.mean([r["n_small_regions"] for r in runs]))
    return result


if __name__ == "__main__":
    rng = np.random.default_rng(42)
    print("10.4 분모 비교:", validate_denominator(rng))
    print("10.5 평균/베이즈:", validate_averaging_and_shrinkage(rng))
