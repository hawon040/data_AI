"""추천 산식이 설계 문서(docs/recommendation_method.md 7절)에서 약속한 성질을 지키는지 검사."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tourrec import config as C  # noqa: E402
from tourrec import indicators as I  # noqa: E402
from tourrec import sample_data  # noqa: E402
from tourrec.normalize import lq_to_unit, robust_minmax  # noqa: E402
from tourrec.scoring import (build_features, effective_weights, profile_weights,  # noqa: E402
                             recommend, score)

PROFILE = ("20대", "친구·연인", 8, "주간")


@pytest.fixture(scope="module")
def tables():
    return sample_data.generate(seed=7)


@pytest.fixture(scope="module")
def fx(tables):
    return build_features(tables)


@pytest.mark.parametrize("age", C.AGE_GROUPS)
@pytest.mark.parametrize("comp", C.COMPANIONS)
@pytest.mark.parametrize("slot", C.TIME_SLOTS)
def test_weights_sum_to_one_and_nonnegative(age, comp, slot):
    w = profile_weights(age, comp, slot)
    assert sum(w.values()) == pytest.approx(1.0)
    assert min(w.values()) >= 0


def test_neutral_profile_gives_equal_factor_weights():
    w = profile_weights("20대", "친구·연인", "주간")
    by_factor = {}
    for k, v in w.items():
        by_factor[C.SUBINDICATORS[k][0]] = by_factor.get(C.SUBINDICATORS[k][0], 0) + v
    assert all(v == pytest.approx(1 / 3) for v in by_factor.values())
    assert w["traffic_child"] == 0 and w["traffic_elder"] == 0


def test_vulnerable_subindicators_activate_only_for_their_profile():
    assert profile_weights("30대", "가족(아동 동반)")["traffic_child"] > 0
    assert profile_weights("70대 이상", "혼자")["traffic_elder"] > 0
    assert profile_weights("30대", "혼자")["traffic_elder"] == 0


def test_score_bounds(fx):
    s = score(fx, *PROFILE)
    for col in ["S", "F", "P", "score"]:
        assert s[col].between(0, 1).all(), col
    assert (s["c_S"] + s["c_F"] + s["c_P"]).sub(s["score"]).abs().max() < 1e-12
    risk_cols = [c for c in s if c.startswith("risk_")]
    assert (1 - s[risk_cols].sum(axis=1)).sub(s["S"]).abs().max() < 1e-12


def test_monotonic_in_crime(tables):
    """한 시군구의 범죄 건수만 늘리면 그 시군구 관광지의 안전도는 올라가지 않는다."""
    base = score(build_features(tables), *PROFILE).set_index("content_id")
    t2 = {k: v.copy() for k, v in tables.items()}
    target = t2["attraction"]["sgg_code"].iloc[0]
    m = t2["crime_sgg"]["sgg_code"] == target
    t2["crime_sgg"].loc[m, "count"] *= 3
    new = score(build_features(t2), *PROFILE).set_index("content_id")
    ids = base.index[base["sgg_code"] == target]
    assert (new.loc[ids, "S"] <= base.loc[ids, "S"] + 1e-12).all()
    assert (new.loc[ids, "S"] < base.loc[ids, "S"]).any()


def test_region_filter_does_not_change_scores(fx):
    s = score(fx, *PROFILE)
    sido = s["sido"].dropna().iloc[0]
    sub = recommend(s, 5, sido=[sido])
    full = s.set_index("content_id")
    assert np.allclose(sub.set_index("content_id")["score"], full.loc[sub["content_id"], "score"])
    assert (sub["sido"] == sido).all()


def test_missing_weather_is_neutral(fx):
    """날씨 결측 관광지의 날씨 기여 = 같은 월 전국 중앙값의 기여 (유리하지도 불리하지도 않음)."""
    s = score(fx, *PROFILE)
    miss = s[s["stn_id"].isna()]
    if miss.empty:
        pytest.skip("샘플에 날씨 결측 관광지가 없음")
    have = s[s["stn_id"].notna()]
    w = s.attrs["weights"]
    for k in ["heat", "rain", "cold", "snow"]:
        med = (have[f"risk_{k}"] / w[k]).median() if w[k] else 0
        assert miss[f"risk_{k}"].iloc[0] == pytest.approx(w[k] * med, abs=1e-9)


def test_recommend_respects_gate_and_diversity(fx):
    s = score(fx, *PROFILE)
    r = recommend(s, 10)
    assert not r["safety_flag"].any()
    assert r["sgg_code"].value_counts().max() <= C.MAX_PER_SGG
    assert list(r["rank"]) == list(range(1, len(r) + 1))


def test_ranking_is_deterministic(fx):
    a = recommend(score(fx, *PROFILE), 10)["content_id"].tolist()
    b = recommend(score(fx, *PROFILE), 10)["content_id"].tolist()
    assert a == b


def test_effective_weights_sum_to_one(fx):
    e = effective_weights(score(fx, *PROFILE))
    assert e.sum() == pytest.approx(1.0)


def test_eb_shrinks_small_areas_more():
    counts = pd.Series([2, 200, 1000], index=list("abc"), dtype=float)
    expo = pd.Series([5_000, 500_000, 1_000_000], index=list("abc"), dtype=float)
    raw = counts / expo
    eb = I.eb_rate(counts, expo)
    m = counts.sum() / expo.sum()
    # 인구가 가장 작은 a 가 전국 평균 쪽으로 가장 많이 이동(상대 비율)
    moved = ((raw - eb).abs() / (raw - m).abs().replace(0, np.nan))
    assert moved["a"] >= moved["b"] >= moved["c"] - 1e-12


def test_lq_mapping_is_symmetric():
    v = lq_to_unit(pd.Series([1.0, 2.0, 0.5, 4.0, 0.25, 100.0]))
    assert v.iloc[0] == pytest.approx(0.5)
    assert v.iloc[1] - 0.5 == pytest.approx(0.5 - v.iloc[2])
    assert v.iloc[3] == pytest.approx(1.0) and v.iloc[4] == pytest.approx(0.0)
    assert v.iloc[5] == 1.0


def test_robust_minmax_handles_sparse_zeros():
    x = pd.Series([0.0] * 97 + [1.0, 5.0, 50.0])
    r = robust_minmax(x)
    assert r.between(0, 1).all() and r.iloc[0] == 0 and r.iloc[-1] == 1
    assert (robust_minmax(pd.Series([0.0] * 10)) == 0).all()


def test_hotspot_distance_decay():
    attr = pd.DataFrame({"lat": [37.0], "lon": [127.0]})
    hs = pd.DataFrame({"lat": [37.0, 37.0 + 0.25 / 111.0, 37.0 + 2 / 111.0], "lon": [127.0] * 3,
                       "acc_type": ["보행자"] * 3, "death_cnt": [0] * 3, "serious_cnt": [0] * 3,
                       "minor_cnt": [1] * 3, "reported_cnt": [0] * 3})
    v = I.hotspot_exposure(attr, hs, radius_km=0.5).iloc[0]
    # 0km → 가중 1, 0.25km → 가중 약 0.5, 2km → 반경 밖 0
    assert v == pytest.approx(1.5, abs=0.01)


def test_value_combine_matches_formula(fx):
    s = score(fx, *PROFILE, combine="value")
    a, b, g = C.DEFAULT_ALPHA, C.DEFAULT_BETA, C.DEFAULT_GAMMA
    assert (a * s["S"] + b * s["F"] + g * s["P"] - s["score"]).abs().max() < 1e-12


def test_rank_combine_equalizes_spread(fx):
    """백분위 결합에서는 세 항 모두 평균 0.5(동률 평균순위 백분위의 성질), 범위 0~1."""
    s = score(fx, *PROFILE)
    el = s[s["eligible"]]
    for x in ["S", "F", "P"]:
        assert el[f"q_{x}"].mean() == pytest.approx(0.5)
        assert el[f"q_{x}"].between(0, 1).all()
