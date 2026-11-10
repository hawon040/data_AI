"""기록 → 지역×(성별·연령대) 건수와 전체 비중."""
from __future__ import annotations

from collections import defaultdict
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
