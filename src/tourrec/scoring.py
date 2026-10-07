"""2~4단계: 정규화 → 프로필별 안전도 → 최종 점수·게이트·다양성·설명.

build_features() 는 사용자 입력과 무관한 부분(데이터 연도마다 1회)을,
score() 는 사용자 프로필마다 달라지는 부분을 계산한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config as C
from . import indicators as I
from .normalize import lq_to_unit, percentile_rank, robust_minmax

WEATHER_KEYS = ["heat", "rain", "cold", "snow"]
STATIC_KEYS = ["crime_rate", "traffic_spot", "traffic_area", "traffic_child", "traffic_elder"]


@dataclass
class Features:
    attractions: pd.DataFrame          # 관광지별 기본정보 + 원지표(raw_*) + 정규화 지표(r_*)
    weather: pd.DataFrame              # 관측소×월 정규화 날씨 지표 (index=(stn_id, month))
    fit: pd.DataFrame                  # 시군구×연령대 F' (0~1)
    lq: pd.DataFrame                   # 시군구×연령대 LQ 원값(설명용)
    pop: pd.Series                     # 시군구 P' (0~1)
    crowd: pd.DataFrame                # 시군구×월 혼잡도
    sgg: pd.DataFrame
    params: dict = field(default_factory=dict)


def build_features(t: dict[str, pd.DataFrame], theta: float = C.VISITOR_PRESENCE_THETA,
                   radius_km: float = C.HOTSPOT_RADIUS_KM) -> Features:
    """사용자와 무관한 지표를 계산하고 전국 기준으로 정규화한다.

    정규화 기준 모집단(필터 불변성과 단위 일치를 위해 지표의 공간 단위별로 다르게 잡는다):
      - 시군구 지표(crime_rate, traffic_area): 전국 시군구 (관광지 수로 가중하지 않음 —
        관광지가 많은 시군구가 분포를 지배하지 않게)
      - 관광지 지표(traffic_*): 전국 후보 관광지
      - 날씨 지표: 전국 관측소 × 12개월 (1월 폭염 0처럼 계절 차이를 보존)
    """
    sgg = t["sgg"].copy()
    attr = t["attraction"]
    attr = attr[attr["content_type_id"].isin(C.CANDIDATE_CONTENT_TYPES)]
    attr = attr.dropna(subset=["lat", "lon", "sgg_code"]).drop_duplicates("content_id").copy()
    attr = attr.reset_index(drop=True)

    n_eff = I.effective_population(sgg, t["visitor_monthly"], theta)
    crime = I.crime_rate(t["crime_sgg"], n_eff)
    t_area = I.traffic_area(t["accident_hotspot"], n_eff)

    sgg_raw = pd.DataFrame({"n_eff": n_eff, "crime_rate": crime, "traffic_area": t_area})
    sgg_norm = pd.DataFrame({
        "crime_rate": robust_minmax(crime),
        "traffic_area": robust_minmax(t_area),
    })

    hs = t["accident_hotspot"]
    attr["raw_traffic_spot"] = I.hotspot_exposure(attr, hs, radius_km)
    attr["raw_traffic_child"] = I.hotspot_exposure(attr, hs, radius_km, C.CHILD_ACC_TYPES)
    attr["raw_traffic_elder"] = I.hotspot_exposure(attr, hs, radius_km, C.ELDER_ACC_TYPES)
    for k in ["traffic_spot", "traffic_child", "traffic_elder"]:
        attr[f"r_{k}"] = robust_minmax(attr[f"raw_{k}"])
    attr["n_spot"] = I.hotspot_count(attr, hs, radius_km)
    attr["n_spot_child"] = I.hotspot_count(attr, hs, radius_km, C.CHILD_ACC_TYPES)
    attr["n_spot_elder"] = I.hotspot_count(attr, hs, radius_km, C.ELDER_ACC_TYPES)

    for k in ["crime_rate", "traffic_area"]:
        attr[f"raw_{k}"] = attr["sgg_code"].map(sgg_raw[k])
        attr[f"r_{k}"] = attr["sgg_code"].map(sgg_norm[k])

    attr = attr.join(I.nearest_station(attr, t["station"]))

    clim = t["weather_climate"].set_index(["stn_id", "month"])[WEATHER_KEYS]
    wnorm = pd.DataFrame({k: robust_minmax(clim[k], log=False) for k in WEATHER_KEYS})
    wnorm = wnorm.join(clim.add_prefix("raw_"))

    lq = I.age_location_quotient(t["age_mix"], t["visitor_monthly"])
    fit = lq_to_unit(lq)
    pop_raw = I.popularity(t["visitor_monthly"])
    pop = percentile_rank(pop_raw)
    crowd = I.crowd_ratio(t["visitor_monthly"])

    sido = sgg.set_index("sgg_code")
    attr["sido"] = attr["sgg_code"].map(sido["sido"])
    attr["sigungu"] = attr["sgg_code"].map(sido["sigungu"])
    attr["raw_pop"] = attr["sgg_code"].map(pop_raw)

    return Features(attr, wnorm, fit, lq, pop, crowd, sgg,
                    params={"theta": theta, "radius_km": radius_km})


# ---------------------------------------------------------------------------
# 프로필 가중치
# ---------------------------------------------------------------------------
def profile_multipliers(age: str, companion: str, time_slot: str = "주간") -> dict[str, float]:
    """m_k(a, c, t) = max(연령 배수, 동반 배수) × 시간대 배수.

    - 연령·동반은 곱하지 않고 최댓값: 일행의 위험은 '가장 취약한 구성원'이 결정한다는
      가정. 곱하면 70대 + 고령 부모 동반처럼 같은 취약성을 두 번 세게 된다.
    - 기본 비활성 지표(보행어린이·보행노인)는 배수 0에서 시작해 해당 프로필에서만 켜진다.
    - 시간대 배수는 성격이 다른 보정(노출 시간대)이라 곱한다.
    """
    m = {}
    for k in C.SUBINDICATORS:
        base = 0.0 if k in C.INACTIVE_BY_DEFAULT else 1.0
        a = C.AGE_MULTIPLIERS.get(age, {}).get(k, base)
        c = C.COMPANION_MULTIPLIERS.get(companion, {}).get(k, base)
        m[k] = max(a, c) * C.TIME_MULTIPLIERS.get(time_slot, {}).get(k, 1.0)
    return m


def profile_weights(age: str, companion: str, time_slot: str = "주간") -> dict[str, float]:
    """w̃_k = W_f(k)·b_k·m_k / Σ_j W_f(j)·b_j·m_j   (합 = 1)

    b_k 는 요인 안에서 '기본으로 켜진' 지표끼리 합이 1이 되도록 맞춘 값이라,
    배수가 모두 1이면 치안·교통·날씨가 정확히 1/3씩이 된다. 전체를 다시 합 1로
    맞추므로 프로필이 바뀌어도 안전도는 항상 0~100 척도를 유지한다(프로필 간 비교 가능).
    """
    base_sum = {}
    for k, (f, b, *_ ) in C.SUBINDICATORS.items():
        if k not in C.INACTIVE_BY_DEFAULT:
            base_sum[f] = base_sum.get(f, 0.0) + b
    m = profile_multipliers(age, companion, time_slot)
    raw = {k: C.FACTOR_WEIGHTS[f] * (b / base_sum[f]) * m[k] for k, (f, b, *_ ) in C.SUBINDICATORS.items()}
    tot = sum(raw.values())
    return {k: v / tot for k, v in raw.items()}


# ---------------------------------------------------------------------------
# 점수
# ---------------------------------------------------------------------------
def subindicator_matrix(fx: Features, month: int) -> pd.DataFrame:
    """관광지 × 하위지표 정규화 위험값 r_ik (여행 월의 날씨 포함)."""
    a = fx.attractions
    r = pd.DataFrame({k: a[f"r_{k}"] for k in STATIC_KEYS}, index=a.index)
    key = pd.MultiIndex.from_arrays([a["stn_id"], np.full(len(a), month)])
    w = fx.weather[WEATHER_KEYS].reindex(key)
    w.index = a.index
    return r.join(w)


def score(fx: Features, age: str, companion: str, month: int, time_slot: str = "주간",
          alpha: float = C.DEFAULT_ALPHA, beta: float = C.DEFAULT_BETA, gamma: float = C.DEFAULT_GAMMA,
          weights: dict[str, float] | None = None, combine: str = "rank") -> pd.DataFrame:
    """전국 모든 후보 관광지의 점수를 계산한다(지역 필터 전).

    r̂_ik = r_ik (값이 있으면) / med_k (결측이면: 전국 후보 관광지의 중앙값)
    S_i  = 1 − Σ_k w̃_k r̂_ik
    c_i  = Σ_{k: r_ik 존재} w̃_k   (커버리지 — c_i < MIN_COVERAGE 이면 추천 제외)

    결측을 '빼고 남은 지표로 재정규화'하면 결측 지표 자리를 그 관광지의 다른 지표
    평균으로 채우는 셈이 되어, 위험 지표가 빠진 관광지가 오히려 유리해질 수 있다.
    중앙값 대체는 결측을 '전국 보통 수준'으로 두어 유리하지도 불리하지도 않게 한다.
    F'_i = F'(sgg(i), a)          결측이면 0.5(중립)
    P'_i = P'(sgg(i))             결측이면 0.5(중립)
    combine="rank" (기본):  Score_i = α·Ŝ_i + β·F̂_i + γ·P̂_i,   X̂ = 전국 후보 내 백분위
    combine="value"      :  Score_i = α·S_i + β·F'_i + γ·P'_i     (α+β+γ 로 나눠 합 1)

    백분위 결합을 기본으로 하는 이유: 가중합에서 각 항이 순위에 미치는 힘은 가중치 ×
    그 항의 퍼짐(표준편차)에 비례한다. F'는 LQ 평활 때문에 폭이 좁고 P'는 0~1에 고르게
    퍼져 있어, 값 그대로 더하면 β=0.3 을 줘도 연령 적합도가 거의 반영되지 않는다.
    세 항을 모두 균등분포(백분위)로 맞추면 명목 가중치 ≈ 실효 가중치가 된다.
    S, F', P' 원값은 해석·게이트·설명용으로 그대로 보존한다.
    """
    tot = alpha + beta + gamma
    if tot <= 0:
        raise ValueError("α+β+γ 는 0보다 커야 합니다")
    alpha, beta, gamma = alpha / tot, beta / tot, gamma / tot

    w = pd.Series(weights or profile_weights(age, companion, time_slot))
    r = subindicator_matrix(fx, month)[w.index]
    avail = r.notna()
    coverage = avail.mul(w, axis=1).sum(axis=1)
    contrib = r.fillna(r.median()).fillna(0).mul(w, axis=1)
    risk = contrib.sum(axis=1)

    a = fx.attractions
    out = a[["content_id", "title", "content_type_id", "category", "sgg_code", "sido", "sigungu",
             "lat", "lon", "stn_id", "stn_km"]].copy()
    out["coverage"] = coverage
    out["S"] = 1 - risk
    out["fit_missing"] = a["sgg_code"].map(fx.fit[age]).isna()
    out["F"] = a["sgg_code"].map(fx.fit[age]).fillna(0.5)
    out["LQ"] = a["sgg_code"].map(fx.lq[age])
    out["P"] = a["sgg_code"].map(fx.pop).fillna(0.5)
    out["crowd"] = a["sgg_code"].map(fx.crowd[month]) if month in fx.crowd else np.nan
    out["eligible"] = out["coverage"] >= C.MIN_COVERAGE
    if combine == "rank":
        el = out["eligible"]
        for x in ["S", "F", "P"]:
            out[f"q_{x}"] = 0.0
            out.loc[el, f"q_{x}"] = percentile_rank(out.loc[el, x])
    elif combine == "value":
        for x in ["S", "F", "P"]:
            out[f"q_{x}"] = out[x]
    else:
        raise ValueError("combine 은 'rank' 또는 'value'")
    out["c_S"], out["c_F"], out["c_P"] = alpha * out["q_S"], beta * out["q_F"], gamma * out["q_P"]
    out["score"] = out["c_S"] + out["c_F"] + out["c_P"]
    for k in w.index:
        out[f"risk_{k}"] = contrib[k]           # 안전도 감점의 하위지표별 기여(합 = 1 − S)

    gate = out.loc[out["eligible"], "S"].quantile(C.SAFETY_GATE_QUANTILE)
    out["safety_flag"] = out["eligible"] & (out["S"] < gate)
    out["crowd_flag"] = out["crowd"] > C.CROWD_RATIO_FLAG
    out.attrs.update(weights=w.to_dict(), alpha=alpha, beta=beta, gamma=gamma, gate=gate,
                     age=age, companion=companion, month=month, time_slot=time_slot, combine=combine)
    return rank(out)


def effective_weights(scored: pd.DataFrame) -> pd.Series:
    """실효 가중치: 최종 점수 분산 중 각 항(α S, β F', γ P')이 설명하는 몫.

    Var(Score) = Σ_X Cov(c_X, Score)  →  e_X = Cov(c_X, Score) / Var(Score),  Σ e_X = 1

    명목 가중치가 같아도 값의 퍼짐(표준편차)이 작은 항은 순위를 거의 바꾸지 못한다.
    그래서 명목 가중치(α, β, γ)와 함께 이 값을 보고한다.
    """
    s = scored[scored["eligible"]]
    var = s["score"].var()
    if not var:
        return pd.Series({"S": np.nan, "F": np.nan, "P": np.nan})
    return pd.Series({x: s[f"c_{x}"].cov(s["score"]) / var for x in ["S", "F", "P"]})


def rank(scored: pd.DataFrame) -> pd.DataFrame:
    """결정적 정렬: 점수 ↓, 안전도 ↓, content_id ↑ (부동소수 오차는 1e-9 단위로 반올림)."""
    s = scored.assign(_k=scored["score"].round(9), _s=scored["S"].round(9))
    s = s.sort_values(["_k", "_s", "content_id"], ascending=[False, False, True])
    return s.drop(columns=["_k", "_s"])


def recommend(scored: pd.DataFrame, top_n: int = C.DEFAULT_TOP_N, sido: list[str] | None = None,
              include_flagged: bool = False, max_per_sgg: int | None = C.MAX_PER_SGG) -> pd.DataFrame:
    """필터 → 게이트 → 다양성 제약을 거쳐 상위 N개를 고른다.

    지역 필터는 점수를 다시 계산하지 않고 '고르기만' 한다(정규화 기준이 전국이므로
    필터를 바꿔도 같은 관광지의 점수는 변하지 않는다).
    다양성: 정렬 순서대로 훑으며 같은 시군구가 max_per_sgg 개를 넘으면 건너뛴다.
    시군구 단위 지표(F, P, 치안)가 같은 관광지끼리 상위권을 독점하는 것을 막는다.
    """
    c = scored[scored["eligible"]]
    if sido:
        c = c[c["sido"].isin(sido)]
    if not include_flagged:
        c = c[~c["safety_flag"]]
    if not max_per_sgg:
        return c.head(top_n).assign(rank=range(1, min(top_n, len(c)) + 1))
    picked, per = [], {}
    for idx, sg in zip(c.index, c["sgg_code"]):
        if per.get(sg, 0) >= max_per_sgg:
            continue
        picked.append(idx)
        per[sg] = per.get(sg, 0) + 1
        if len(picked) == top_n:
            break
    res = c.loc[picked].copy()
    res["rank"] = range(1, len(res) + 1)
    return res
