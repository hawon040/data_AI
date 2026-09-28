"""공공데이터포털 API 수집 골격 (보고서 2.2.7 코드를 모듈로 정리).

- 인증키는 .env 의 DATA_GO_KR_KEY 로만 읽는다(포털의 'Decoding' 키 — requests가 인코딩).
- 원천 응답은 data/raw/ 에 JSON 그대로 저장한다(재현성).
- 엔드포인트·파라미터·응답 필드명은 4주차 본수집 때 포털 명세와 다시 대조한다.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("DATA_GO_KR_KEY")
APP_NAME = os.getenv("MOBILE_APP", "TourSafetyPBL")
RAW = Path(__file__).resolve().parents[2] / "data" / "raw"

# 한국관광공사 국문 관광정보 서비스 (data.go.kr/data/15101578)
TOUR_AREA_URL = "https://apis.data.go.kr/B551011/KorService2/areaBasedList2"
# 한국관광공사 빅데이터 지역별 방문자수 — 기초지자체 (data.go.kr/data/15101972)
VISITOR_SGG_URL = "https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList"

# 방문자 구분 코드 → Data Dictionary 값 (명세 확인 필요)
TOU_DIV = {"1": "현지인", "2": "외지인", "3": "외국인"}


def fetch_all(url: str, params: dict, rows: int = 100, out: str | Path | None = None,
              sleep: float = 0.2) -> list[dict]:
    """페이지를 끝까지 돌며 item 목록을 모은다(일시 오류 3회 재시도, 지수 대기)."""
    if not KEY:
        raise RuntimeError(".env 에 DATA_GO_KR_KEY 를 설정하세요 (.env.example 참고)")
    items, page = [], 1
    while True:
        q = {"serviceKey": KEY, "numOfRows": rows, "pageNo": page, "_type": "json", **params}
        for attempt in range(3):
            r = requests.get(url, params=q, timeout=15)
            if r.ok:
                break
            time.sleep(2 ** attempt)
        r.raise_for_status()
        body = r.json()["response"]["body"]
        batch = body.get("items") or {}
        batch = batch.get("item", []) if isinstance(batch, dict) else []
        batch = [batch] if isinstance(batch, dict) else batch      # 1건이면 dict 로 오는 경우
        items += batch
        if page * rows >= int(body.get("totalCount", 0)):
            break
        page += 1
        time.sleep(sleep)                                          # 호출 제한 준수(개발계정 일 1,000건)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    return items


def collect_attractions(content_type_id: int) -> pd.DataFrame:
    """관광정보 API → attraction 테이블. mapx=경도, mapy=위도 (보고서 2.2.5)."""
    items = fetch_all(TOUR_AREA_URL, {"MobileOS": "ETC", "MobileApp": APP_NAME, "arrange": "C",
                                      "contentTypeId": content_type_id},
                      out=RAW / f"tour_area_{content_type_id}.json")
    df = pd.DataFrame(items)
    return pd.DataFrame({
        "content_id": df["contentid"].astype(str),
        "content_type_id": df["contenttypeid"].astype(int),
        "title": df["title"],
        # 법정동 시도(2자리) + 시군구(3자리) = 시군구 5자리 통합 키
        "sgg_code": df.get("lDongRegnCd", "").astype(str).str.zfill(2) + df.get("lDongSignguCd", "").astype(str).str.zfill(3),
        "category": df.get("lclsSystm1", ""),
        "addr1": df.get("addr1", ""),
        "lat": pd.to_numeric(df["mapy"], errors="coerce"),
        "lon": pd.to_numeric(df["mapx"], errors="coerce"),
    })


def collect_visitors(start_ymd: str, end_ymd: str) -> pd.DataFrame:
    """방문자수 API(일자별) → visitor_monthly 테이블(월 합계)."""
    items = fetch_all(VISITOR_SGG_URL, {"MobileOS": "ETC", "MobileApp": APP_NAME,
                                        "startYmd": start_ymd, "endYmd": end_ymd},
                      rows=1000, out=RAW / f"visitor_{start_ymd}_{end_ymd}.json")
    df = pd.DataFrame(items)
    df = pd.DataFrame({
        "sgg_code": df["signguCode"].astype(str),
        "ym": df["baseYmd"].astype(str).str[:4] + "-" + df["baseYmd"].astype(str).str[4:6],
        "visitor_div": df["touDivCd"].astype(str).map(TOU_DIV),
        "visitors": pd.to_numeric(df["touNum"], errors="coerce"),
    })
    return df.groupby(["sgg_code", "ym", "visitor_div"], as_index=False)["visitors"].sum()


if __name__ == "__main__":
    for ct in (12, 14, 28):
        print(ct, len(collect_attractions(ct)))
