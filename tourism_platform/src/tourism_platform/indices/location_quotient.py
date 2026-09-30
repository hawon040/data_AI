"""성·연령 방문 특화지수 (문서 4.2).

LQ_ig = (V_ig/V_i 를 평활화한 값) / s_g
Score_ig = LQ_ig * log(V_i)
"""
from __future__ import annotations

import math


def location_quotient(v_ig: float, v_i: float, s_g: float, k: float = 50.0) -> float:
    """지역 i에서 집단 g의 방문 특화지수(Location Quotient)를 계산한다.

    v_ig: 지역 i의 집단 g 방문자 수
    v_i: 지역 i의 전체 방문자 수
    s_g: 전국 방문자 중 집단 g의 비중
    k: 평활 계수. 표본이 적은 지역에서 비중이 0/극단값으로 튀는 것을 막는다.
       검증 결과(문서 10.1) k=0과 k=50의 정확도 차이는 미미하고(0.842 vs 0.833),
       k=1000처럼 과도하면 개인화가 흐려지므로(0.717) 기본값은 50으로 둔다.
    """
    if v_i + k <= 0:
        raise ValueError("v_i + k must be positive")
    if s_g <= 0:
        raise ValueError("s_g must be positive")
    smoothed_share = (v_ig + k * s_g) / (v_i + k)
    return smoothed_share / s_g


def specialization_score(lq_ig: float, v_i: float) -> float:
    """Score_ig = LQ_ig * log(V_i). 로그는 대형 관광지 쏠림을 완화한다."""
    if v_i <= 0:
        raise ValueError("v_i must be positive")
    return lq_ig * math.log(v_i)
