import pytest


@pytest.fixture(autouse=True)
def _no_api_log(monkeypatch, tmp_path):
    # 테스트 중 호출은 실제 API 로그(data/logs/api_calls.jsonl)에 섞이지 않게 임시 파일에 쓴다.
    monkeypatch.setenv("TOURLINK_API_LOG", str(tmp_path / "api_calls.jsonl"))
