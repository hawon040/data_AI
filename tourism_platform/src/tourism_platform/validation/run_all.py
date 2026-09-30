"""문서 10장의 모든 오차 검증을 한 번에 실행한다.

    python -m tourism_platform.validation.run_all

주의: 모든 결과는 참값을 아는 가상 지역/집단에서 측정한 방법론의 오차
성능이며, 실제 지역의 결과가 아니다(문서 10장 서두).
"""
from __future__ import annotations

import numpy as np

from . import (
    validate_group_intersection,
    validate_quadrant_stability,
    validate_rank_uncertainty,
    validate_recommendation,
    validate_safety_index,
)


def main(seed: int = 42) -> None:
    # 검증마다 독립된 난수 스트림을 준다 — 하나를 공유하면 실행 순서가 바뀌거나
    # 검증 하나를 늘렸을 때 다른 검증 결과까지 달라져 재현성이 깨진다.
    seeds = np.random.SeedSequence(seed).spawn(6)
    rngs = [np.random.default_rng(s) for s in seeds]

    print("=== 10.1 추천 방식 검증 ===")
    print(validate_recommendation.run(rngs[0]))

    print("\n=== 10.2 동행자 교집합 추천 검증 ===")
    for method, vals in validate_group_intersection.run(rngs[1]).items():
        print(f"  {method}: {vals}")

    print("\n=== 10.4 안전도 유효인구 분모 검증 ===")
    print(validate_safety_index.validate_denominator(rngs[2]))

    print("\n=== 10.5 3개년 평균 및 경험적 베이즈 검증 ===")
    print(validate_safety_index.validate_averaging_and_shrinkage(rngs[3]))

    print("\n=== 10.6 4분면 분류 안정성 검증 ===")
    print(validate_quadrant_stability.run(rngs[4]))

    print("\n=== 10.7 안전도 순위 불확실성 검증 ===")
    print(validate_rank_uncertainty.run(rngs[5]))


if __name__ == "__main__":
    main()
