"""관광지 선호 가중치 보정: 사용자 평가를 기본 가중치와 섞는다.

    weight_k = exp(-경과일수 / DECAY_DAYS)                  최근 평가에 더 큰 비중
    n_ag     = Σ weight_k                                   관광지 a, 연령대 g의 유효 평가 수
    R̄_ag    = Σ weight_k · score_k / n_ag                  가중 평균 점수
    O_ag     = R̄_ag / R̄_g                                  실측 선호도 (R̄_g: 연령대 g가 매긴 전체 평균)
    w_ag     = n_ag / (n_ag + m)
    A'_ag    = w_ag · O_ag + (1 - w_ag) · P_ag              P_ag: 기본 가중치, [0.6, 1.4]로 제한

평가가 0건이면 A' = P(지금 추천 그대로)이고, 평가가 m건 쌓이면 실측과 기본 가중치가 반반이다.
연령대마다 점수를 후하게/짜게 주는 차이는 R̄_g로 나누면서 없앤다.
"""
from __future__ import annotations

import datetime as dt
import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from .events import UsageEvent

DECAY_DAYS = 180.0
PRIOR_STRENGTH_M = 10.0  # 기본 가중치를 실측만큼 믿는 평가 수. 잠정값.
CLIP = (0.6, 1.4)


@dataclass(frozen=True)
class RatingStat:
    n_eff: float   # 유효 평가 수 (최근 것일수록 크게 센 값)
    mean: float    # 가중 평균 점수


def _decay(now: dt.datetime, when: dt.datetime) -> float:
    days = max((now - when).total_seconds() / 86400.0, 0.0)
    return math.exp(-days / DECAY_DAYS)


def _stat(pairs: list[tuple[float, float]]) -> RatingStat | None:
    """[(가중치, 점수)] → RatingStat. 비어 있으면 None."""
    total = sum(w for w, _ in pairs)
    if total <= 0:
        return None
    return RatingStat(n_eff=total, mean=sum(w * s for w, s in pairs) / total)


def rating_stats(events: Iterable[UsageEvent], now: dt.datetime):
    """(연령대별 전체 평균, (관광지, 연령대)별 통계)를 돌려준다. 평가 기록만 쓴다."""
    by_age: dict[str, list] = defaultdict(list)
    by_attraction_age: dict[tuple[str, str], list] = defaultdict(list)
    for event in events:
        if event.kind != "rating":
            continue
        pair = (_decay(now, event.occurred_at), float(event.score))
        by_age[event.age_group].append(pair)
        by_attraction_age[(event.attraction, event.age_group)].append(pair)
    age_means = {age: stat for age, pairs in by_age.items() if (stat := _stat(pairs))}
    attraction_stats = {key: stat for key, pairs in by_attraction_age.items() if (stat := _stat(pairs))}
    return age_means, attraction_stats


def adjusted_affinity(prior: float, stat: RatingStat | None, age_mean: RatingStat | None,
                      m: float = PRIOR_STRENGTH_M, clip: tuple[float, float] = CLIP) -> float:
    """기본 가중치(prior)를 평가로 보정한 값. 평가가 없으면 prior를 그대로 돌려준다."""
    if stat is None or age_mean is None or stat.n_eff <= 0 or age_mean.mean <= 0:
        return prior
    observed = stat.mean / age_mean.mean
    weight = stat.n_eff / (stat.n_eff + m)
    return min(max(weight * observed + (1 - weight) * prior, clip[0]), clip[1])
