"""5자리 시군구 코드 매핑 (문서 5.3).

기준 공간 키는 행정안전부 5자리 시군구 코드로 통일한다. 이름만으로는
지역을 특정할 수 없는 경우가 있으므로(중구, 동구, 강서구, 고성군 등 여러
시도에 동명 지역 존재) 반드시 (시도명, 시군구명) 쌍으로 조회한다.

전체 공식 코드표는 행정표준코드관리시스템(www.code.go.kr)에서 내려받아
`data/raw/sigungu_codes.csv` (columns: sido, sigungu, code)로 저장한 뒤
`load_code_table()`로 불러온다. 이 파일에는 코드표가 없을 때도 개발/테스트가
가능하도록 문서에서 실제로 언급된 동명 지역 예시만 최소한으로 내장해 둔다.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RegionCode:
    sido: str
    sigungu: str
    code: str


# 문서 5.3에서 예시로 든 동명 시군구 — 실제 서비스에서는 load_code_table()로
# 전체 공식 코드표를 불러와 대체해야 한다.
_SAMPLE_TABLE: dict[tuple[str, str], str] = {
    ("서울특별시", "중구"): "11140",
    ("대전광역시", "중구"): "30140",
    ("대구광역시", "중구"): "27110",
    ("인천광역시", "중구"): "28110",
    ("울산광역시", "중구"): "31140",
    ("광주광역시", "동구"): "29110",
    ("대구광역시", "동구"): "27140",
    ("부산광역시", "동구"): "26170",
    ("서울특별시", "강서구"): "11500",
    ("부산광역시", "강서구"): "26440",
    ("강원특별자치도", "고성군"): "42820",
    ("경상남도", "고성군"): "48820",
}


def load_code_table(csv_path: str | Path) -> dict[tuple[str, str], str]:
    """공식 (시도, 시군구) -> 5자리 코드 테이블을 CSV에서 읽는다.

    CSV는 sido, sigungu, code 세 컬럼을 가져야 한다.
    """
    table: dict[tuple[str, str], str] = {}
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            table[(row["sido"], row["sigungu"])] = row["code"]
    return table


def resolve_region_code(
    sido: str, sigungu: str, table: dict[tuple[str, str], str] | None = None
) -> RegionCode:
    """(시도명, 시군구명) 쌍으로 5자리 코드를 조회한다.

    table을 지정하지 않으면 문서 5.3의 예시 동명 지역만 담은 내장 테이블을 쓴다
    (실서비스에서는 load_code_table()로 불러온 전체 테이블을 넘겨야 한다).
    """
    table = table if table is not None else _SAMPLE_TABLE
    key = (sido, sigungu)
    if key not in table:
        raise KeyError(
            f"'{sido} {sigungu}' 코드를 찾을 수 없습니다. "
            "행정표준코드관리시스템 전체 코드표를 load_code_table()로 불러왔는지 확인하세요."
        )
    return RegionCode(sido=sido, sigungu=sigungu, code=table[key])
