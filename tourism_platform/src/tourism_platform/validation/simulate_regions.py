"""가상 지역/집단 시뮬레이션 생성기 (문서 10.1, 10.3 설정 재현).

방법론의 오차 성능만 측정하는 몬테카를로 시뮬레이션이며, 실제 지역의 결과가
아니다. 모든 함수는 numpy Generator를 받아 재현 가능하게 만든다.
"""
from __future__ import annotations

import numpy as np

N_REGIONS = 250
N_GENDERS = 2
N_AGE_GROUPS = 6
N_GROUPS = N_GENDERS * N_AGE_GROUPS  # 12개 집단


def simulate_visitor_groups(rng: np.random.Generator, n_regions: int = N_REGIONS):
    """추천 방식 검증용(10.1) 가상 지역×집단 방문자 데이터를 만든다.

    반환:
        v_i: (n_regions,) 지역별 전체 방문자 수 (연 2천~200만, 로그균등)
        true_pref: (n_regions, N_GROUPS) 집단별 참 선호도(지역마다 무작위)
        v_ig_observed: (n_regions, N_GROUPS) 표본(2%)으로 관측된 집단별 방문자 수
        s_g: (N_GROUPS,) 전국 집단 비중
    """
    v_i = np.exp(rng.uniform(np.log(2_000), np.log(2_000_000), size=n_regions))
    true_pref = rng.uniform(0.2, 3.0, size=(n_regions, N_GROUPS))  # 참 특화 정도
    s_g = np.full(N_GROUPS, 1.0 / N_GROUPS)

    # 참 선호 비례로 지역 내 집단별 방문 비중을 만들고, 전체의 2%만
    # 성·연령이 파악되는 표본으로 관측된다고 가정한다.
    weights = true_pref / true_pref.sum(axis=1, keepdims=True)
    sample_total = v_i * 0.02
    expected_counts = weights * sample_total[:, None]
    v_ig_observed = rng.poisson(np.clip(expected_counts, 1e-6, None)).astype(float)
    return v_i, true_pref, v_ig_observed, s_g


def simulate_safety_regions(rng: np.random.Generator, n_regions: int = N_REGIONS):
    """안전도 검증용(10.3) 가상 시군구 데이터를 만든다.

    반환:
        p_res: 거주 인구 (1만~100만, 로그균등)
        v_pd: 연간 외지인 방문자 수, 방문자·일 단위 (거주인구의 1~400배)
        h_bar: 1일 평균 체류시간 (3~9시간)
        true_rate_per_100k: 유효인구 10만 명당 참 위험률 (감마분포, 평균 30)
        observed_counts: (n_regions, 3) 3개년 관측 발생 건수 (포아송)
        p_eff: 수정된 유효인구
        stay_days: 이전(오류) 방법론 비교용 평균 체류일수 (1~5일)
    """
    p_res = np.exp(rng.uniform(np.log(10_000), np.log(1_000_000), size=n_regions))
    v_pd = p_res * rng.uniform(1, 400, size=n_regions)
    h_bar = rng.uniform(3, 9, size=n_regions)
    stay_days = rng.uniform(1, 5, size=n_regions)

    mean_rate = 30.0
    shape = 4.0  # 감마분포 형상모수 — 평균을 유지하며 적당한 분산을 준다
    true_rate_per_100k = rng.gamma(shape, mean_rate / shape, size=n_regions)

    from .. import indices

    p_eff = np.array([indices.effective_population(pr, vp, h) for pr, vp, h in zip(p_res, v_pd, h_bar)])
    expected_counts = true_rate_per_100k * p_eff / 100_000
    observed_counts = rng.poisson(np.clip(expected_counts, 1e-6, None), size=(3, n_regions)).T.astype(float)
    return p_res, v_pd, h_bar, true_rate_per_100k, observed_counts, p_eff, stay_days
