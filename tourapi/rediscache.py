"""Redis 공유 캐시.

서버리스(Vercel)는 요청마다 다른 인스턴스가 뜰 수 있어 메모리 캐시를 서로 나눠 쓰지 못한다.
같은 시군구 날씨를 인스턴스마다 기상청에 다시 묻는 일을 막으려고, 인스턴스들이 함께 보는 캐시를 둔다.

조회 순서 (api.py _cached): 메모리 → Redis → MongoDB → 공공데이터 API

- 키: tourlink:<이름>  (이름에 격자·발표 시각이 들어 있어 같은 예보는 같은 키를 쓴다. 예: weather_vilage_91_74_202611071100)
- 값: {"v": 값, "t": 저장 시각(초)}를 JSON으로 저장한다.
- 만료(TTL): 호출하는 쪽이 정한다. 날씨 1시간, 무장애 6시간, 목록 24시간. 만료되면 Redis가 스스로 지운다.
- 동시 갱신 방지: 캐시가 비는 순간 여러 인스턴스가 한꺼번에 API를 부르면 호출 한도를 낭비한다(캐시 스탬피드).
  먼저 온 한 곳만 잠금(SET NX EX)을 잡고 API를 부르고, 나머지는 그 결과가 Redis에 들어올 때까지 잠깐 기다린다.
  잠금에도 만료(EX)를 두어, 잡은 쪽이 죽어도 영원히 막히지 않는다.
- 환경변수 REDIS_URL(예: redis://127.0.0.1:6379/0)이 없거나 연결이 안 되면 Redis 없이 그대로 동작한다.
  연결에 실패하면 1분 동안 다시 시도하지 않아 응답이 느려지지 않는다.
"""
import json
import os
import threading
import time
import uuid

KEY_PREFIX = "tourlink:"
LOCK_SECONDS = 20
WAIT_SECONDS = 3
WAIT_STEP = 0.1

_state = {"client": None, "checked_at": 0.0}
_state_lock = threading.Lock()

# 잠금을 잡은 쪽만 지우도록 값을 비교한 뒤 삭제한다(만료된 남의 잠금을 지우지 않게).
_RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"


def client():
    """연결된 Redis 클라이언트. 설정이 없거나 연결할 수 없으면 None."""
    url = os.environ.get("REDIS_URL", "")
    if not url:
        return None
    with _state_lock:
        if _state["client"] is not None:
            return _state["client"]
        if time.time() - _state["checked_at"] < 60:
            return None
        _state["checked_at"] = time.time()
        try:
            import redis
            conn = redis.Redis.from_url(url, socket_connect_timeout=1.5, socket_timeout=1.5)
            conn.ping()
        except Exception as error:  # redis 미설치, 서버 꺼짐, 인증 실패 모두 Redis 없이 동작
            print(f"[Redis] 연결하지 못해 Redis 없이 동작합니다: {error}")
            return None
        _state["client"] = conn
        print("[Redis] 연결했습니다.")
        return conn


def reset():
    """연결 상태를 처음으로 되돌린다(테스트용)."""
    with _state_lock:
        _state["client"] = None
        _state["checked_at"] = 0.0


def get(name):
    """(값, 저장 시각)을 돌려준다. 없거나 Redis를 쓸 수 없으면 None."""
    conn = client()
    if conn is None:
        return None
    try:
        raw = conn.get(KEY_PREFIX + name)
        if raw is None:
            return None
        envelope = json.loads(raw)
        return envelope["v"], envelope["t"]
    except Exception as error:
        print(f"[Redis] {name} 읽기 실패: {error}")
        return None


def set(name, value, ttl_seconds):
    """값을 ttl_seconds 동안 저장한다. 실패해도 예외를 내지 않는다."""
    conn = client()
    if conn is None or ttl_seconds <= 0:
        return False
    try:
        payload = json.dumps({"v": value, "t": time.time()}, ensure_ascii=False)
        conn.set(KEY_PREFIX + name, payload, ex=int(ttl_seconds))
        return True
    except Exception as error:  # 직렬화 실패(JSON으로 못 바꾸는 값)나 연결 오류
        print(f"[Redis] {name} 저장 실패: {error}")
        return False


class Lock:
    """한 이름을 한 곳에서만 갱신하게 하는 잠금. enabled가 False면 Redis가 없으니 잠금 없이 진행한다."""

    def __init__(self, name):
        self.key = KEY_PREFIX + "lock:" + name
        self.token = uuid.uuid4().hex
        self.conn = client()
        self.enabled = self.conn is not None
        self.held = False
        if self.enabled:
            try:
                self.held = bool(self.conn.set(self.key, self.token, nx=True, ex=LOCK_SECONDS))
            except Exception as error:
                print(f"[Redis] 잠금 실패: {error}")
                self.enabled = False

    def release(self):
        if self.enabled and self.held:
            try:
                self.conn.eval(_RELEASE_SCRIPT, 1, self.key, self.token)
            except Exception as error:
                print(f"[Redis] 잠금 해제 실패: {error}")
            self.held = False


def wait_for(name, timeout=WAIT_SECONDS):
    """다른 곳이 갱신하는 동안 값이 Redis에 들어오기를 timeout초까지 기다린다. 못 얻으면 None."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        found = get(name)
        if found is not None:
            return found
        time.sleep(WAIT_STEP)
    return None
