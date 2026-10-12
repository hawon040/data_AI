import pytest

from tourism_platform.data.datagokr_client import (
    DatasetConfig,
    DatasetNotConfiguredError,
    ServiceKeyMissingError,
    fetch,
)


def test_unconfigured_dataset_raises_before_any_network_call():
    config = DatasetConfig(name="테스트셋", portal_url="https://www.data.go.kr")
    with pytest.raises(DatasetNotConfiguredError):
        fetch(config)


def test_missing_service_key_raises(monkeypatch):
    monkeypatch.delenv("DATA_GO_KR_SERVICE_KEY", raising=False)
    config = DatasetConfig(
        name="테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://apis.data.go.kr/test",
        operation="getTest",
    )
    with pytest.raises(ServiceKeyMissingError):
        fetch(config)


def test_successful_fetch_returns_json(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")
    config = DatasetConfig(
        name="테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://apis.data.go.kr/test",
        operation="getTest",
    )

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"response": {"header": {"resultCode": "00"}, "body": {"items": [1, 2, 3]}}}

    def fake_get(url, params, timeout):
        assert url == "https://apis.data.go.kr/test/getTest"
        assert params["serviceKey"] == "dummy-key"
        return FakeResponse()

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", fake_get)

    data = fetch(config)
    assert data["response"]["body"]["items"] == [1, 2, 3]


def test_odcloud_style_uses_page_perpage_and_flat_response(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")
    config = DatasetConfig(
        name="odcloud 테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://api.odcloud.kr/api",
        operation="3074462/v1/uddi:test-uuid",
        api_style="odcloud",
    )

    def fake_get(url, params, timeout):
        assert url == "https://api.odcloud.kr/api/3074462/v1/uddi:test-uuid"
        assert params["page"] == 1
        assert params["perPage"] == 100
        assert "pageNo" not in params and "type" not in params

        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"page": 1, "perPage": 100, "totalCount": 2, "data": [{"a": 1}, {"a": 2}]}

        return FakeResponse()

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", fake_get)

    data = fetch(config)
    assert data["totalCount"] == 2
    assert len(data["data"]) == 2


def test_empty_operation_means_endpoint_is_already_complete(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")
    config = DatasetConfig(
        name="표준데이터 테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://api.data.go.kr/openapi/tn_pubr_public_test_api",
        operation="",
    )

    def fake_get(url, params, timeout):
        assert url == "https://api.data.go.kr/openapi/tn_pubr_public_test_api"
        return _FakeOkResponse()

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", fake_get)
    fetch(config)


class _FakeOkResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {"response": {"header": {"resultCode": "00"}, "body": {}}}


def test_api_error_result_code_raises(monkeypatch):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")
    config = DatasetConfig(
        name="테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://apis.data.go.kr/test",
        operation="getTest",
    )

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"response": {"header": {"resultCode": "30", "resultMsg": "SERVICE KEY IS NOT REGISTERED"}}}

    monkeypatch.setattr(
        "tourism_platform.data.datagokr_client.requests.get",
        lambda url, params, timeout: FakeResponse(),
    )

    with pytest.raises(RuntimeError, match="SERVICE KEY IS NOT REGISTERED"):
        fetch(config)
