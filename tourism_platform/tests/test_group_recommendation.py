import math

import pytest

from tourism_platform.indices import group_score


def test_group_score_uses_minimum_not_average():
    # 한 집단만 매우 좋아하는 곳은 최솟값 방식에서 낮은 점수를 받아야 한다.
    v_i = 100
    lq_values = [5.0, 0.3]
    score = group_score(lq_values, v_i)
    assert score == pytest.approx(0.3 * math.log(v_i))


def test_all_satisfied_gives_high_score():
    v_i = 100
    lq_values = [1.5, 1.8, 1.2]
    score = group_score(lq_values, v_i)
    assert score == pytest.approx(1.2 * math.log(v_i))


def test_empty_values_raise():
    with pytest.raises(ValueError):
        group_score([], v_i=100)
