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


def test_four_digit_success_result_code_is_accepted(monkeypatch):
    """TourAPI DataLabService 공식 매뉴얼 예제가 resultCode="0000"을 성공으로 쓴다."""
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")
    config = DatasetConfig(
        name="테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://apis.data.go.kr/B551011/DataLabService",
        operation="locgoRegnVisitrDDList",
    )

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"response": {"header": {"resultCode": "0000", "resultMsg": "OK"}, "body": {}}}

    monkeypatch.setattr(
        "tourism_platform.data.datagokr_client.requests.get",
        lambda url, params, timeout: FakeResponse(),
    )
    fetch(config)  # raises if "0000" were treated as an error


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


def test_http_error_message_does_not_leak_service_key(monkeypatch):
    import requests

    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "SECRET-KEY-123")
    config = DatasetConfig(
        name="테스트셋",
        portal_url="https://www.data.go.kr",
        endpoint="https://apis.data.go.kr/test",
        operation="getTest",
    )

    class ForbiddenResponse:
        status_code = 403

        def raise_for_status(self):
            raise requests.HTTPError("403 Client Error: Forbidden for url: https://apis.data.go.kr/test/getTest?serviceKey=SECRET-KEY-123")

    monkeypatch.setattr(
        "tourism_platform.data.datagokr_client.requests.get",
        lambda url, params, timeout: ForbiddenResponse(),
    )
    with pytest.raises(RuntimeError) as excinfo:
        fetch(config)
    assert "SECRET-KEY-123" not in str(excinfo.value)
    assert excinfo.value.__cause__ is None and excinfo.value.__suppress_context__
    assert "403" in str(excinfo.value)


def _capture_params(monkeypatch, body):
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "dummy-key")
    seen = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return body

    def fake_get(url, params, timeout):
        seen.update(params)
        return FakeResponse()

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", fake_get)
    return seen


@pytest.mark.parametrize("extra, expected_type", [
    ({}, "json"),
    ({"_type": "json"}, None),
    ({"dataType": "JSON"}, None),
    ({"returnType": "json"}, None),
])
def test_type_param_only_when_no_other_format_param(monkeypatch, extra, expected_type):
    seen = _capture_params(monkeypatch, {"response": {"header": {"resultCode": "00"}}})
    config = DatasetConfig(name="테스트셋", portal_url="https://www.data.go.kr",
                           endpoint="https://apis.data.go.kr/test", operation="getTest", extra_params=extra)
    fetch(config)
    assert seen.get("type") == expected_type


def test_top_level_result_code_error_raises(monkeypatch):
    _capture_params(monkeypatch, {"resultCode": "10", "resultMsg": "INVALID_REQUEST_PARAMETER_ERROR(type)"})
    config = DatasetConfig(name="테스트셋", portal_url="https://www.data.go.kr",
                           endpoint="https://apis.data.go.kr/test", operation="getTest")
    with pytest.raises(RuntimeError, match="INVALID_REQUEST_PARAMETER_ERROR"):
        fetch(config)


def test_api_call_log_records_without_key(monkeypatch, tmp_path):
    import json

    log = tmp_path / "log.jsonl"
    monkeypatch.setenv("TOURLINK_API_LOG", str(log))
    monkeypatch.setenv("DATA_GO_KR_SERVICE_KEY", "SECRET-KEY-123")
    config = DatasetConfig(name="테스트셋", portal_url="https://www.data.go.kr",
                           endpoint="https://apis.data.go.kr/test", operation="getTest")

    class Ok:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"header": {"resultCode": "00"}, "body": {"items": {"item": [{"a": 1}, {"a": 2}]}}}

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", lambda url, params, timeout: Ok())
    data = fetch(config)
    assert data["response"]["body"]["items"]["item"][1] == {"a": 2}  # header/body만 주는 응답도 같은 모양

    class Forbidden:
        status_code = 403

        def raise_for_status(self):
            import requests
            raise requests.HTTPError("403 ... serviceKey=SECRET-KEY-123")

    monkeypatch.setattr("tourism_platform.data.datagokr_client.requests.get", lambda url, params, timeout: Forbidden())
    with pytest.raises(RuntimeError):
        fetch(config)

    text = log.read_text(encoding="utf-8")
    assert "SECRET-KEY-123" not in text
    first, second = [json.loads(line) for line in text.splitlines()]
    assert (first["api"], first["ok"], first["status"], first["rows"]) == ("getTest", True, 200, 2)
    assert (second["ok"], second["status"]) == (False, 403)
    assert first["elapsed_ms"] >= 0
