from tourism_platform.data.cleaning import (
    dedupe_nearby_facilities,
    filter_out_of_bounds_coords,
    flag_low_registration_regions,
)


def test_filter_out_of_bounds_coords_fixes_swapped_lat_lon():
    records = [{"lat": 127.0, "lon": 37.5}]  # 위경도가 뒤바뀜
    cleaned = filter_out_of_bounds_coords(records)
    assert cleaned[0]["lat"] == 37.5
    assert cleaned[0]["lon"] == 127.0


def test_filter_out_of_bounds_coords_drops_impossible_values():
    records = [{"lat": 0.0, "lon": 0.0}]
    assert filter_out_of_bounds_coords(records) == []


def test_dedupe_nearby_facilities_keeps_one_within_radius():
    records = [
        {"lat": 37.5665, "lon": 126.9780},
        {"lat": 37.56651, "lon": 126.97801},  # 몇 미터 이내 중복
        {"lat": 35.1796, "lon": 129.0756},  # 완전히 다른 위치
    ]
    result = dedupe_nearby_facilities(records, radius_m=10)
    assert len(result) == 2


def test_flag_low_registration_regions_marks_missing():
    # 4개 지역 중 1개만 결측(25% < 1/3 기준)이면 승격 없이 missing으로 남는다.
    rates = {"A": 1.0, "B": 0.1, "C": 0.9, "D": 1.1}
    status = flag_low_registration_regions(rates, low_threshold_ratio=0.3)
    assert status["A"] == "ok"
    assert status["B"] == "missing"


def test_flag_low_registration_regions_promotes_to_unassessable():
    rates = {"A": 0.1, "B": 0.1, "C": 1.0}
    status = flag_low_registration_regions(rates, low_threshold_ratio=0.3, missing_fraction_limit=1 / 3)
    assert status["A"] == "평가 불가"
    assert status["B"] == "평가 불가"
    assert status["C"] == "ok"
