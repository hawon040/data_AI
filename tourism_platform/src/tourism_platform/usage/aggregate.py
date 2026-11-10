"""기록 → 지역×(성별·연령대) 건수와 전체 비중."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from .events import GROUP_KEYS, UsageEvent

# 행동마다 "그 집단이 그 지역을 찾는다"는 증거의 세기. 길찾기 클릭은 가겠다는 의도일 뿐 다녀온 것은 아니라서
# 방문 후 평가보다 약하게 센다. 잠정값이며, 기록이 쌓인 뒤 조정한다.
EVENT_WEIGHTS = {"rating": 1.0, "directions": 0.5}

# 전체 비중에 더하는 가상 기록 수(라플라스 평활). 기록이 없는 집단의 비중이 0이 되면 특화지수를 계산할 수 없다.
SHARE_SMOOTHING = 1.0


def region_group_counts(events: Iterable[UsageEvent]) -> dict[str, dict[str, float]]:
    """지역코드 → {집단키 → 가중 건수}."""
    counts: dict[str, dict[str, float]] = defaultdict(lambda: {key: 0.0 for key in GROUP_KEYS})
    for event in events:
        counts[event.region_code][event.group_key] += EVENT_WEIGHTS[event.kind]
    return {region: dict(groups) for region, groups in counts.items()}


def national_shares(counts: dict[str, dict[str, float]], smoothing: float = SHARE_SMOOTHING) -> dict[str, float]:
    """모든 지역을 합친 집단별 비중. 기록이 하나도 없으면 12집단 동일 비중."""
    totals = {key: sum(groups[key] for groups in counts.values()) for key in GROUP_KEYS}
    denominator = sum(totals.values()) + smoothing * len(GROUP_KEYS)
    return {key: (totals[key] + smoothing) / denominator for key in GROUP_KEYS}


@dataclass(frozen=True)
class Prior:
    """기록이 없을 때 쓰는 기본값. 지금은 샘플 방문자 비중이고, 나중에는 공공 방문자 데이터로 바꿀 수 있다.

    shares: 집단별 비중(합 1). strength: 기본값을 몇 건의 기록만큼 믿는지(가상 기록 수).
    """
    shares: dict[str, float]
    strength: float


def blended_national_shares(counts: dict[str, dict[str, float]], priors: dict[str, Prior] | None = None,
                            smoothing: float = SHARE_SMOOTHING) -> dict[str, float]:
    """기본값과 사용자 기록을 합친 건수로 구한 집단별 전체 비중.

    지역마다 (사용자 기록 + 기본값 비중 × 기본값 강도)를 더한다. priors가 없는 지역은 사용자 기록만 더한다.
    """
    priors = priors or {}
    totals = {key: 0.0 for key in GROUP_KEYS}
    for region in set(counts) | set(priors):
        for key in GROUP_KEYS:
            totals[key] += counts.get(region, {}).get(key, 0.0)
            if region in priors:
                totals[key] += priors[region].strength * priors[region].shares[key]
    denominator = sum(totals.values()) + smoothing * len(GROUP_KEYS)
    return {key: (totals[key] + smoothing) / denominator for key in GROUP_KEYS}
