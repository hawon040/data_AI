"""원천 공공데이터 로더 스텁 (문서 11.3 통계·공고 출처).

실제 다운로드/인증은 각 포털에서 개별적으로 처리해야 하므로, 여기서는 각
데이터셋의 출처와 필요한 컬럼, 확인해야 할 사항(문서 11.1)을 코드로 명시하고
CSV/JSON을 읽어 pandas DataFrame으로 표준화하는 자리만 만들어 둔다.

각 함수는 raw_path에 원본 파일을 내려받아 두었다고 가정하고 최소한의 스키마만
강제한다 — 실제 컬럼명은 포털에서 받은 원자료를 열어 확인 후 맞춰야 한다.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

# 데이터셋별 출처 (문서 11.3) — 다운로드 전 라이선스(공공누리 유형)와
# 원자료의 공간 단위를 문서 11.1에 따라 반드시 확인한다.
SOURCES = {
    "visitor_by_gender_age": "https://www.data.go.kr/data/15101972/openapi.do",  # 한국관광공사 빅데이터 지역별 방문자수
    "crime_by_region": "https://www.data.go.kr/data/3074462/fileData.do",  # 경찰청 범죄 발생 지역별 통계
    "crime_by_place": "https://www.data.go.kr/data/3074463/fileData.do",  # 경찰청 범죄 발생 장소별 통계 (lambda_k 산출용)
    "violent_crime_by_station": "https://www.data.go.kr/data/15084592/fileData.do",  # 군 지역 대체용: 경찰서별 강력범죄 발생 현황
    "seoul_5_major_crimes": "https://data.seoul.go.kr/dataList/316/S/2/datasetView.do",  # 서울시 5대 범죄 (구별, 경찰관서 주소지 기준 주의)
}


def load_visitor_by_gender_age(raw_path: str | Path) -> pd.DataFrame:
    """지역×성별×연령대 방문자 수. 필수 컬럼: region_code, gender, age_group, visitors.

    확인 필요(문서 11.1 넷째): 기초지자체 단위 제공 여부, 연령 구간 정의.
    """
    df = pd.read_csv(raw_path)
    required = {"region_code", "gender", "age_group", "visitors"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"필수 컬럼 누락: {missing}")
    return df


def load_crime_by_region(raw_path: str | Path) -> pd.DataFrame:
    """지역별 범죄 발생 건수(3개년). 필수 컬럼: region_code, crime_type, year, count.

    확인 필요(문서 11.1 첫째, 9.3): 군 지역 개별 제공 여부 — 안 되면
    violent_crime_by_station을 경찰서->시군구 매핑으로 대체한다. 서울시는
    구별 구분이 경찰관서 주소지 기준이라 행정 경계와 어긋날 수 있음에 주의.
    """
    df = pd.read_csv(raw_path)
    required = {"region_code", "crime_type", "year", "count"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"필수 컬럼 누락: {missing}")
    return df


def load_crime_exposure_share(raw_path: str | Path) -> pd.DataFrame:
    """범죄 유형별 발생 장소 비중 (lambda_k). 필수 컬럼: crime_type, place, share.

    전국 단위 통계만 있으므로 모든 지역에 같은 계수를 적용하는 가정이
    들어간다(문서 9.3) — 관광지는 실제로 노상/공공장소 비중이 더 높을 수
    있어 보수적 추정이라는 한계를 문서화해야 한다.
    """
    df = pd.read_csv(raw_path)
    required = {"crime_type", "place", "share"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"필수 컬럼 누락: {missing}")
    return df
