"""지자체 리포트 4분면 분류 안정성 검증 (문서 10.6).

안전도 x 체험지수 두 축을 중앙값으로 나눠 4개 유형(대표/잠재 발굴/안전 개선
우선/종합 진단)으로 분류할 때, 관측 잡음만으로 분류가 얼마나 흔들리는지
측정한다. 경계 대역(중앙값에서 표준편차 0.25 이내) 규칙이 불안정한 지역을
얼마나 잡아내는지도 함께 확인한다.
"""
from __future__ import annotations

import numpy as np

from .simulate_regions import simulate_safety_regions


def run(rng: np.random.Generator, n_repeats: int = 500, unstable_threshold: float = 0.20, boundary_z: float = 0.25) -> dict:
    p_res, v_pd, h_bar, true_rate, _, p_eff, stay_days = simulate_safety_regions(rng)
    n_regions = len(p_res)

    expected_count = true_rate * p_eff / 100_000
    true_safety = -true_rate  # 값이 클수록 안전
    true_experience = rng.normal(0, 1, size=n_regions)  # 참 체험지수 (고정)

    true_quadrant = (
        (true_safety >= np.median(true_safety)).astype(int) * 2
        + (true_experience >= np.median(true_experience)).astype(int)
    )

    mismatch_count = np.zeros(n_regions)
    for _ in range(n_repeats):
        obs_count = rng.poisson(np.clip(expected_count, 1e-6, None))
        obs_safety = -(obs_count / (p_eff / 100_000))
        obs_experience = true_experience + rng.normal(0, 0.3, size=n_regions)
        obs_quadrant = (
            (obs_safety >= np.median(obs_safety)).astype(int) * 2
            + (obs_experience >= np.median(obs_experience)).astype(int)
        )
        mismatch_count += obs_quadrant != true_quadrant

    mismatch_rate = mismatch_count / n_repeats
    unstable = mismatch_rate >= unstable_threshold

    safety_z = np.abs(true_safety - np.median(true_safety)) / np.std(true_safety)
    experience_z = np.abs(true_experience - np.median(true_experience)) / np.std(true_experience)
    boundary = (safety_z < boundary_z) | (experience_z < boundary_z)

    return {
        "avg_mismatch_rate_pct": float(mismatch_rate.mean() * 100),
        "unstable_region_fraction_pct": float(unstable.mean() * 100),
        "boundary_region_fraction_pct": float(boundary.mean() * 100),
        "boundary_captures_unstable_pct": float(np.mean(boundary[unstable]) * 100) if unstable.any() else 0.0,
    }


if __name__ == "__main__":
    print(run(np.random.default_rng(42)))
