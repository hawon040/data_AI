import pytest

from tourism_platform.indices import harm_index


def test_harm_index_is_weighted_sum():
    severity = [1.0, 2.0]
    exposure_share = [0.5, 0.1]
    avg_count = [10, 20]
    expected = 1.0 * 0.5 * 10 + 2.0 * 0.1 * 20
    assert harm_index(severity, exposure_share, avg_count) == pytest.approx(expected)


def test_mismatched_lengths_raise():
    with pytest.raises(ValueError):
        harm_index([1.0], [1.0, 2.0], [1.0])
