import pytest

from tourism_platform.data.region_codes import resolve_region_code


def test_resolves_same_name_in_different_sido():
    seoul_jung = resolve_region_code("서울특별시", "중구")
    daejeon_jung = resolve_region_code("대전광역시", "중구")
    assert seoul_jung.code != daejeon_jung.code


def test_unknown_region_raises_key_error():
    with pytest.raises(KeyError):
        resolve_region_code("없는시도", "없는구")
