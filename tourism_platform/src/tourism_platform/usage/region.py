"""지역 특화지수(LQ): 기본값에서 시작해 사용자 기록이 쌓일수록 실제 기록을 따른다.

    LQ_ig = ((U_ig + K_i·p_ig) / (U_i + K_i)) / s_g

    U_ig, U_i  지역 i의 사용자 기록 건수 (집단 g / 전체)
    p_ig, K_i  기본값: 지역 i에서 집단 g의 비중과, 그것을 몇 건의 기록만큼 믿는지(강도)
    s_g        전국 집단 비중 (기본값과 사용자 기록을 합친 건수로 구함: aggregate.blended_national_shares)

- 기록이 0건이면 LQ = p_ig / s_g — 기본값만으로 계산한 지금의 값과 같다.
- 기록이 K_i에 비해 많아지면 사용자 기록의 비중 U_ig / U_i를 따른다. 반영 비율은 U_i / (U_i + K_i).
- 기본값이 없는 지역(신규 지역)은 기본값 비중을 전국 비중 s_g로 두어, 기록이 없으면 LQ = 1(중립)이다.
  이때 식은 indices/location_quotient.py의 평활 식과 같다.
"""
from __future__ import annotations

from dataclasses import dataclass

from .aggregate import Prior

DEFAULT_STRENGTH = 50.0  # 기본값이 없는 지역에 쓰는 강도 (location_quotient의 k와 같다)


@dataclass(frozen=True)
class RegionLQ:
    lq: float
    records: float      # 이 지역의 사용자 기록 수(가중). 화면에 "사용자 기록 N건 기반"으로 보여 줄 수 있다.
    reliability: float  # 사용자 기록이 반영된 비율 U_i / (U_i + K_i), 0~1


def region_lq(counts: dict[str, dict[str, float]], shares: dict[str, float], region_code: str, group: str,
              prior: Prior | None = None) -> RegionLQ:
    groups = counts.get(region_code, {})
    u_i = sum(groups.values())
    if prior is None:
        strength, p_ig = DEFAULT_STRENGTH, shares[group]
    else:
        strength, p_ig = prior.strength, prior.shares[group]
    share = (groups.get(group, 0.0) + strength * p_ig) / (u_i + strength)
    return RegionLQ(lq=share / shares[group], records=u_i, reliability=u_i / (u_i + strength))
