import pytest

from tourism_platform.indices import effective_population, effective_population_double_counted


def test_effective_population_adds_partial_day_contribution():
    p_res = 10_000
    v_pd = 365_000  # 연간 1일 평균 1,000명 방문(방문자·일)
    h_bar = 12  # 하루 절반을 체류
    result = effective_population(p_res, v_pd, h_bar)
    # 1,000명 * 0.5 = 500명이 매일 추가되는 셈
    assert result == pytest.approx(p_res + 500)


def test_corrected_is_smaller_than_double_counted_for_multi_day_stay():
    p_res = 10_000
    v_pd = 365_000
    h_bar = 12
    stay_days = 3  # 실제로는 하루 체류시간만 반영해야 하는데 옛 방식은 3일치를 곱함
    corrected = effective_population(p_res, v_pd, h_bar)
    old = effective_population_double_counted(p_res, v_pd, stay_days)
    assert old > corrected


def test_invalid_hours_raise():
    with pytest.raises(ValueError):
        effective_population(p_res=1000, v_pd=1000, h_bar=30)
