"""tourapi/rediscache.py와 api.py _cached의 Redis 단계 테스트. 실제 redis-server를 임시 포트로 띄워 TTL·잠금을 확인한다."""
import importlib.util
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

TOURAPI = Path(__file__).resolve().parents[2] / "tourapi"
sys.path.insert(0, str(TOURAPI))
import rediscache  # noqa: E402


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def redis_url():
    pytest.importorskip("redis")
    binary = shutil.which("redis-server")
    if not binary:
        pytest.skip("redis-server가 없어 건너뜀")
    port = _free_port()
    proc = subprocess.Popen([binary, "--port", str(port), "--save", "", "--appendonly", "no"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"redis://127.0.0.1:{port}/0"
    import redis
    for _ in range(50):
        try:
            redis.Redis.from_url(url).ping()
            break
        except Exception:
            time.sleep(0.1)
    else:
        proc.kill()
        pytest.skip("redis-server가 시작되지 않아 건너뜀")
    yield url
    proc.terminate()
    proc.wait(timeout=5)


@pytest.fixture
def use_redis(redis_url, monkeypatch):
    monkeypatch.setenv("REDIS_URL", redis_url)
    rediscache.reset()
    import redis
    redis.Redis.from_url(redis_url).flushall()
    yield
    rediscache.reset()


@pytest.fixture
def api_module(monkeypatch):
    spec = importlib.util.spec_from_file_location("tour_app_test", TOURAPI / "api.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "_mongo_db", lambda: None)  # MongoDB 없이 Redis 단계만 본다
    return module


def test_disabled_without_redis_url(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    rediscache.reset()
    assert rediscache.get("x") is None
    assert rediscache.set("x", {"a": 1}, 60) is False
    lock = rediscache.Lock("x")
    assert lock.enabled is False and lock.held is False


def test_unreachable_redis_falls_back_without_error(monkeypatch):
    monkeypatch.setenv("REDIS_URL", f"redis://127.0.0.1:{_free_port()}/0")
    rediscache.reset()
    assert rediscache.get("x") is None
    assert rediscache.set("x", 1, 60) is False


def test_round_trip_keeps_korean_text_and_saved_time(use_redis):
    before = time.time()
    assert rediscache.set("weather_x", {"지역": "천안시", "pop": 60}, 60)
    value, saved_at = rediscache.get("weather_x")
    assert value == {"지역": "천안시", "pop": 60}
    assert before <= saved_at <= time.time()


def test_value_expires_after_ttl(use_redis):
    rediscache.set("short", [1, 2, 3], 1)
    assert rediscache.get("short") is not None
    time.sleep(1.6)
    assert rediscache.get("short") is None


def test_lock_is_exclusive_and_only_owner_can_release(use_redis):
    first = rediscache.Lock("job")
    second = rediscache.Lock("job")
    assert first.held is True and second.held is False and second.enabled is True
    second.release()  # 잡지 못한 쪽의 해제는 아무 일도 하지 않는다
    assert rediscache.Lock("job").held is False  # 아직 first가 잡고 있다
    first.release()
    assert rediscache.Lock("job").held is True


def test_cached_shares_value_between_instances_so_loader_runs_once(use_redis, api_module):
    calls = []

    def loader():
        calls.append(1)
        return {"pop": 70}

    assert api_module._cached("weather_shared", loader, db_seconds=60, as_value=True) == {"pop": 70}
    api_module._caches.clear()  # 다른 서버리스 인스턴스처럼 메모리 캐시가 비어 있는 상태
    assert api_module._cached("weather_shared", loader, db_seconds=60, as_value=True) == {"pop": 70}
    assert len(calls) == 1


def test_waiting_instance_uses_result_of_the_one_that_holds_the_lock(use_redis, api_module):
    holder = rediscache.Lock("weather_busy")  # 다른 인스턴스가 지금 API를 부르는 중
    assert holder.held
    calls = []

    def finish_other_instance():
        time.sleep(0.4)
        rediscache.set("weather_busy", {"pop": 10}, 60)
        holder.release()

    threading.Thread(target=finish_other_instance).start()
    result = api_module._cached("weather_busy", lambda: calls.append(1) or {"pop": 99}, db_seconds=60, as_value=True)
    assert result == {"pop": 10}  # 기다렸다가 먼저 온 쪽의 결과를 받았다
    assert calls == []  # 자기 쪽 API 호출은 하지 않았다


def test_without_redis_cached_still_calls_loader(monkeypatch, api_module):
    monkeypatch.delenv("REDIS_URL", raising=False)
    rediscache.reset()
    api_module._caches.clear()
    assert api_module._cached("no_redis", lambda: {"ok": True}, db_seconds=60, as_value=True) == {"ok": True}


def test_cache_status_counts_which_stage_answered(use_redis, api_module):
    load = lambda: {"pop": 30}  # noqa: E731
    api_module._cached("weather_stat", load, db_seconds=60, as_value=True)   # 외부 API(loader)
    api_module._cached("weather_stat", load, db_seconds=60, as_value=True)   # 메모리
    api_module._caches.clear()                                              # 다른 인스턴스
    api_module._cached("weather_stat", load, db_seconds=60, as_value=True)   # Redis
    status = api_module.fetch_cache_status(lambda name: "")
    assert status["redis"] == {"configured": True, "connected": True}
    assert status["served"] == {"memory": 1, "redis": 1, "mongo": 0, "api": 1}
    assert status["total"] == 3 and status["cacheHitPct"] == pytest.approx(66.7, abs=0.1)


def test_cache_status_without_redis_url(monkeypatch, api_module):
    monkeypatch.delenv("REDIS_URL", raising=False)
    rediscache.reset()
    status = api_module.fetch_cache_status(lambda name: "")
    assert status["redis"] == {"configured": False, "connected": False}
    assert status["cacheHitPct"] is None  # 아직 요청이 없다
