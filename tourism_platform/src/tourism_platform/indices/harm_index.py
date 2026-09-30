"""범죄 심각도·관광 노출도 결합 위해지수 (문서 4.5).

H_i = sum_k s_k * lambda_k * C_ik

s_k: 유형 k의 심각도 (양형기준 권고형량 기반 상대값, Sherman et al. 2016 개념 적용)
lambda_k: 유형 k 범죄 중 여행자가 머무는 장소(노상/유원지/공원/숙박업소/교통수단
          등)에서 발생한 비중
C_ik: 지역 i, 유형 k의 3개년 평균 발생 건수
"""
from __future__ import annotations

from collections.abc import Sequence


def harm_index(severity: Sequence[float], exposure_share: Sequence[float], avg_count: Sequence[float]) -> float:
    """세 벡터(심각도, 노출 비중, 평균 발생건수)의 내적으로 위해지수를 계산한다."""
    if not (len(severity) == len(exposure_share) == len(avg_count)):
        raise ValueError("severity, exposure_share, avg_count must have the same length")
    return sum(s * lam * c for s, lam, c in zip(severity, exposure_share, avg_count))
