"""작은 데이터 레이크: raw(원본 JSON, 날짜별) → processed(정제 JSON Lines) → gold(지표 Parquet).

    data/raw/api/<데이터셋>/<YYYY-MM-DD>/page-0001.json   API 응답 원본 그대로
    data/processed/<데이터셋>/<YYYY-MM-DD>.jsonl          정제한 레코드 (한 줄에 하나)
    data/gold/<지표>.parquet                              분석·화면용 지표

data/raw/ 바로 아래는 사람이 직접 내려받는 파일 자리라서(raw/README.md) API 원본은 raw/api/ 아래에 둔다.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from ..data import datagokr_client
from ..data.apis.weather import KST, latest_short_base, latlon_to_grid
from ..data.datasets import DATASETS
from ..data.geo import valid_korea_coords
from ..data.preparedness import Facility, nearest_facility

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
RAW_DIR = DATA_DIR / "raw" / "api"
PROCESSED_DIR = DATA_DIR / "processed"
GOLD_DIR = DATA_DIR / "gold"

_SIDO_SHORT = (
    ("서울", "서울"), ("부산", "부산"), ("대구", "대구"), ("인천", "인천"), ("광주", "광주"), ("대전", "대전"),
    ("울산", "울산"), ("세종", "세종"), ("경기", "경기"), ("강원", "강원"), ("충청북", "충북"), ("충북", "충북"),
    ("충청남", "충남"), ("충남", "충남"), ("전라북", "전북"), ("전북", "전북"), ("전라남", "전남"), ("전남", "전남"),
    ("경상북", "경북"), ("경북", "경북"), ("경상남", "경남"), ("경남", "경남"), ("제주", "제주"),
)


def sido_short(text: str) -> str:
    """주소나 시도명 앞부분을 두 글자 시도명으로 맞춘다(강원도/강원특별자치도 → 강원)."""
    text = (text or "").strip()
    return next((short for prefix, short in _SIDO_SHORT if text.startswith(prefix)), "")


def _items(data: dict) -> list[dict]:
    items = data.get("response", {}).get("body", {}).get("items") or []
    if isinstance(items, dict):
        items = items.get("item") or []
    return [items] if isinstance(items, dict) else list(items)


def _number(value: Any) -> int | None:
    try:
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# raw: API 응답을 그대로 날짜별로 저장
# ---------------------------------------------------------------------------

def ingest(dataset: str, *, day: date, num_of_rows: int = 1000, max_pages: int = 5, **params: Any) -> list[Path]:
    """데이터셋을 페이지 단위로 받아 raw에 저장하고 저장한 파일 목록을 돌려준다."""
    out_dir = RAW_DIR / dataset / day.isoformat()
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for page in range(1, max_pages + 1):
        data = datagokr_client.fetch(DATASETS[dataset], page_no=page, num_of_rows=num_of_rows, **params)
        path = out_dir / f"page-{page:04d}.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        paths.append(path)
        total = _number(data.get("response", {}).get("body", {}).get("totalCount")) or 0
        if page * num_of_rows >= total:
            break
    return paths


def raw_items(dataset: str, day: date) -> list[dict]:
    return [it for p in sorted((RAW_DIR / dataset / day.isoformat()).glob("*.json"))
            for it in _items(json.loads(p.read_text(encoding="utf-8")))]


# ---------------------------------------------------------------------------
# processed: 정제 규칙 — 좌표 검사, 시도 표준화, 숫자 변환, 중복 제거
# ---------------------------------------------------------------------------

def clean_tourspots(items: Iterable[dict]) -> tuple[list[dict], dict[str, int]]:
    """전국관광지정보표준데이터 → 관광지 레코드. 좌표가 없거나 국내 범위 밖이면 빼고, 같은 이름+좌표는 하나만 남긴다."""
    stats = {"input": 0, "bad_coords": 0, "duplicates": 0}
    seen: set[tuple] = set()
    out = []
    for it in items:
        stats["input"] += 1
        coords = valid_korea_coords(it.get("latitude"), it.get("longitude"))
        if coords is None:
            stats["bad_coords"] += 1
            continue
        key = (it.get("trrsrtNm", "").strip(), round(coords[0], 4), round(coords[1], 4))
        if key in seen:
            stats["duplicates"] += 1
            continue
        seen.add(key)
        address = (it.get("rdnmadr") or it.get("lnmadr") or "").strip()
        parts = address.split()
        out.append({
            "name": key[0],
            "kind": (it.get("trrsrtSe") or "").strip(),
            "sido": sido_short(address) or sido_short(it.get("insttNm", "")),
            "sigungu": parts[1] if len(parts) > 1 else "",
            "address": address,
            "lat": coords[0],
            "lon": coords[1],
            "capacity": _number(it.get("aceptncCo")),
            "parking": _number(it.get("prkplceCo")),
            "reference_date": it.get("referenceDate") or None,
        })
    stats["output"] = len(out)
    return out, stats


def clean_shelters(items: Iterable[dict]) -> tuple[list[dict], dict[str, int]]:
    """관광지 안전정보 → 지진해일대피소 레코드."""
    stats = {"input": 0, "not_shelter": 0, "bad_coords": 0}
    out = []
    for it in items:
        stats["input"] += 1
        if it.get("subject") != "지진해일대피소":
            stats["not_shelter"] += 1
            continue
        coords = valid_korea_coords(it.get("lat"), it.get("lon"))
        if coords is None:
            stats["bad_coords"] += 1
            continue
        out.append({
            "name": (it.get("tourName") or "").strip(),
            "sido": sido_short(it.get("sido", "")),
            "sigungu": (it.get("gungu") or "").strip(),
            "lat": coords[0],
            "lon": coords[1],
            "capacity": _number(it.get("totalCapacity")),
        })
    stats["output"] = len(out)
    return out, stats


def clean_short_forecast(items: Iterable[dict], spot: dict) -> list[dict]:
    """단기예보 item(category, fcstDate, fcstTime, fcstValue) → 관광지 하나의 시각별 예보 레코드."""
    out = []
    for it in items:
        out.append({
            "spot": spot["name"],
            "nx": _number(it.get("nx")),
            "ny": _number(it.get("ny")),
            "category": it.get("category"),
            "fcst_at": datetime.strptime(f"{it['fcstDate']}{it['fcstTime']}", "%Y%m%d%H%M").replace(tzinfo=KST).isoformat(),
            "value": it.get("fcstValue"),
            "base": f"{it.get('baseDate')}{it.get('baseTime')}",
        })
    return out


def write_jsonl(records: list[dict], dataset: str, day: date) -> Path:
    path = PROCESSED_DIR / dataset / f"{day.isoformat()}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return path


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


# ---------------------------------------------------------------------------
# gold: 지표
# ---------------------------------------------------------------------------

def build_gold(spots: list[dict], shelters: list[dict]) -> dict[str, pd.DataFrame]:
    """시도별 관광지 지표와 관광지별 가장 가까운 대피소 거리(하버사인)."""
    spots_df = pd.DataFrame(spots)
    region = (
        spots_df.groupby("sido", dropna=False)
        .agg(spots=("name", "size"), capacity_sum=("capacity", "sum"), capacity_mean=("capacity", "mean"),
             parking_sum=("parking", "sum"))
        .reset_index()
    )
    shelter_counts = pd.DataFrame(shelters).groupby("sido").size().rename("shelters") if shelters else pd.Series(dtype=int, name="shelters")
    region = region.merge(shelter_counts, how="left", left_on="sido", right_index=True).fillna({"shelters": 0})
    region["shelters"] = region["shelters"].astype(int)

    facilities = [Facility("지진해일대피소", s["name"], s["lat"], s["lon"]) for s in shelters]
    rows = []
    for s in spots:
        nearest = nearest_facility(s["lat"], s["lon"], facilities)
        rows.append({
            "name": s["name"], "sido": s["sido"], "lat": s["lat"], "lon": s["lon"],
            "nearest_shelter": nearest.facility.name if nearest else None,
            "nearest_shelter_km": nearest.distance_km if nearest else None,
        })
    return {"region_indicators": region, "spot_nearest_shelter": pd.DataFrame(rows)}


def write_gold(tables: dict[str, pd.DataFrame]) -> dict[str, Path]:
    GOLD_DIR.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, df in tables.items():
        path = GOLD_DIR / f"{name}.parquet"
        df.to_parquet(path, index=False)
        paths[name] = path
    return paths


def fetch_weather_for_spots(spots: list[dict], *, now: datetime) -> tuple[list[dict], list[str]]:
    """관광지마다 단기예보를 받는다. 실패한 관광지는 오류 메시지만 모은다(호출 로그에도 남는다)."""
    base_date, base_time = latest_short_base(now)
    records, errors = [], []
    for spot in spots:
        nx, ny = latlon_to_grid(spot["lat"], spot["lon"])
        try:
            data = datagokr_client.fetch(DATASETS["kma_short_forecast"], num_of_rows=1000,
                                         base_date=base_date, base_time=base_time, nx=nx, ny=ny)
            records.extend(clean_short_forecast(_items(data), spot))
        except Exception as e:  # noqa: BLE001 — 관광지 하나가 실패해도 다음 관광지는 계속 받는다
            errors.append(f"{spot['name']}: {e}")
    return records, errors
