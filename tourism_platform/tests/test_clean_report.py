from tourism_platform.lake import clean_report, pipeline

ITEMS = [
    {"trrsrtNm": "가", "latitude": "37.5", "longitude": "127.0", "rdnmadr": "강원도 강릉시 해안로 1", "aceptncCo": "100", "prkplceCo": "10"},
    {"trrsrtNm": "가", "latitude": "37.5", "longitude": "127.0", "rdnmadr": "강원도 강릉시 해안로 1", "aceptncCo": "100", "prkplceCo": "10"},  # 중복
    {"trrsrtNm": "나", "latitude": "", "longitude": "", "rdnmadr": "강원도 속초시 1"},  # 좌표 없음
    {"trrsrtNm": "다", "latitude": "35.1", "longitude": "129.0", "rdnmadr": "부산광역시 해운대구 1", "aceptncCo": "", "prkplceCo": "5"},
    {"trrsrtNm": "라", "latitude": "36.0", "longitude": "128.0", "rdnmadr": "경북 안동시 1", "aceptncCo": "100000", "prkplceCo": "5"},
]


def test_rule_table_counts_match_cleaning_stats():
    spots, stats = pipeline.clean_tourspots(ITEMS)
    table = clean_report.rule_table(stats).set_index("규칙")["건수"]
    assert table["입력"] == 5 and table["좌표 없음·국내 범위 밖"] == 1 and table["이름+좌표 중복"] == 1
    assert table["정제 결과"] == len(spots) == 3
    assert clean_report.stats_are_consistent(stats)


def test_inconsistent_stats_are_detected():
    assert not clean_report.stats_are_consistent({"input": 5, "bad_coords": 1, "output": 5})


def test_missing_table_counts_empty_and_none_values():
    spots, _ = pipeline.clean_tourspots(ITEMS)
    table = clean_report.missing_table(spots, ["capacity", "parking", "nonexistent"]).set_index("칸")
    assert table.loc["capacity", "빈 건수"] == 1  # '다'의 수용인원이 비어 있다
    assert table.loc["parking", "빈 건수"] == 0
    assert table.loc["nonexistent", "빈 건수"] == 3


def test_outlier_table_flags_value_above_iqr_fence():
    records = [{"capacity": v} for v in [100, 110, 120, 130, 140, 100000]]
    row = clean_report.outlier_table(records, "capacity").iloc[0]
    assert row["상한 초과"] == 1


def test_report_without_raw_data_says_how_to_get_it(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "RAW_DIR", tmp_path)
    assert "raw 데이터가 없습니다" in clean_report.report()
