"""지역 특화지수(LQ): 사용자 기록이 적을수록 1.0(전국 평균)에 가깝게.

indices/location_quotient.py의 평활 식을 그대로 쓴다.

    LQ = ((V_ig + k·s_g) / (V_i + k)) / s_g

V_i(지역 i의 사용자 기록 수)가 0이면 LQ = 1이다 — "이 집단이 이 지역을 특별히 더 찾는지 아직 모른다"는 뜻이다.
V_i가 k에 비해 커질수록 실제 비중(V_ig / V_i)을 따른다. 기록 수에 따른 실제 반영 비율은 reliability()로 확인한다.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..indices.location_quotient import location_quotient

DEFAULT_K = 50.0


@dataclass(frozen=True)
class RegionLQ:
    lq: float
    records: float      # 이 지역의 기록 수(가중). 화면에 "사용자 기록 N건 기반"으로 보여 줄 수 있다.
    reliability: float  # 실제 기록이 반영된 비율 V_i / (V_i + k), 0~1


def region_lq(counts: dict[str, dict[str, float]], shares: dict[str, float], region_code: str, group: str,
              k: float = DEFAULT_K) -> RegionLQ:
    groups = counts.get(region_code, {})
    v_i = sum(groups.values())
    lq = location_quotient(groups.get(group, 0.0), v_i, shares[group], k)
    return RegionLQ(lq=lq, records=v_i, reliability=v_i / (v_i + k))
