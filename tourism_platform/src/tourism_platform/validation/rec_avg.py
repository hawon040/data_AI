"""추천 방식 검증(문서 10.1)을 가상 세계 여러 개로 반복해 평균을 낸다.

실행 방법 (tourism_platform 폴더에서):

    python -m tourism_platform.validation.rec_avg                    # seed 42, 반복 100회
    python -m tourism_platform.validation.rec_avg --seed 42 --runs 100

run_all은 가상 지역을 한 번만 만들어 계산하므로, 한 번의 우연에 값이 흔들린다.
여기서는 SeedSequence(seed).spawn(runs)로 서로 독립된 가상 세계를 runs개 만들고
validate_recommendation.run을 각각 실행해 평균·표준편차를 낸다. 웹 검증 페이지의
추천 정밀도 카드는 이 결과(seed 42, 100회)를 기준으로 한다.

주의: 참값을 아는 가상 지역에서 잰 방법론의 차이이며, 실제 지역의 정확도가 아니다.
"""
from __future__ import annotations

import argparse

import numpy as np

from . import validate_recommendation
from .simulate_regions import simulate_visitor_groups

K_VALUES = (0.0, 50.0, 1000.0)
DEFAULT_K = 50.0


def _precisions(seed: int, runs: int, k: float) -> dict[str, np.ndarray]:
    results = [
        validate_recommendation.run(np.random.default_rng(s), k=k)
        for s in np.random.SeedSequence(seed).spawn(runs)
    ]
    return {
        key: np.array([r["precision_at_10"][key] for r in results])
        for key in ("combined", "popularity_only", "lq_only")
    }


def main(seed: int = 42, runs: int = 100) -> None:
    n_regions = len(simulate_visitor_groups(np.random.default_rng(seed))[0])
    print(f"=== 추천 precision@10, 가상 세계 {runs}개 평균 (seed {seed}) ===")
    print(f"무작위 기준: 10/{n_regions} = {10 / n_regions:.3f}")

    base = _precisions(seed, runs, DEFAULT_K)
    combined, popularity = base["combined"], base["popularity_only"]
    # 표준편차는 표본 표준편차(ddof=1)다.
    print(f"\n[k={DEFAULT_K:g}]")
    print(f"결합   평균 {combined.mean():.3f}, 표준편차 {combined.std(ddof=1):.3f}")
    print(f"인기순 평균 {popularity.mean():.3f}, 표준편차 {popularity.std(ddof=1):.3f}")
    print(f"결합/인기순 평균 비율 {combined.mean() / popularity.mean():.2f}배")
    wins = int((combined > popularity).sum())
    ties = int((combined == popularity).sum())
    print(f"결합이 이긴 횟수 {wins}/{runs} (동률 {ties}, 진 횟수 {runs - wins - ties})")

    print("\n[k별 평균]")
    for k in K_VALUES:
        p = base if k == DEFAULT_K else _precisions(seed, runs, k)
        print(
            f"k={k:g}: 결합 {p['combined'].mean():.3f}, 인기순 {p['popularity_only'].mean():.3f}, "
            f"특화지수만 {p['lq_only'].mean():.3f}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="추천 방식 검증을 가상 세계 여러 개로 반복해 평균을 낸다.")
    parser.add_argument("--seed", type=int, default=42, help="난수 시드 (기본 42)")
    parser.add_argument("--runs", type=int, default=100, help="가상 세계 수 (기본 100)")
    args = parser.parse_args()
    if args.runs < 2:
        parser.error("--runs는 2 이상이어야 표준편차를 낼 수 있습니다.")
    main(seed=args.seed, runs=args.runs)
