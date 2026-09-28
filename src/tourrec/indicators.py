"""1단계: Data Dictionary(보고서 2.2.6) 형식의 테이블에서 원지표를 계산한다.

입력 테이블 스키마는 docs/recommendation_method.md 의 '입력 테이블' 절을 따른다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C

NON_LOCAL = ("외지인", "외국인")


# ---------------------------------------------------------------------------
# 공통
# ---------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    """위경도(WGS84) 두 점 사이 대원거리(km). 배열 브로드캐스팅 지원."""
    R = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi, dlmb = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def last_12_months(visitor_monthly: pd.DataFrame) -> pd.DataFrame:
    """가장 최근 12개월만 남긴다(연도가 섞여도 성수기 계산이 한 해 기준이 되도록)."""
    months = sorted(visitor_monthly["ym"].unique())[-12:]
    return visitor_monthly[visitor_monthly["ym"].isin(months)]


# ---------------------------------------------------------------------------
# 치안
# ---------------------------------------------------------------------------
def effective_population(sgg: pd.DataFrame, visitor_monthly: pd.DataFrame,
                         theta: float = C.VISITOR_PRESENCE_THETA) -> pd.Series:
    """N_eff = 주민등록 인구 + θ × 일평균 외지인·외국인 방문자 수.

    방문자수 API는 '일자별 순방문자'라서 월 합계 / 해당 월 일수 = 그 달의 일평균
    체류 인원이 된다. 관광객이 몰리는 지역의 범죄율이 주민 인구만으로 계산되어
    과대평가되는 편향(보고서 2.2.9 '통계 편향')을 줄이기 위한 분모 보정이다.
    """
    v = last_12_months(visitor_monthly)
    v = v[v["visitor_div"].isin(NON_LOCAL)]
    days = pd.PeriodIndex(v["ym"], freq="M").days_in_month
    daily = (v["visitors"] / days).groupby(v["sgg_code"]).sum() / v.groupby("sgg_code")["ym"].nunique()
    pop = sgg.set_index("sgg_code")["population"].astype(float)
    return pop + theta * daily.reindex(pop.index).fillna(0.0)


def eb_rate(counts: pd.Series, exposure: pd.Series) -> pd.Series:
    """경험적 베이즈 전역 축소 추정(Marshall, 1991).

    r_s = C_s/N_s, m = ΣC/ΣN,
    s² = Σ N_s (r_s − m)² / ΣN,  A = max(s² − m/N̄, 0),
    w_s = A / (A + m/N_s),  r̂_s = m + w_s (r_s − m)

    인구가 작은 지역일수록 w_s 가 작아져 전국 평균 쪽으로 당겨진다. 인구 1만 명
    군에서 범죄 몇 건 차이로 순위가 크게 흔들리는 문제를 막는다.
    """
    counts, exposure = counts.astype(float), exposure.astype(float)
    r = counts / exposure
    m = counts.sum() / exposure.sum()
    s2 = (exposure * (r - m) ** 2).sum() / exposure.sum()
    A = max(s2 - m / exposure.mean(), 0.0)
    w = A / (A + m / exposure) if A > 0 else pd.Series(0.0, index=r.index)
    return m + w * (r - m)


def crime_rate(crime_sgg: pd.DataFrame, n_eff: pd.Series, year: int | None = None,
               shrink: bool = C.EB_SHRINKAGE) -> pd.Series:
    """시군구별 5대 범죄 유효인구 10만 명당 발생률."""
    df = crime_sgg[crime_sgg["crime_major"].isin(C.FIVE_MAJOR_CRIMES)]
    year = year or df["year"].max()
    cnt = df[df["year"] == year].groupby("sgg_code")["count"].sum()
    cnt = cnt.reindex(n_eff.index)          # 통계에 없는 시군구는 결측(0으로 채우지 않음)
    ok = cnt.notna()
    rate = pd.Series(np.nan, index=n_eff.index)
    if shrink:
        rate[ok] = eb_rate(cnt[ok], n_eff[ok])
    else:
        rate[ok] = cnt[ok] / n_eff[ok]
    return rate * 1e5


# ---------------------------------------------------------------------------
# 교통
# ---------------------------------------------------------------------------
def epdo(hotspots: pd.DataFrame, w: dict = C.EPDO_WEIGHTS) -> pd.Series:
    """사고다발지역별 심각도 가중 사상자(EPDO)."""
    return (w["death"] * hotspots["death_cnt"] + w["serious"] * hotspots["serious_cnt"]
            + w["minor"] * hotspots["minor_cnt"] + w["reported"] * hotspots["reported_cnt"])


def hotspot_exposure(attr: pd.DataFrame, hotspots: pd.DataFrame,
                     radius_km: float = C.HOTSPOT_RADIUS_KM, acc_types: set | None = None,
                     chunk: int = 500) -> pd.Series:
    """관광지 반경 r 안 사고다발지역의 거리 감쇠 EPDO 합.

    T_i = Σ_{j: d_ij ≤ r} (1 − d_ij / r) · EPDO_j

    선형 감쇠를 쓰는 이유: 반경 경계에서 값이 갑자기 끊기지 않게 하고(0.49km와
    0.51km가 전혀 다르게 취급되는 문제), 가까운 다발지역일수록 방문객 동선과
    겹칠 가능성이 크다는 가정을 반영한다.

    '다발지역 미수록 = 사고 없음'이 아니므로(보고서 2.2.2 ④), 이 값이 0이어도
    시군구 단위 traffic_area 가 함께 들어가 0 해석 문제를 보완한다.
    """
    hs = hotspots if acc_types is None else hotspots[hotspots["acc_type"].isin(acc_types)]
    out = np.zeros(len(attr))
    if hs.empty:
        return pd.Series(out, index=attr.index)
    h_lat, h_lon, h_w = hs["lat"].to_numpy(), hs["lon"].to_numpy(), epdo(hs).to_numpy()
    a_lat, a_lon = attr["lat"].to_numpy(), attr["lon"].to_numpy()
    for s in range(0, len(attr), chunk):          # 관광지 수가 많을 때 메모리 제한
        d = haversine_km(a_lat[s:s + chunk, None], a_lon[s:s + chunk, None], h_lat[None, :], h_lon[None, :])
        k = np.clip(1 - d / radius_km, 0, None)
        out[s:s + chunk] = (k * h_w[None, :]).sum(axis=1)
    return pd.Series(out, index=attr.index)


def traffic_area(hotspots: pd.DataFrame, n_eff: pd.Series) -> pd.Series:
    """시군구 사고다발지역 EPDO 합 / 유효인구 × 10만 (다발지역이 없으면 0)."""
    s = epdo(hotspots).groupby(hotspots["sgg_code"]).sum()
    return s.reindex(n_eff.index).fillna(0.0) / n_eff * 1e5


# ---------------------------------------------------------------------------
# 날씨
# ---------------------------------------------------------------------------
def climatology_from_daily(daily: pd.DataFrame, th: dict = C.WEATHER_THRESHOLDS,
                           years: int = C.WEATHER_CLIMATE_YEARS) -> pd.DataFrame:
    """ASOS 일자료 → 관측소×월 위험 기상일 비율.

    입력 컬럼: stn_id, date, tmax, tmin, precip, snow_new
    출력 컬럼: stn_id, month, heat, rain, cold, snow (각 0~1)

    사고 건별 일시가 없어 '사고 당일 날씨' 매칭이 불가능하므로(보고서 2.3),
    '그 달에 위험 기상이 나타나는 빈도(기후 노출)'를 날씨 위험으로 정의한다.
    """
    d = daily.copy()
    d["date"] = pd.to_datetime(d["date"])
    d = d[d["date"].dt.year > d["date"].dt.year.max() - years]
    d["month"] = d["date"].dt.month
    flags = pd.DataFrame({
        "stn_id": d["stn_id"], "month": d["month"],
        "heat": (d["tmax"] >= th["heat"]).where(d["tmax"].notna()),
        "rain": (d["precip"].fillna(0) >= th["rain"]),
        "cold": (d["tmin"] <= th["cold"]).where(d["tmin"].notna()),
        "snow": (d["snow_new"].fillna(0) >= th["snow"]),
    })
    return flags.groupby(["stn_id", "month"]).mean().reset_index()


def nearest_station(attr: pd.DataFrame, stations: pd.DataFrame,
                    max_km: float = C.WEATHER_MAX_STATION_KM) -> pd.DataFrame:
    """관광지별 최근접 관측소와 거리. max_km 보다 멀면 stn_id 를 결측으로 둔다."""
    d = haversine_km(attr["lat"].to_numpy()[:, None], attr["lon"].to_numpy()[:, None],
                     stations["lat"].to_numpy()[None, :], stations["lon"].to_numpy()[None, :])
    idx, dist = d.argmin(axis=1), d.min(axis=1)
    stn = stations["stn_id"].to_numpy()[idx].astype(object)
    stn[dist > max_km] = None
    return pd.DataFrame({"stn_id": stn, "stn_km": dist}, index=attr.index)


# ---------------------------------------------------------------------------
# 연령 적합도 · 인기도 · 혼잡도
# ---------------------------------------------------------------------------
def age_location_quotient(age_mix: pd.DataFrame, visitor_monthly: pd.DataFrame,
                          lam: float = C.AGE_SHARE_PSEUDO_COUNT) -> pd.DataFrame:
    """시군구 s, 연령대 a 의 평활 입지계수 LQ_{a,s}.

    v_{a,s} = share_{a,s} × v_s  (데이터랩은 비중만 주므로 방문자수 API의 v_s로 인원 복원)
    π_a = Σ_s v_{a,s} / Σ_s v_s                       (전국 연령 비중)
    p̃_{a,s} = (v_{a,s} + λ·π_a) / (v_s + λ)          (가상관측 λ명만큼 전국 비중으로 평활)
    LQ_{a,s} = p̃_{a,s} / π_a

    평활 없이 쓰면 방문자가 적은 지역에서 표본 잡음이 LQ를 크게 흔든다.
    출력: index=sgg_code, columns=AGE_GROUPS
    """
    v = last_12_months(visitor_monthly)
    v_s = v[v["visitor_div"].isin(NON_LOCAL)].groupby("sgg_code")["visitors"].sum()
    share = age_mix.pivot_table(index="sgg_code", columns="age_group", values="share", aggfunc="mean")
    share = share.reindex(columns=C.AGE_GROUPS)
    share = share.div(share.sum(axis=1), axis=0)          # 비중 합이 1이 되도록 보정
    v_s = v_s.reindex(share.index)
    v_as = share.mul(v_s, axis=0)
    ok = v_as.notna().all(axis=1)
    pi = v_as[ok].sum() / v_s[ok].sum()
    p_tilde = (v_as + lam * pi).div(v_s + lam, axis=0)
    return p_tilde / pi


def popularity(visitor_monthly: pd.DataFrame) -> pd.Series:
    """최근 12개월 외지인·외국인 월평균 방문자 수(시군구)."""
    v = last_12_months(visitor_monthly)
    v = v[v["visitor_div"].isin(NON_LOCAL)]
    return v.groupby(["sgg_code", "ym"])["visitors"].sum().groupby("sgg_code").mean()


def crowd_ratio(visitor_monthly: pd.DataFrame) -> pd.DataFrame:
    """시군구×월 혼잡도 = 해당 월 방문자 / 연평균 월 방문자. columns=1..12"""
    v = last_12_months(visitor_monthly)
    v = v[v["visitor_div"].isin(NON_LOCAL)].copy()
    v["month"] = pd.PeriodIndex(v["ym"], freq="M").month
    m = v.groupby(["sgg_code", "month"])["visitors"].sum().unstack("month")
    return m.div(m.mean(axis=1), axis=0).reindex(columns=C.MONTHS)


def relative_risk_multiplier(case_share: float, pop_share: float,
                             lo: float = 1.0, hi: float = 3.0) -> float:
    """연령대 배수 m_k(a)를 공공 통계로 추정: (연령 a의 피해자 비중) / (연령 a의 인구 비중).

    예: 온열질환자 중 65세 이상 비중 35%, 인구 중 65세 이상 비중 18% → RR ≈ 1.94.
    1 미만은 1로(취약하지 않은 집단의 위험을 깎지 않음), 과도한 값은 hi로 제한한다.
    """
    if pop_share <= 0:
        return lo
    return float(np.clip(case_share / pop_share, lo, hi))
