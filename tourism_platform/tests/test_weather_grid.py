from datetime import datetime

import pytest

from tourism_platform.data.apis.weather import (
    KST,
    grid_to_latlon,
    latest_mid_tmfc,
    latest_short_base,
    latlon_to_grid,
)


def test_origin_maps_to_reference_grid():
    # 격자 정의상 기준점(38N, 126E)은 (43, 136)이다.
    assert latlon_to_grid(38.0, 126.0) == (43, 136)


@pytest.mark.parametrize(
    "lat, lon, expected",
    [
        # 시청 좌표 → 기상청 격자표의 해당 시·구 값
        (37.5665, 126.9780, (60, 127)),  # 서울특별시청 (중구)
        (35.1796, 129.0756, (98, 76)),   # 부산광역시청 (연제구)
        (36.3504, 127.3845, (67, 100)),  # 대전광역시청 (서구)
        (33.4996, 126.5312, (53, 38)),   # 제주시청
    ],
)
def test_known_city_grids(lat, lon, expected):
    assert latlon_to_grid(lat, lon) == expected


@pytest.mark.parametrize("nx, ny", [(43, 136), (60, 127), (98, 76), (53, 38), (1, 1), (149, 253)])
def test_grid_round_trip(nx, ny):
    assert latlon_to_grid(*grid_to_latlon(nx, ny)) == (nx, ny)


def test_nearby_points_share_or_neighbor_grid():
    # 격자 간격이 5km이므로 1km 안쪽 두 점은 많아야 한 칸 차이다.
    a = latlon_to_grid(37.5665, 126.9780)
    b = latlon_to_grid(37.5700, 126.9850)
    assert abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1


@pytest.mark.parametrize(
    "now, expected",
    [
        (datetime(2026, 11, 5, 5, 9, tzinfo=KST), ("20261105", "0200")),   # 05시 발표 10분 전
        (datetime(2026, 11, 5, 5, 10, tzinfo=KST), ("20261105", "0500")),
        (datetime(2026, 11, 5, 23, 59, tzinfo=KST), ("20261105", "2300")),
        (datetime(2026, 11, 5, 1, 0, tzinfo=KST), ("20261104", "2300")),   # 02시 발표 전이면 전날 23시
    ],
)
def test_latest_short_base(now, expected):
    assert latest_short_base(now) == expected


def test_latest_mid_tmfc():
    assert latest_mid_tmfc(datetime(2026, 11, 5, 5, 0, tzinfo=KST)) == "202611041800"
    assert latest_mid_tmfc(datetime(2026, 11, 5, 6, 0, tzinfo=KST)) == "202611050600"
    assert latest_mid_tmfc(datetime(2026, 11, 5, 19, 0, tzinfo=KST)) == "202611051800"
