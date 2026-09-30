"""경험적 베이즈 축소 (Clayton & Kaldor, 1987) — 문서 4.5, 10.5.

R_hat_i = w_i * R_i + (1 - w_i) * R_bar
w_i = sigma^2 / (sigma^2 + R_bar / P_i^eff)

인구(표본)가 적은 지역일수록 w_i가 작아져 전국 평균 쪽으로 더 많이 당겨진다.
3개년 평균과 함께 적용하면 소규모 지역 RMSE가 추가로 줄어든다(문서 10.5:
전체 4.6 -> 4.1, 소규모 지역 8.0 -> 6.8).
"""
from __future__ import annotations


def empirical_bayes_shrinkage(
    r_i: float, r_bar: float, sigma2: float, p_eff_i: float
) -> tuple[float, float]:
    """관측 위험률 r_i를 전국 평균 r_bar 쪽으로 축소한 추정치와 가중치 w_i를 반환한다.

    r_i: 지역 i의 관측 위험률 (예: 유효인구 10만 명당 발생 건수)
    r_bar: 전국 평균 위험률
    sigma2: 지역 간 참 위험률의 분산 추정치
    p_eff_i: 지역 i의 유효인구. r_i가 '10만 명당' 비율이면 p_eff_i도 10만 명 단위로
        맞춰 넘겨야 한다(effective_population()의 원값이 아니라 그 값을 100_000으로
        나눈 값) — 단위가 어긋나면 w_i가 항상 1에 가까워져 축소가 사실상 사라진다.
    """
    if p_eff_i <= 0:
        raise ValueError("p_eff_i must be positive")
    w_i = sigma2 / (sigma2 + r_bar / p_eff_i)
    r_hat = w_i * r_i + (1 - w_i) * r_bar
    return r_hat, w_i
