"""data/raw/ 원본 → data/processed/ 정제 테이블 + 품질 점검 보고서.

    python scripts/build_processed.py --collect --crime-year 2024

--collect 를 주면 .env 의 인증키로 관광정보·방문자수 API 를 먼저 호출한다.
필요한 원본 파일과 받는 곳은 docs/real_data_guide.md 참고.
"""
import argparse
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tourrec import config as C  # noqa: E402
from tourrec import indicators as I  # noqa: E402
from tourrec import loaders as L  # noqa: E402

RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
FILES = {
    "population": "population.csv", "crime": "crime_region.csv", "hotspot": "accident_hotspot.csv",
    "asos_daily": "asos_daily.csv", "asos_station": "asos_stations.csv", "age_mix": "age_mix.csv",
    "safety_index": "safety_index.csv", "attraction": "attraction.csv", "visitor": "visitor_monthly.csv",
}
REQUIRED = ["population", "crime", "hotspot", "asos_daily", "asos_station", "age_mix", "attraction", "visitor"]


def collect_api():
    from tourrec import collect
    attr = pd.concat([collect.collect_attractions(ct) for ct in C.CANDIDATE_CONTENT_TYPES], ignore_index=True)
    attr.to_csv(RAW / FILES["attraction"], index=False, encoding="utf-8-sig")
    end = date.today().replace(day=1) - pd.Timedelta(days=1)
    start = (pd.Timestamp(end) - pd.DateOffset(months=11)).replace(day=1)
    vis = pd.concat([collect.collect_visitors(m.strftime("%Y%m%d"), (m + pd.offsets.MonthEnd(0)).strftime("%Y%m%d"))
                     for m in pd.date_range(start, end, freq="MS")], ignore_index=True)
    vis.to_csv(RAW / FILES["visitor"], index=False, encoding="utf-8-sig")
    print(f"API 수집: 관광지 {len(attr)}건, 방문자 {len(vis)}행")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--collect", action="store_true", help="관광정보·방문자수 API 를 먼저 호출")
    ap.add_argument("--crime-year", type=int, required=True, help="범죄 통계 기준 연도")
    args = ap.parse_args(argv)

    if args.collect:
        collect_api()
    missing = [FILES[k] for k in REQUIRED if not (RAW / FILES[k]).exists()]
    if missing:
        sys.exit("data/raw/ 에 없는 파일: " + ", ".join(missing) + "\n받는 곳: docs/real_data_guide.md")

    report = []
    sgg = L.load_population(RAW / FILES["population"])
    reg = L.RegionIndex(sgg)
    report.append(f"[시군구] 분석 단위 {len(sgg)}개 (일반구는 상위 시로 통합)")

    crime, un_c = L.load_crime(RAW / FILES["crime"], reg, args.crime_year)
    report.append(f"[범죄] 결합 시군구 {crime['sgg_code'].nunique()}/{len(sgg)} · 미매칭 명칭 {len(un_c)}개 {un_c[:15]}")

    hs, un_h = L.load_hotspots(RAW / FILES["hotspot"], reg)
    report.append(f"[사고다발] {len(hs)}곳 (연도 {int(hs['year'].max()) if len(hs) else '-'}) · "
                  f"좌표 범위 밖 {(~L.in_korea(hs['lat'], hs['lon'])).sum()}곳 · 미매칭 {len(un_h)}개 {un_h[:10]}")
    hs = hs[L.in_korea(hs["lat"], hs["lon"])]

    daily, station = L.load_asos(RAW / FILES["asos_daily"], RAW / FILES["asos_station"])
    clim = I.climatology_from_daily(daily)
    report.append(f"[기상] 관측소 {len(station)}곳 · 일자료 {len(daily):,}행 · "
                  f"기간 {str(daily['date'].min())[:10]}~{str(daily['date'].max())[:10]}")

    age, un_a = L.load_age_mix(RAW / FILES["age_mix"], reg)
    report.append(f"[연령 비중] 시군구 {age['sgg_code'].nunique()}/{len(sgg)} · 미매칭 {len(un_a)}개 {un_a[:10]}")

    attr = L.unify_codes(L.read_csv_any(RAW / FILES["attraction"], dtype={"content_id": str, "sgg_code": str}))
    n0 = len(attr)
    bad = attr["lat"].isna() | ~L.in_korea(attr["lat"], attr["lon"])
    nomatch = ~attr["sgg_code"].isin(sgg["sgg_code"])
    dup = attr["content_id"].duplicated()
    report.append(f"[관광지] {n0}건 · 좌표 결측·범위 밖 {bad.sum()} ({bad.mean()*100:.1f}%) · "
                  f"시군구 미매칭 {nomatch.sum()} · 중복 ID {dup.sum()}")
    attr = attr[~bad & ~nomatch & ~dup]

    vis = L.unify_codes(L.read_csv_any(RAW / FILES["visitor"], dtype={"sgg_code": str}))
    vis = vis.groupby(["sgg_code", "ym", "visitor_div"], as_index=False)["visitors"].sum()
    report.append(f"[방문자] 시군구 {vis['sgg_code'].nunique()}/{len(sgg)} · 기간 {vis['ym'].min()}~{vis['ym'].max()}")

    tables = dict(sgg=sgg, crime_sgg=crime, accident_hotspot=hs, station=station, weather_climate=clim,
                  age_mix=age, attraction=attr, visitor_monthly=vis)
    if (RAW / FILES["safety_index"]).exists():
        tables["safety_index"] = L.load_safety_index(RAW / FILES["safety_index"], reg)
        report.append(f"[지역안전지수] {len(tables['safety_index'])}행 (검증 전용)")

    OUT.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        df.to_csv(OUT / f"{name}.csv", index=False, encoding="utf-8-sig")
    text = "\n".join(report)
    (OUT / "_quality_report.txt").write_text(text, encoding="utf-8")
    print(text)
    print(f"\n저장 → {OUT}  (대시보드와 scripts/recommend.py 가 이제 실제 데이터를 씁니다)")


if __name__ == "__main__":
    main()
