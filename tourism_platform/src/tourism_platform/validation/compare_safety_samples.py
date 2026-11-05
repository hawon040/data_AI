"""실데이터와 웹앱 샘플 지역(web/src/data/sampleRegions.ts)의 안전 지표를 비교하는 표를 만든다.

    DATA_GO_KR_SERVICE_KEY=... KCISA_API_KEY=... python -m tourism_platform.validation.compare_safety_samples

수식 체인(유효인구 → 위해지수 → 경험적 베이즈 축소)에 필요한 입력 중 무엇을 실제로 받았는지와,
받을 수 있었던 실데이터(데이터랩 방문자 수, 관광지 안전정보의 응급의료기관·대피소 수)를 지역별로 보여 준다.
입력이 모자라 계산할 수 없는 값은 계산하지 않고 "계산 불가"와 이유를 적는다 — 가짜 값으로 채우지 않는다.
"""
from __future__ import annotations

import json
import subprocess
from collections import Counter
from pathlib import Path

from ..data import datagokr_client
from ..data.datasets import DATASETS

WEB_DIR = Path(__file__).resolve().parents[4] / "web"

# 위해지수 계산에 필요한 입력과 지금 상태. (입력, 데이터셋, 상태)
FORMULA_INPUTS = [
    ("P_res 주민등록인구", "설정 없음 (행정안전부 주민등록 인구통계)", "미설정"),
    ("V_pd 외지인 방문자(연간)", "visitor_by_region_daily (데이터랩)", "1일치만 수집 — 연간 합계 아님"),
    ("h̄ 평균 체류시간", "설정 없음 (데이터랩 체류시간)", "미설정"),
    ("C_ik 범죄 유형별 발생 건수", "crime_by_region (경찰청, odcloud API)", "연결됨 — 지금 키로 401, 활용신청 확인 필요"),
    ("λ_k 여행자 노출 장소 비중", "crime_by_place (경찰청, odcloud API)", "연결됨 — 지금 키로 401, 활용신청 확인 필요"),
    ("s_k 유형별 심각도", "양형기준 기반 상대값", "값 미정"),
]


def load_sample_regions() -> list[dict]:
    proc = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "scripts/sample_regions_cli.ts"],
        capture_output=True, text=True, encoding="utf-8", cwd=WEB_DIR, check=True, timeout=60,
    )
    return json.loads(proc.stdout)


def _items(data: dict) -> list[dict]:
    items = data["response"]["body"]["items"]
    items = items.get("item", []) if isinstance(items, dict) else items
    return [items] if isinstance(items, dict) else items


def _province_short(province: str) -> str:
    """시도 이름을 데이터마다 같게 맞춘다(강원도/강원특별자치도 → 강원, 충청남도 → 충남)."""
    province = province.strip()
    for long, short in (("충청남", "충남"), ("충청북", "충북"), ("전라남", "전남"), ("전라북", "전북"),
                        ("경상남", "경남"), ("경상북", "경북")):
        if province.startswith(long):
            return short
    return province[:2]


def build_table() -> str:
    regions = load_sample_regions()

    visitors = _items(datagokr_client.fetch(DATASETS["visitor_by_region_daily"], num_of_rows=1000,
                                            startYmd="20260901", endYmd="20260901"))
    names = {v["signguCode"]: v["signguNm"] for v in visitors}
    outsiders = {v["signguCode"]: float(v["touNum"]) for v in visitors if v["touDivCd"] == "2"}
    base_ymd = visitors[0]["baseYmd"] if visitors else "?"

    safety = _items(datagokr_client.fetch(DATASETS["kcisa_tour_safety"], num_of_rows=3000))
    hospitals: Counter = Counter()
    shelters: Counter = Counter()
    for item in safety:
        key = (_province_short(item.get("sido", "")), item.get("gungu", ""))
        subject = item.get("subject", "")
        if subject == "지진해일대피소":
            shelters[key] += 1
        elif "응급" in subject:  # 응급의료센터·응급의료기관·응급의료시설을 모두 센다
            hospitals[key] += 1

    lines = [
        f"| 코드 | 지역 | 코드 확인(데이터랩 이름) | 샘플 방문자 | 실제 외지인 방문자 ({base_ymd}, 1일) "
        "| 샘플 등급 | 샘플 위해지수 (90% 구간) | 실데이터 위해지수 | 응급의료기관 수 (KCISA) | 지진해일대피소 수 (KCISA) |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in regions:
        code_name = names.get(r["code"], "없음")
        match = "일치" if r["name"].split()[0] in code_name else f"불일치({code_name})"
        city = r["name"].split()[0]
        key = (_province_short(r["province"]), city)
        s = r["safety"]
        lines.append(
            f"| {r['code']} | {r['province']} {r['name']} | {match} | {r['totalVisitors']:,} (합성) "
            f"| {outsiders.get(r['code'], float('nan')):,.0f} | {s['grade']} "
            f"| {s['ratePer100k']} ({s['confidenceIntervalLow']}–{s['confidenceIntervalHigh']}) "
            f"| 계산 불가 (C_ik·P_res 없음) | {hospitals.get(key, 0)} | {shelters.get(key, 0)} |"
        )

    inputs = ["| 입력 | 데이터 | 상태 |", "|---|---|---|"] + [f"| {a} | {b} | {c} |" for a, b, c in FORMULA_INPUTS]
    return "\n".join(lines) + "\n\n" + "\n".join(inputs)


if __name__ == "__main__":
    print(build_table())
