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
