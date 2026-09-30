import pytest

from tourism_platform.indices import empirical_bayes_shrinkage


def test_small_population_shrinks_more_toward_national_mean():
    r_i, r_bar, sigma2 = 50.0, 30.0, 10.0
    r_hat_small, w_small = empirical_bayes_shrinkage(r_i, r_bar, sigma2, p_eff_i=5_000)
    r_hat_large, w_large = empirical_bayes_shrinkage(r_i, r_bar, sigma2, p_eff_i=5_000_000)

    assert w_small < w_large  # 인구가 적을수록 가중치(w)가 작아 관측값을 덜 신뢰
    assert abs(r_hat_small - r_bar) < abs(r_hat_large - r_bar)


def test_shrinkage_result_between_observed_and_national_mean():
    r_hat, w = empirical_bayes_shrinkage(r_i=50.0, r_bar=30.0, sigma2=10.0, p_eff_i=100_000)
    assert 30.0 <= r_hat <= 50.0
    assert 0.0 <= w <= 1.0


def test_invalid_population_raises():
    with pytest.raises(ValueError):
        empirical_bayes_shrinkage(r_i=1.0, r_bar=1.0, sigma2=1.0, p_eff_i=0)
