"""가상(synthetic) 샘플 데이터 생성기.

4주차 본수집 전까지 파이프라인·대시보드를 개발하기 위한 데이터다.
- 지역명은 실제 지명이 아닌 '가상시 01' 형식을 쓴다(실제 지역에 가짜 위험 수치를
  붙여 낙인을 만들지 않기 위해 — 보고서 2.2.9).
- 스키마는 실제 데이터와 같으므로(Data Dictionary 2.2.6), 로더만 바꾸면 그대로 동작한다.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C

SIDO = ["가상도 북부", "가상도 중부", "가상도 남부", "가상 광역시"]
CATEGORIES = ["자연", "역사", "휴양", "체험", "문화시설", "레포츠"]
ACC_TYPES = ["보행자", "보행어린이", "스쿨존어린이", "보행노인", "자전거", "법규위반", "이륜차", "결빙"]
ACC_P = [0.25, 0.08, 0.05, 0.12, 0.1, 0.25, 0.1, 0.05]
DIVS = ["현지인", "외지인", "외국인"]

# 가상 지역의 위경도 범위(시각화용 좌표계). 실제 장소를 뜻하지 않는다.
LAT0, LAT1, LON0, LON1 = 35.0, 37.6, 126.6, 129.2


def generate(seed: int = 42, n_sgg: int = 40, n_attr: int = 320, n_hotspot: int = 420,
             n_station: int = 22) -> dict[str, pd.DataFrame]:
    rng = np.random.default_rng(seed)

    # --- 시군구 --------------------------------------------------------------
    kinds = rng.choice(["시", "군", "구"], n_sgg, p=[0.4, 0.35, 0.25])
    pop = np.where(kinds == "군", rng.lognormal(10.6, 0.5, n_sgg),
                   np.where(kinds == "구", rng.lognormal(12.4, 0.4, n_sgg), rng.lognormal(12.0, 0.6, n_sgg)))
    center = np.c_[rng.uniform(LAT0 + .2, LAT1 - .2, n_sgg), rng.uniform(LON0 + .2, LON1 - .2, n_sgg)]
    sgg = pd.DataFrame({
        "sgg_code": [f"9{i:04d}" for i in range(1, n_sgg + 1)],
        "sido": rng.choice(SIDO, n_sgg),
        "sigungu": [f"가상{k} {i:02d}" for i, k in enumerate(kinds, 1)],
        "kind": kinds,
        "population": pop.round().astype(int),
        "lat": center[:, 0], "lon": center[:, 1],
    })
    tourism = rng.lognormal(0, 0.9, n_sgg)            # 지역의 관광 매력도(잠재 변수)

    # --- 방문자(월별, 최근 12개월) --------------------------------------------
    season = np.array([.7, .7, .85, 1.0, 1.15, 1.0, 1.35, 1.45, 1.0, 1.2, 1.0, .75])
    rows = []
    for i, s in sgg.iterrows():
        peak = rng.uniform(0.6, 1.4)
        for m in range(1, 13):
            base = 30 * s["population"] ** 0.55 * tourism[i] * season[m - 1] ** peak * 30
            for d, f in zip(DIVS, [1.2, 1.0, 0.05 * rng.uniform(.3, 2)]):
                rows.append({"sgg_code": s["sgg_code"], "ym": f"2025-{m:02d}", "visitor_div": d,
                             "visitors": int(base * f * rng.uniform(.9, 1.1))})
    visitor_monthly = pd.DataFrame(rows)

    # --- 연령 비중(데이터랩 형식) ---------------------------------------------
    national = np.array([.08, .18, .19, .19, .17, .12, .07])
    rows = []
    for i, s in sgg.iterrows():
        tilt = rng.normal(0, .25, 7) + (np.linspace(-.3, .3, 7) if s["kind"] == "군" else 0)
        share = national * np.exp(tilt)
        share /= share.sum()
        rows += [{"sgg_code": s["sgg_code"], "age_group": a, "share": v} for a, v in zip(C.AGE_GROUPS, share)]
    age_mix = pd.DataFrame(rows)
    # 결측 처리 확인용: 한 시군구는 연령 비중이 없다
    age_mix = age_mix[age_mix["sgg_code"] != sgg["sgg_code"].iloc[-1]]

    # --- 범죄(세로형) ---------------------------------------------------------
    base_rate = {"살인": 1.3, "강도": 1.5, "강간·강제추행": 45, "절도": 360, "폭력": 290}
    rows = []
    for i, s in sgg.iterrows():
        level = rng.lognormal(0, .35) * (1 + .15 * np.log(tourism[i] + 1))
        for c, r in base_rate.items():
            rows.append({"sgg_code": s["sgg_code"], "year": 2024, "crime_major": c,
                         "count": int(rng.poisson(r * level * s["population"] / 1e5))})
    crime_sgg = pd.DataFrame(rows)

    # --- 관광지 --------------------------------------------------------------
    w = tourism / tourism.sum()
    home = rng.choice(n_sgg, n_attr, p=w)
    cat = rng.choice(CATEGORIES, n_attr)
    ctype = np.where(cat == "문화시설", 14, np.where(cat == "레포츠", 28, 12))
    attraction = pd.DataFrame({
        "content_id": [f"S{100000 + i}" for i in range(n_attr)],
        "content_type_id": ctype,
        "title": [f"가상 관광지 {i:03d}" for i in range(1, n_attr + 1)],
        "sgg_code": sgg["sgg_code"].to_numpy()[home],
        "category": cat,
        "lat": center[home, 0] + rng.normal(0, .06, n_attr),
        "lon": center[home, 1] + rng.normal(0, .07, n_attr),
    })
    # 좌표 결측 1건(제외 처리 확인용)
    attraction.loc[n_attr - 1, ["lat", "lon"]] = np.nan

    # --- 교통사고다발지역 -----------------------------------------------------
    src = rng.choice(n_sgg, n_hotspot, p=(pop / pop.sum()) * .6 + w * .4)
    near_attr = rng.random(n_hotspot) < .45           # 절반 가까이는 관광지 근처에 둔다
    anchor = attraction.dropna().sample(n_hotspot, replace=True, random_state=seed)
    lat = np.where(near_attr, anchor["lat"].to_numpy() + rng.normal(0, .003, n_hotspot),
                   center[src, 0] + rng.normal(0, .05, n_hotspot))
    lon = np.where(near_attr, anchor["lon"].to_numpy() + rng.normal(0, .004, n_hotspot),
                   center[src, 1] + rng.normal(0, .06, n_hotspot))
    sgg_of = np.where(near_attr, anchor["sgg_code"].to_numpy(), sgg["sgg_code"].to_numpy()[src])
    acc = rng.poisson(6, n_hotspot) + 3
    accident_hotspot = pd.DataFrame({
        "spot_id": [f"H{i:05d}" for i in range(n_hotspot)], "year": 2024,
        "acc_type": rng.choice(ACC_TYPES, n_hotspot, p=ACC_P), "sgg_code": sgg_of,
        "acc_cnt": acc, "death_cnt": rng.binomial(acc, .02), "serious_cnt": rng.binomial(acc, .25),
        "minor_cnt": rng.binomial(acc, .6), "reported_cnt": rng.binomial(acc, .15),
        "lat": lat, "lon": lon,
    })

    # --- 관측소·기후(월별 위험 기상일 비율) -----------------------------------
    station = pd.DataFrame({"stn_id": [f"ST{i:02d}" for i in range(n_station)],
                            "name": [f"가상관측소 {i:02d}" for i in range(n_station)],
                            "lat": rng.uniform(LAT0, LAT1, n_station), "lon": rng.uniform(LON0, LON1, n_station)})
    heat = np.array([0, 0, 0, 0, .01, .08, .3, .38, .07, 0, 0, 0])
    rain = np.array([0, 0, .005, .01, .02, .05, .1, .08, .04, .01, .005, 0])
    cold = np.array([.2, .12, .02, 0, 0, 0, 0, 0, 0, 0, .02, .1])
    snow = np.array([.08, .06, .02, 0, 0, 0, 0, 0, 0, 0, .01, .05])
    rows = []
    for _, s in station.iterrows():
        south = (s["lat"] - LAT0) / (LAT1 - LAT0)          # 0 남쪽 ~ 1 북쪽
        f_heat, f_cold = rng.uniform(.6, 1.4) * (1.3 - .5 * south), rng.uniform(.6, 1.4) * (.4 + 1.2 * south)
        f_rain, f_snow = rng.uniform(.6, 1.5), rng.uniform(.4, 1.8) * (.3 + 1.2 * south)
        for m in range(12):
            rows.append({"stn_id": s["stn_id"], "month": m + 1, "heat": min(heat[m] * f_heat, 1),
                         "rain": min(rain[m] * f_rain, 1), "cold": min(cold[m] * f_cold, 1),
                         "snow": min(snow[m] * f_snow, 1)})
    weather_climate = pd.DataFrame(rows)

    # --- 지역안전지수(검증용 등급, 1 안전 ~ 5 위험) ----------------------------
    tables = dict(sgg=sgg, visitor_monthly=visitor_monthly, age_mix=age_mix, crime_sgg=crime_sgg,
                  attraction=attraction, accident_hotspot=accident_hotspot, station=station,
                  weather_climate=weather_climate)
    tables["safety_index"] = _safety_index(tables, rng)
    return tables


def _safety_index(t, rng) -> pd.DataFrame:
    """가상 지역안전지수: 실제처럼 '같은 유형 지자체 안의 상대 5등급'으로 만든다."""
    c = t["crime_sgg"].groupby("sgg_code")["count"].sum()
    s = t["sgg"].set_index("sgg_code")
    a = t["accident_hotspot"].groupby("sgg_code")["acc_cnt"].sum().reindex(s.index).fillna(0)
    rows = []
    for field_name, x in [("범죄", c / s["population"]), ("교통사고", a / s["population"])]:
        x = np.log(x + 1e-6) + rng.normal(0, .25, len(x))
        g = x.groupby(s["kind"]).transform(lambda v: pd.qcut(v.rank(method="first"), 5, labels=False) + 1)
        rows += [{"sgg_code": k, "field": field_name, "grade": int(v)} for k, v in g.items()]
    return pd.DataFrame(rows)


def save(tables: dict[str, pd.DataFrame], out_dir: str | Path) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        df.to_csv(out / f"{name}.csv", index=False, encoding="utf-8-sig")


def load(in_dir: str | Path) -> dict[str, pd.DataFrame]:
    d = Path(in_dir)
    str_cols = {"sgg_code": str, "content_id": str, "stn_id": str, "spot_id": str}
    return {p.stem: pd.read_csv(p, dtype=str_cols, encoding="utf-8-sig") for p in d.glob("*.csv")}
