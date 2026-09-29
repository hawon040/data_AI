"""여행자 관점 유효인구 (문서 4.5, 9.3, 10.4).

데이터랩 방문자 수는 이미 일자별 순방문자(방문자·일) 단위로 집계되어 있다.
따라서 체류일수를 다시 곱하면 이중 계산이 된다 — 이전 방법론의 오류였고,
이 오류가 보정을 전혀 하지 않는 것보다 더 나쁜 결과를 낸다는 것을 검증했다
(문서 10.4: RMSE 8.9 > 5.9(거주인구만) > 4.6(수정식)).
"""
from __future__ import annotations


def effective_population(p_res: float, v_pd: float, h_bar: float) -> float:
    """수정된 유효인구. P_i^eff = P_i^res + (V_i^pd * h_bar/24) / 365

    p_res: 연평균 주민등록인구
    v_pd: 연간 외지인 방문자 수 (방문자·일 단위)
    h_bar: 1일 평균 체류시간(시간)
    """
    if not (0 <= h_bar <= 24):
        raise ValueError("h_bar must be within [0, 24]")
    return p_res + (v_pd * h_bar / 24) / 365


def effective_population_double_counted(p_res: float, v_pd: float, stay_days: float) -> float:
    """이전 방법론(오류 버전). 체류일수를 추가로 곱해 이중 계산한다.

    검증/회귀 비교 목적으로만 남겨둔다 — 실제 서비스에는 쓰지 않는다.
    """
    return p_res + (v_pd * stay_days) / 365
