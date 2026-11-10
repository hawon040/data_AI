import datetime as dt

import pytest

from tourism_platform.indices.location_quotient import location_quotient
from tourism_platform.usage import affinity, aggregate, events, region

NOW = dt.datetime(2026, 11, 10, tzinfo=dt.timezone.utc)


def raw(**over):
    base = {"anon_id": "a1", "kind": "rating", "region_code": "44130", "attraction": "독립기념관",
            "gender": "F", "age_group": "60plus", "occurred_at": "2026-11-09T09:00:00+09:00", "score": 5}
    base.update(over)
    return base


def ev(**over):
    return events.parse_event(raw(**over))


# --- 형식 검증 ---------------------------------------------------------------

def test_valid_event_is_parsed_and_time_is_utc():
    e = ev()
    assert e.group_key == "F_60plus"
    assert e.occurred_at == dt.datetime(2026, 11, 9, 0, 0, tzinfo=dt.timezone.utc)


@pytest.mark.parametrize("field", ["name", "email", "phone", "birth_year", "lat", "lng"])
def test_personal_fields_are_rejected(field):
    with pytest.raises(ValueError, match="허용하지 않는 필드"):
        events.parse_event(raw(**{field: "x"}))


@pytest.mark.parametrize("over,msg", [
    ({"gender": "X"}, "gender"),
    ({"age_group": "70s"}, "age_group"),
    ({"kind": "like"}, "kind"),
    ({"score": 0}, "평가 점수"),
    ({"score": 6}, "평가 점수"),
    ({"score": 4.5}, "평가 점수"),
    ({"score": True}, "평가 점수"),
    ({"occurred_at": "2026-11-09T09:00:00"}, "시간대"),
    ({"anon_id": ""}, "anon_id"),
])
def test_invalid_values_are_rejected(over, msg):
    with pytest.raises(ValueError, match=msg):
        events.parse_event(raw(**over))


def test_directions_event_must_not_have_score():
    assert ev(kind="directions", score=None).score is None
    with pytest.raises(ValueError, match="score"):
        events.parse_event(raw(kind="directions", score=3))


def test_same_person_same_day_same_action_is_counted_once():
    a = ev(occurred_at="2026-11-09T01:00:00+00:00")
    b = ev(occurred_at="2026-11-09T05:00:00+00:00", score=1)  # 같은 사람이 같은 날 다시 평가
    c = ev(anon_id="a2", occurred_at="2026-11-09T05:00:00+00:00")
    d = ev(occurred_at="2026-11-10T05:00:00+00:00")  # 다른 날은 따로 센다
    kept = events.dedupe([b, a, c, d])
    assert [(e.anon_id, e.score) for e in kept] == [("a1", 5), ("a2", 5), ("a1", 5)]


# --- 지역 특화지수 -------------------------------------------------------------

def test_no_records_gives_neutral_lq_and_zero_reliability():
    shares = aggregate.national_shares({})
    assert set(shares) == set(events.GROUP_KEYS)
    assert sum(shares.values()) == pytest.approx(1.0)
    result = region.region_lq({}, shares, "44130", "F_60plus")
    assert result.lq == pytest.approx(1.0) and result.records == 0 and result.reliability == 0


def test_lq_moves_toward_observed_share_as_records_grow():
    def lq_with(n):
        evs = [ev(anon_id=f"u{i}", kind="rating", gender="F", age_group="60plus") for i in range(n)]
        # 다른 지역에는 12집단이 고르게 있다고 두어 전국 비중이 한쪽으로 쏠리지 않게 한다
        others = [ev(anon_id=f"o{i}-{g}", region_code="99999", gender=g[0], age_group=g[2:])
                  for i, g in enumerate(events.GROUP_KEYS * 20)]
        counts = aggregate.region_group_counts(evs + others)
        return region.region_lq(counts, aggregate.national_shares(counts), "44130", "F_60plus")
    few, many = lq_with(2), lq_with(500)
    assert 1.0 < few.lq < many.lq          # 기록이 많을수록 이 지역의 쏠림이 더 크게 드러난다
    assert few.reliability < many.reliability < 1.0


def test_directions_count_less_than_ratings():
    counts = aggregate.region_group_counts([ev(), ev(anon_id="a2", kind="directions", score=None)])
    assert counts["44130"]["F_60plus"] == pytest.approx(1.5)


# --- 선호 가중치 보정 ----------------------------------------------------------

def test_no_ratings_returns_prior_unchanged():
    assert affinity.adjusted_affinity(0.70, None, None) == 0.70
    assert affinity.adjusted_affinity(1.3, None, None) == 1.3  # 평가가 없으면 범위 제한도 하지 않는다


def test_documented_example_gives_about_0_95():
    stat = affinity.RatingStat(n_eff=12, mean=4.4)
    age_mean = affinity.RatingStat(n_eff=500, mean=3.8)
    assert affinity.adjusted_affinity(0.70, stat, age_mean) == pytest.approx(0.95, abs=0.005)


def test_weight_grows_with_number_of_ratings():
    age_mean = affinity.RatingStat(n_eff=500, mean=3.8)
    values = [affinity.adjusted_affinity(0.70, affinity.RatingStat(n, 4.4), age_mean) for n in (0, 5, 10, 50, 500)]
    assert values == sorted(values)
    assert values[-1] == pytest.approx(4.4 / 3.8, abs=0.02)  # 평가가 아주 많으면 실측 선호도에 거의 같아진다


def test_result_is_clipped():
    age_mean = affinity.RatingStat(n_eff=500, mean=1.0)
    assert affinity.adjusted_affinity(1.0, affinity.RatingStat(1000, 5.0), age_mean) == 1.4
    assert affinity.adjusted_affinity(1.0, affinity.RatingStat(1000, 1.0), affinity.RatingStat(500, 5.0)) == 0.6


def test_rating_stats_downweights_old_ratings_and_ignores_directions():
    recent = ev(score=5, occurred_at="2026-11-09T00:00:00+00:00")
    old = ev(anon_id="a2", score=1, occurred_at="2025-11-10T00:00:00+00:00")  # 1년 전
    click = ev(anon_id="a3", kind="directions", score=None)
    age_means, stats = affinity.rating_stats([recent, old, click], NOW)
    stat = stats[("독립기념관", "60plus")]
    assert 3.5 < stat.mean < 5.0 and stat.mean > 3.0  # 최근 5점이 1년 전 1점보다 크게 반영된다
    assert stat.n_eff < 2.0                            # 오래된 평가는 한 건으로 세지 않는다
    assert set(age_means) == {"60plus"}


# --- 기본값(prior)과 섞기 ------------------------------------------------------

def _prior(favored="F_60plus", boost=4.0, strength=50.0):
    weights = {g: (boost if g == favored else 1.0) for g in events.GROUP_KEYS}
    total = sum(weights.values())
    return aggregate.Prior(shares={g: w / total for g, w in weights.items()}, strength=strength)


def test_zero_records_gives_exactly_the_prior_lq():
    priors = {"44130": _prior(), "42150": _prior(favored="M_20s")}
    shares = aggregate.blended_national_shares({}, priors)
    result = region.region_lq({}, shares, "44130", "F_60plus", priors["44130"])
    assert result.lq == pytest.approx(priors["44130"].shares["F_60plus"] / shares["F_60plus"])
    assert result.records == 0 and result.reliability == 0


def test_user_records_pull_lq_away_from_the_prior():
    priors = {"44130": _prior(favored="F_60plus", boost=4.0), "42150": _prior(favored="F_60plus", boost=4.0)}
    # 이 지역에는 실제로 20대 남성만 온다
    evs = [ev(anon_id=f"u{i}", gender="M", age_group="20s") for i in range(400)]
    counts = aggregate.region_group_counts(evs)
    shares = aggregate.blended_national_shares(counts, priors)
    before = region.region_lq({}, aggregate.blended_national_shares({}, priors), "44130", "M_20s", priors["44130"]).lq
    after = region.region_lq(counts, shares, "44130", "M_20s", priors["44130"])
    assert after.lq > before and after.reliability == pytest.approx(400 / 450)
    assert region.region_lq(counts, shares, "44130", "F_60plus", priors["44130"]).lq < 1.0  # 기본값이 밀던 집단이 줄어든다


def test_region_without_prior_matches_the_existing_smoothed_lq_formula():
    evs = [ev(anon_id=f"u{i}", gender="F", age_group="20s") for i in range(30)]
    counts = aggregate.region_group_counts(evs)
    shares = aggregate.national_shares(counts)
    got = region.region_lq(counts, shares, "44130", "F_20s").lq
    assert got == pytest.approx(location_quotient(30.0, 30.0, shares["F_20s"], k=region.DEFAULT_STRENGTH))
