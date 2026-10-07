"""원본 파일 로더: 실제 원본의 형식(한글 컬럼·cp949·가로형·옛 명칭·일반구)을 흉내 낸 작은 파일로 검사."""
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tourrec import loaders as L  # noqa: E402

POP = """행정구역,2025년09월_총인구수,2025년09월_세대수
서울특별시  (1100000000),"9,300,000","4,400,000"
서울특별시 종로구 (1111000000),"139,000","72,000"
경기도 수원시 (4111000000),"1,190,000","500,000"
경기도 수원시 장안구 (4111100000),"270,000","120,000"
경기도 수원시 권선구 (4111300000),"370,000","160,000"
강원특별자치도 춘천시 (5111000000),"286,000","130,000"
전북특별자치도 전주시 (5211000000),"640,000","280,000"
대구광역시 군위군 (2772000000),"22,000","13,000"
세종특별자치시 (3611000000),"390,000","160,000"
"""

CRIME = """범죄대분류,범죄중분류,서울 종로구,경기도 수원시,강원도 춘천시,전북 전주시,대구 군위군,경북 군위군,세종시,외국 미국
강력범죄,살인기수,1,2,0,1,0,0,0,0
강력범죄,강도,2,3,1,1,0,0,1,0
강력범죄,강간,10,20,5,6,0,1,3,0
강력범죄,방화,1,1,1,1,0,0,0,0
절도범죄,절도범죄,500,900,200,300,5,3,150,2
폭력범죄,폭행,300,700,150,250,4,2,100,1
폭력범죄,손괴,100,200,50,60,1,1,20,0
"""


@pytest.fixture
def regions(tmp_path):
    p = tmp_path / "population.csv"
    p.write_bytes(POP.encode("cp949"))
    sgg = L.load_population(p)
    return sgg, L.RegionIndex(sgg)


def test_population_rolls_up_general_gu(regions):
    sgg, _ = regions
    codes = set(sgg["sgg_code"])
    assert {"11110", "41110", "51110", "52110", "27720", "36110"} <= codes
    assert "41111" not in codes and "11000" not in codes          # 일반구·시도 합계 제외
    assert sgg.set_index("sgg_code").loc["41110", "population"] == 1_190_000
    assert sgg.set_index("sgg_code").loc["36110", "sigungu"] == "세종특별자치시"


def test_region_names_old_and_short(regions):
    _, reg = regions
    assert reg.code("서울 종로구") == "11110"
    assert reg.code("강원도 춘천시") == "51110"      # 옛 명칭
    assert reg.code("전북 전주시") == "52110"
    assert reg.code("경북 군위군") == "27720"        # 관할 변경
    assert reg.code("세종시") == "36110"


def test_crime_wide_to_long_and_five_major(tmp_path, regions):
    _, reg = regions
    p = tmp_path / "crime.csv"
    p.write_bytes(CRIME.encode("cp949"))
    crime, unmatched = L.load_crime(p, reg, 2024)
    assert unmatched == []
    t = crime.set_index(["sgg_code", "crime_major"])["count"]
    assert t[("27720", "절도")] == 8                  # 대구 군위군 + 경북 군위군 합산
    assert t[("11110", "폭력")] == 300                # 손괴 제외
    assert ("11110", "방화") not in t.index
    assert set(crime["crime_major"]) == {"살인", "강도", "강간·강제추행", "절도", "폭력"}


def test_hotspots_code_and_latest_year(tmp_path, regions):
    _, reg = regions
    df = pd.DataFrame({
        "사고지역관리번호": ["A1", "A2", "A3"], "사고연도": [2024, 2024, 2023],
        "사고유형구분": ["보행노인", "보행 어린이", "보행자"], "위치코드": ["4111112345", "", "1111010100"],
        "시도시군구명": ["경기도 수원시 장안구", "강원도 춘천시", "서울특별시 종로구"],
        "사고건수": [5, 4, 3], "사상자수": [6, 4, 3], "사망자수": [1, 0, 0], "중상자수": [2, 1, 1],
        "경상자수": [3, 3, 2], "부상신고자수": [0, 0, 0], "위도": [37.3, 37.88, 37.57], "경도": [127.0, 127.73, 126.98]})
    p = tmp_path / "hs.csv"
    df.to_csv(p, index=False, encoding="cp949")
    hs, _ = L.load_hotspots(p, reg)
    assert list(hs["sgg_code"]) == ["41110", "51110"]   # 일반구 → 시, 위치코드 없으면 명칭으로
    assert list(hs["acc_type"]) == ["보행노인", "보행어린이"]


def test_asos_columns_and_moved_station(tmp_path):
    d = pd.DataFrame({"지점": [90, 90], "지점명": ["속초"] * 2, "일시": ["2024-08-01", "2024-08-02"],
                      "평균기온(°C)": [27, 28], "최저기온(°C)": [22, 23], "최고기온(°C)": [33.5, 31.0],
                      "일강수량(mm)": [None, 85.0], "일 최심신적설(cm)": [None, None]})
    s = pd.DataFrame({"지점": [90, 90], "시작일": ["1968-01-01", "2010-01-01"], "종료일": ["2009-12-31", None],
                      "지점명": ["속초", "속초"], "위도": [38.25, 38.2509], "경도": [128.56, 128.5647]})
    dp, sp = tmp_path / "d.csv", tmp_path / "s.csv"
    d.to_csv(dp, index=False, encoding="cp949")
    s.to_csv(sp, index=False, encoding="cp949")
    daily, st = L.load_asos(dp, sp)
    assert len(st) == 1 and st["lat"].iloc[0] == pytest.approx(38.2509)
    assert daily["tmax"].tolist() == [33.5, 31.0]


def test_age_mix_percent_and_labels(tmp_path, regions):
    _, reg = regions
    p = tmp_path / "age.csv"
    pd.DataFrame({"시도": ["서울특별시"] * 2, "시군구": ["종로구"] * 2, "연령대": ["20대", "70대 이상"],
                  "비중": ["30.5%", "7"]}).to_csv(p, index=False)
    age, un = L.load_age_mix(p, reg)
    assert un == []
    assert set(age["age_group"]) == {"20대", "70대 이상"}
    assert age["share"].max() == pytest.approx(0.305)


def test_analysis_unit():
    assert L.analysis_unit("41113") == "41110"
    assert L.analysis_unit("11110") == "11110"
