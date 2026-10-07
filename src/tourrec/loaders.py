"""data/raw/ 의 원본 파일(공공데이터포털·기상자료개방포털·행안부 다운로드)을
Data Dictionary 형식으로 바꾼다. 보고서 2.2.5 의 명칭·코드 통일 규칙을 구현한다.

원본 컬럼명은 기관·연도마다 조금씩 달라서 후보 이름 목록에서 찾는다. 하나도 없으면
실제 컬럼 목록을 보여 주는 오류를 낸다(그때 후보 목록에 이름을 추가하면 된다).
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C

# ---------------------------------------------------------------------------
# 공통 유틸
# ---------------------------------------------------------------------------
def read_csv_any(path: str | Path, **kw) -> pd.DataFrame:
    """utf-8-sig → cp949 순서로 시도 (공공데이터 CSV 는 cp949 가 많다)."""
    for enc in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return pd.read_csv(path, encoding=enc, **kw)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError(f"인코딩을 알 수 없음: {path}")


def pick(df: pd.DataFrame, candidates: list[str], required: bool = True) -> str | None:
    """후보 이름 중 df 에 있는 첫 컬럼명. 공백·괄호 단위 차이는 무시하고 비교한다."""
    norm = {re.sub(r"[\s()（）°℃]", "", c): c for c in df.columns}
    for cand in candidates:
        key = re.sub(r"[\s()（）°℃]", "", cand)
        if key in norm:
            return norm[key]
    for cand in candidates:                         # 접두 일치 (예: '최고기온(°C)')
        key = re.sub(r"[\s()（）°℃]", "", cand)
        for k, c in norm.items():
            if k.startswith(key):
                return c
    if required:
        raise KeyError(f"컬럼을 찾지 못함: 후보 {candidates} / 실제 {list(df.columns)}")
    return None


# ---------------------------------------------------------------------------
# 행정구역 명칭 → 시군구 코드 (보고서 2.2.5)
# ---------------------------------------------------------------------------
SIDO_ALIASES = {
    "서울특별시": ["서울", "서울시"], "부산광역시": ["부산"], "대구광역시": ["대구"],
    "인천광역시": ["인천"], "광주광역시": ["광주"], "대전광역시": ["대전"], "울산광역시": ["울산"],
    "세종특별자치시": ["세종", "세종시"], "경기도": ["경기"],
    "강원특별자치도": ["강원", "강원도"],          # 2023.6 명칭 변경
    "충청북도": ["충북"], "충청남도": ["충남"],
    "전북특별자치도": ["전북", "전라북도"],        # 2024.1 명칭 변경
    "전라남도": ["전남"], "경상북도": ["경북"], "경상남도": ["경남"],
    "제주특별자치도": ["제주", "제주도"],
}
# 관할 변경: 군위군 경북 → 대구 (2023.7). 옛 표기도 같은 코드로 보낸다.
EXTRA_NAMES = {"경북군위군": "대구광역시 군위군", "경상북도군위군": "대구광역시 군위군"}


def _key(s: str) -> str:
    return re.sub(r"[\s·.]", "", str(s))


def analysis_unit(code: str) -> str:
    """분석 단위 코드. 일반구(끝자리 ≠ 0, 예 41111 수원시 장안구)는 상위 시(41110)로 올린다.

    범죄 통계가 '수원시'처럼 시 합산으로만 나오므로 모든 자료를 시 단위로 맞춘다.
    """
    code = str(code)[:5]
    return code[:4] + "0" if len(code) == 5 and code[-1] != "0" else code


class RegionIndex:
    """주민등록 인구 표의 시군구 목록으로 명칭 → 코드 사전을 만든다."""

    def __init__(self, sgg: pd.DataFrame):
        self.sgg = sgg
        self.map: dict[str, str] = {}
        for code, sido, sigungu in sgg[["sgg_code", "sido", "sigungu"]].itertuples(index=False):
            names = [sido] + SIDO_ALIASES.get(sido, [])
            for n in names:
                self.map[_key(f"{n}{sigungu}")] = code
            if sido == "세종특별자치시":
                for n in names:
                    self.map[_key(n)] = code
        for alias, full in EXTRA_NAMES.items():
            sido, sigungu = full.split(" ", 1)
            hit = sgg[(sgg["sido"] == sido) & (sgg["sigungu"] == sigungu)]
            if len(hit):
                self.map[_key(alias)] = hit["sgg_code"].iloc[0]

    def code(self, name: str) -> str | None:
        return self.map.get(_key(name))

    def codes(self, names: pd.Series) -> pd.Series:
        return names.map(self.code)


# ---------------------------------------------------------------------------
# 1. 주민등록 인구 (행안부 jumin.mois.go.kr, 시군구별)
# ---------------------------------------------------------------------------
def load_population(path) -> pd.DataFrame:
    """'행정구역' = '서울특별시 종로구 (1111000000)' 형식. 일반구는 상위 시로 합친다."""
    df = read_csv_any(path, thousands=",")
    name_col = pick(df, ["행정구역", "행정구역명"])
    pop_col = next((c for c in df.columns if "총인구수" in c), None) or pick(df, ["총인구수", "인구수"])
    m = df[name_col].astype(str).str.extract(r"^(?P<name>.+?)\s*\((?P<code>\d{10})\)")
    out = pd.DataFrame({"full": m["name"].str.strip(), "code10": m["code"],
                        "population": pd.to_numeric(df[pop_col].astype(str).str.replace(",", ""), errors="coerce")})
    out = out.dropna(subset=["code10"])
    out = out[~out["code10"].str[2:].eq("00000000")]          # 시도 합계 행 제외
    out["sgg_code"] = out["code10"].str[:5]
    parts = out["full"].str.split(" ", n=1, expand=True)
    out["sido"], out["sigungu"] = parts[0], parts[1]
    single = out["sgg_code"].eq("36110")                       # 세종: 시도이자 시군구
    out.loc[single, "sigungu"] = out.loc[single, "sido"]
    out = out.dropna(subset=["sigungu"])
    # 일반구 행은 상위 시 행에 이미 합산돼 있으므로 버린다 (상위 시 행이 없으면 합쳐서 만든다)
    out["unit"] = out["sgg_code"].map(analysis_unit)
    parents = out[out["sgg_code"] == out["unit"]]
    orphans = out[(out["sgg_code"] != out["unit"]) & ~out["unit"].isin(parents["sgg_code"])]
    if len(orphans):
        g = orphans.groupby("unit").agg(population=("population", "sum"), sido=("sido", "first"),
                                        sigungu=("sigungu", lambda s: s.iloc[0].split(" ")[0]))
        parents = pd.concat([parents, g.reset_index().rename(columns={"unit": "sgg_code"})])
    res = parents[["sgg_code", "sido", "sigungu", "population"]].drop_duplicates("sgg_code")
    res["kind"] = res["sigungu"].str[-1].map({"시": "시", "군": "군", "구": "구"})
    return res.reset_index(drop=True)


# ---------------------------------------------------------------------------
# 2. 경찰청 범죄 발생 지역별 통계 (가로형 → 세로형)
# ---------------------------------------------------------------------------
# 중분류 → 5대 범죄 (경찰청 분류 명칭 기준, 공백·기호 무시 정규식). 손괴는 제외.
FIVE_CRIME_PATTERNS = {
    "살인": r"^살인", "강도": r"^강도", "강간·강제추행": r"강간|강제추행",
    "절도": r"^절도", "폭력": r"상해|폭행|체포|감금|협박|약취|유인|폭력행위|공갈",
}


def load_crime(path, regions: RegionIndex, year: int) -> tuple[pd.DataFrame, list[str]]:
    df = read_csv_any(path, thousands=",")
    major = pick(df, ["범죄대분류", "대분류"])
    minor = pick(df, ["범죄중분류", "중분류"])
    long = df.melt(id_vars=[major, minor], var_name="region", value_name="count")
    long = long[~long["region"].astype(str).str.startswith("외국")]
    long["count"] = pd.to_numeric(long["count"].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
    m = long[minor].astype(str).map(lambda s: re.sub(r"[\s·,]", "", s))
    long["crime_major"] = None
    for name, pat in FIVE_CRIME_PATTERNS.items():
        long.loc[long["crime_major"].isna() & m.str.contains(pat), "crime_major"] = name
    long = long.dropna(subset=["crime_major"])
    long["sgg_code"] = regions.codes(long["region"]).map(lambda c: analysis_unit(c) if c else None)
    unmatched = sorted(long.loc[long["sgg_code"].isna(), "region"].unique())
    out = (long.dropna(subset=["sgg_code"]).groupby(["sgg_code", "crime_major"], as_index=False)["count"].sum()
           .assign(year=year))
    return out[["sgg_code", "year", "crime_major", "count"]], unmatched


# ---------------------------------------------------------------------------
# 3. 전국 교통사고다발지역 표준데이터
# ---------------------------------------------------------------------------
def load_hotspots(path, regions: RegionIndex) -> tuple[pd.DataFrame, list[str]]:
    df = read_csv_any(path)
    num = lambda c: pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int)  # noqa: E731
    out = pd.DataFrame({
        "spot_id": df[pick(df, ["사고지역관리번호", "사고다발지역관리번호"])].astype(str),
        "year": pd.to_numeric(df[pick(df, ["사고연도", "사고년도"])], errors="coerce"),
        "acc_type": df[pick(df, ["사고유형구분", "사고유형"])].astype(str).str.replace(" ", ""),
        "acc_cnt": num(pick(df, ["사고건수", "발생건수"])),
        "death_cnt": num(pick(df, ["사망자수"])), "serious_cnt": num(pick(df, ["중상자수"])),
        "minor_cnt": num(pick(df, ["경상자수"])), "reported_cnt": num(pick(df, ["부상신고자수"])),
        "lat": pd.to_numeric(df[pick(df, ["위도"])], errors="coerce"),
        "lon": pd.to_numeric(df[pick(df, ["경도"])], errors="coerce"),
    })
    loc = pick(df, ["위치코드", "법정동코드"], required=False)
    code = df[loc].astype(str).str.extract(r"^(\d{5})")[0] if loc else pd.Series(None, index=df.index)
    name_col = pick(df, ["시도시군구명", "시군구명"], required=False)
    if name_col:
        code = code.where(code.isin(regions.sgg["sgg_code"]) | code.map(analysis_unit).isin(regions.sgg["sgg_code"]),
                          regions.codes(df[name_col]))
    out["sgg_code"] = code.map(lambda c: analysis_unit(c) if isinstance(c, str) else None)
    unmatched = sorted(df.loc[out["sgg_code"].isna(), name_col].astype(str).unique()) if name_col else []
    out = out.dropna(subset=["lat", "lon"])
    # 다발지역은 연도별로 다시 선정되므로 최신 연도만 쓴다
    out = out[out["year"] == out["year"].max()]
    return out.reset_index(drop=True), unmatched


# ---------------------------------------------------------------------------
# 4. 기상청 ASOS 일자료 + 지점 정보 (기상자료개방포털 다운로드)
# ---------------------------------------------------------------------------
def load_asos(daily_path, station_path) -> tuple[pd.DataFrame, pd.DataFrame]:
    d = read_csv_any(daily_path)
    daily = pd.DataFrame({
        "stn_id": d[pick(d, ["지점", "지점번호"])].astype(str),
        "date": d[pick(d, ["일시", "날짜"])],
        "tmax": pd.to_numeric(d[pick(d, ["최고기온", "최고기온°C"])], errors="coerce"),
        "tmin": pd.to_numeric(d[pick(d, ["최저기온", "최저기온°C"])], errors="coerce"),
        "precip": pd.to_numeric(d[pick(d, ["일강수량", "일강수량mm"])], errors="coerce"),
    })
    snow = pick(d, ["일최심신적설", "최심신적설"], required=False)     # 적설 관측이 없는 지점도 있음
    daily["snow_new"] = pd.to_numeric(d[snow], errors="coerce") if snow else np.nan
    s = read_csv_any(station_path)
    st = pd.DataFrame({"stn_id": s[pick(s, ["지점", "지점번호"])].astype(str),
                       "name": s[pick(s, ["지점명"])],
                       "lat": pd.to_numeric(s[pick(s, ["위도"])], errors="coerce"),
                       "lon": pd.to_numeric(s[pick(s, ["경도"])], errors="coerce")})
    end = pick(s, ["종료일"], required=False)
    if end:                                         # 이전한 지점은 현재 위치(종료일 없음) 사용
        st = st[s[end].isna() | (s[end].astype(str).str.strip() == "")]
    st = st.drop_duplicates("stn_id", keep="last")
    st = st[st["stn_id"].isin(daily["stn_id"].unique())]
    return daily, st.reset_index(drop=True)


# ---------------------------------------------------------------------------
# 5. 데이터랩 연령 비중 / 6. 지역안전지수 (팀이 정리한 세로형 CSV)
# ---------------------------------------------------------------------------
AGE_LABELS = {"10대": "10대", "20대": "20대", "30대": "30대", "40대": "40대", "50대": "50대",
              "60대": "60대", "70대": "70대 이상", "70대이상": "70대 이상", "70대 이상": "70대 이상"}


def load_age_mix(path, regions: RegionIndex) -> tuple[pd.DataFrame, list[str]]:
    """컬럼: (sgg_code 또는 시군구명), age_group(연령대), share(비중, % 또는 0~1).

    일반구 단위로 받으면 비중을 단순 평균하지 않고 상위 시에서 방문자 가중 평균해야
    정확하지만, 데이터랩은 시 단위 집계를 주므로 상위 시 행을 우선 쓴다.
    """
    df = read_csv_any(path, dtype=str)
    code_col = pick(df, ["sgg_code", "시군구코드"], required=False)
    if code_col:
        code = df[code_col].str[:5]
        unmatched = []
    else:
        name = df[pick(df, ["시군구명", "지역명", "시군구"])]
        sido = pick(df, ["시도명", "시도"], required=False)
        full = (df[sido] + " " + name) if sido else name
        code = regions.codes(full)
        unmatched = sorted(full[code.isna()].unique())
    out = pd.DataFrame({"sgg_code": code.map(lambda c: analysis_unit(c) if isinstance(c, str) else None),
                        "age_group": df[pick(df, ["age_group", "연령대"])].str.replace(" ", "").map(AGE_LABELS),
                        "share": pd.to_numeric(df[pick(df, ["share", "비중", "비율"])].str.replace("%", ""),
                                               errors="coerce")})
    if out["share"].max() > 1.5:
        out["share"] = out["share"] / 100
    out = out.dropna().groupby(["sgg_code", "age_group"], as_index=False)["share"].mean()
    return out, unmatched


def load_safety_index(path, regions: RegionIndex) -> pd.DataFrame:
    """컬럼: 시도, 시군구, 분야(범죄·교통사고 …), 등급(1~5)."""
    df = read_csv_any(path, dtype=str)
    full = df[pick(df, ["시도", "시도명"])] + " " + df[pick(df, ["시군구", "시군구명"])]
    return pd.DataFrame({"sgg_code": regions.codes(full).map(lambda c: analysis_unit(c) if c else None),
                         "field": df[pick(df, ["분야", "field"])].str.strip(),
                         "grade": pd.to_numeric(df[pick(df, ["등급", "grade"])], errors="coerce")}).dropna()


def unify_codes(df: pd.DataFrame, col: str = "sgg_code") -> pd.DataFrame:
    """관광정보·방문자 자료의 일반구 코드를 분석 단위(상위 시)로 올린다."""
    df = df.copy()
    df[col] = df[col].astype(str).str[:5].map(analysis_unit)
    return df


def in_korea(lat: pd.Series, lon: pd.Series) -> pd.Series:
    """대한민국 영역(독도·마라도 포함) 대략 범위 — 좌표 오류 탐지용."""
    return lat.between(33.0, 38.7) & lon.between(124.5, 132.0)
