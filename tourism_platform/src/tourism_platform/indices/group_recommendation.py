"""동행자 교집합 추천 (문서 4.4).

Score_i^group = min_{g in G_companion} LQ_ig * log(V_i)

평균이 아닌 최솟값을 쓰는 이유: 평균은 한 사람의 강한 선호가 다른 동행자의
불만을 가리지만, 최솟값은 가장 덜 만족하는 동행자를 기준으로 삼아 누구도
소외시키지 않는다 (검증 결과는 문서 10.2, validation/validate_group_intersection.py 참고).
"""
from __future__ import annotations

import math
from collections.abc import Iterable


def group_score(lq_values: Iterable[float], v_i: float) -> float:
    """동행 집단들의 LQ 중 최솟값에 로그 규모를 곱한 그룹 추천 점수."""
    lq_list = list(lq_values)
    if not lq_list:
        raise ValueError("lq_values must not be empty")
    if v_i <= 0:
        raise ValueError("v_i must be positive")
    return min(lq_list) * math.log(v_i)
