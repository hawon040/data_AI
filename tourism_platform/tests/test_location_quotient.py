import math

import pytest

from tourism_platform.indices import location_quotient, specialization_score


def test_lq_equals_one_when_share_matches_national():
    # 지역 비중이 전국 비중과 같으면 LQ는 1이어야 한다.
    s_g = 0.2
    v_i = 1000
    v_ig = v_i * s_g
    assert location_quotient(v_ig, v_i, s_g, k=0) == pytest.approx(1.0)


def test_lq_above_one_when_overrepresented():
    lq = location_quotient(v_ig=500, v_i=1000, s_g=0.2, k=0)
    assert lq > 1.0


def test_smoothing_pulls_toward_national_share():
    # k가 클수록 LQ는 1(전국 평균)에 가까워져야 한다.
    lq_no_smooth = location_quotient(v_ig=5, v_i=10, s_g=0.2, k=0)
    lq_smoothed = location_quotient(v_ig=5, v_i=10, s_g=0.2, k=1000)
    assert abs(lq_smoothed - 1.0) < abs(lq_no_smooth - 1.0)


def test_specialization_score_matches_formula():
    assert specialization_score(lq_ig=2.0, v_i=100) == pytest.approx(2.0 * math.log(100))


def test_invalid_inputs_raise():
    with pytest.raises(ValueError):
        location_quotient(v_ig=1, v_i=10, s_g=0)
    with pytest.raises(ValueError):
        specialization_score(lq_ig=1.0, v_i=0)
