"""TourLink 일행 맞춤(무장애) 모듈 (11주차).

성·연령 대신 '누구와 가는가'(어르신·아이·휠체어·유아차)로 관광지를 고르기 위해
한국관광공사 무장애 여행정보(KorWithService2)를 씁니다. api.py에는 두 줄만 추가합니다.

    from barrierfree import ACCESS_ROUTES     # 맨 위 import 아래
    API_ROUTES.update(ACCESS_ROUTES)          # API_ROUTES.update(WEATHER_ROUTES) 아래

쓰는 API (공공데이터포털 활용신청 필요, 서비스키는 api.py와 같은 API_KEY):
  한국관광공사_무장애 여행 정보  KorWithService2
    - locationBasedList2 : 위치 주변 무장애 관광정보 목록
    - detailWithTour2    : 관광지 하나의 무장애 편의 정보(휠체어·엘리베이터·화장실·유아차 등)

혼자 점검할 때:  py barrierfree.py check                     (청주 기준)
                 py barrierfree.py check 37.75 128.90        (위도 경도)
결과 보기:       py barrierfree.py 36.64 127.49 senior,child
웹으로 보기:     py barrierfree.py local                     (내 PC 서버를 켜고 /access 페이지 열기)
"""
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_KEY = os.environ.get("API_KEY", "")
BASE_URL = "https://apis.data.go.kr/B551011/KorWithService2"
MOBILE_APP = "TourLink"
CACHE_SECONDS = 6 * 60 * 60     # 편의시설 정보는 자주 바뀌지 않아 6시간 둡니다
NEARBY_RADIUS_M = 5000
DETAIL_LIMIT = 10                # 상세(무장애 정보)는 가까운 순 10곳만 불러 호출 한도를 아낍니다

# detailWithTour2 응답 항목 → 화면에 보여줄 이름
FIELDS = {
    # 이동이 불편한 분(어르신·휠체어)
    "parking": "장애인 주차",
    "route": "접근로",
    "publictransport": "대중교통",
    "ticketoffice": "매표소",
    "promotion": "홍보물",
    "room": "객실",
    "wheelchair": "휠체어 대여·이용",
    "exit": "출입 통로",
    "elevator": "엘리베이터",
    "restroom": "장애인 화장실",
    "auditorium": "관람석",
    "handicapetc": "지체장애 기타",
    # 시각
    "braileblock": "점자 블록",
    "helpdog": "보조견 동반",
    "guidehuman": "안내 요원",
    "audioguide": "오디오 가이드",
    "bigprint": "큰 활자 안내",
    "brailepromotion": "점자 홍보물",
    "guidesystem": "유도 안내 설비",
    "blindhandicapetc": "시각장애 기타",
    # 청각
    "signguide": "수어 안내",
    "videoguide": "자막 영상",
    "hearingroom": "객실(청각)",
    "hearinghandicapetc": "청각장애 기타",
    # 영유아 가족
    "stroller": "유아차 대여·이용",
    "lactationroom": "수유실",
    "babysparechair": "유아용 의자",
    "infantsfamilyetc": "영유아 가족 기타",
}

# 일행 구성마다 중요하게 보는 항목 (근거: 이동·돌봄에 직접 필요한 시설)
NEEDS = {
    "senior": ("parking", "elevator", "restroom", "route", "wheelchair"),
    "child": ("stroller", "lactationroom", "babysparechair", "restroom"),
    "wheelchair": ("wheelchair", "exit", "elevator", "restroom", "parking", "route"),
    "stroller": ("stroller", "exit", "elevator", "lactationroom"),
}
NEED_LABEL = {"senior": "어르신", "child": "아이", "wheelchair": "휠체어", "stroller": "유아차"}
ALIASES = {"어르신": "senior", "노약자": "senior", "아이": "child", "유아": "child",
           "휠체어": "wheelchair", "유아차": "stroller", "유모차": "stroller"}

_cache = {}
_cache_lock = threading.Lock()
_store = None   # api.py가 use_cache()로 넣어 주는 캐시 함수(메모리 + MongoDB)


def use_cache(store):
    """api.py에서 store(name, loader)를 넣어 주면 결과를 MongoDB(tourlink DB)에도 저장합니다.

    순환 import를 피하려고 이 모듈은 api.py를 import하지 않습니다. 넣어 주지 않으면
    (py barrierfree.py check 등) 아래 메모리 캐시만 씁니다.
    """
    global _store
    _store = store


def _cached(key, loader):
    """저장 이름은 access_ + 요청 값(위치·반경 또는 콘텐츠 ID)입니다."""
    if _store is not None:
        return _store(f"access_{key}", loader)
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.time() - entry[1] < CACHE_SECONDS:
            return entry[0]
    value = loader()
    with _cache_lock:
        _cache[key] = (value, time.time())
    return value


def _call(operation, params):
    """KorWithService2를 호출해 item 목록을 돌려줍니다(api.py의 TourAPI 호출과 같은 방식)."""
    if not API_KEY.strip():
        raise ValueError("환경변수 API_KEY에 공공데이터포털 인증키(Decoding)를 넣어 주세요.")
    query = urlencode({"serviceKey": API_KEY.strip(), "MobileOS": "ETC", "MobileApp": MOBILE_APP,
                       "_type": "json", **params})
    request = Request(f"{BASE_URL}/{operation}?{query}", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            text = response.read().decode("utf-8")
    except HTTPError as error:
        raise RuntimeError(f"무장애 여행정보 {operation} API가 HTTP {error.code}을(를) 반환했습니다.") from error
    except URLError as error:
        raise RuntimeError(f"무장애 여행정보 API 연결에 실패했습니다: {error}") from error
    if text.lstrip().startswith("<"):
        raise RuntimeError(f"무장애 여행정보 {operation} API 오류: {text[:200]}")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError("무장애 여행정보 API 응답을 JSON으로 해석하지 못했습니다.") from error
    response = payload.get("response") or {}
    header = response.get("header") or payload
    code = str(header.get("resultCode", ""))
    if code not in ("0000", "00"):
        raise RuntimeError(f"무장애 여행정보 {operation} API 오류 {code}: {header.get('resultMsg', '응답 메시지 없음')}")
    body = response.get("body") or {}
    items = body.get("items") or {}
    items = items.get("item", []) if isinstance(items, dict) else []
    return items if isinstance(items, list) else [items]


def parse_needs(text):
    """'senior,child' 또는 '어르신,아이' → ['senior', 'child']"""
    result = []
    for word in (text or "").replace(" ", "").split(","):
        key = ALIASES.get(word, word)
        if key in NEEDS and key not in result:
            result.append(key)
    return result


def _clean(value):
    return " ".join(str(value or "").split())


def fetch_access(content_id):
    """관광지 하나의 무장애 편의 정보. 값이 있는 항목만 돌려줍니다."""
    if not str(content_id).isdigit():
        raise ValueError("콘텐츠 ID(contentId)는 숫자여야 합니다.")
    items = _cached(f"detail_{content_id}", lambda: _call("detailWithTour2", {"contentId": content_id}))
    raw = items[0] if items else {}
    available = {key: _clean(raw.get(key)) for key in FIELDS if _clean(raw.get(key))}
    return {"contentId": str(content_id), "available": available,
            "labels": {key: FIELDS[key] for key in available}}


def access_score(available, needs):
    """일행에게 필요한 항목 중 정보가 있는 비율(0~100). 일행 조건이 없으면 None."""
    keys = sorted({k for need in needs for k in NEEDS[need]})
    if not keys:
        return None, [], []
    have = [k for k in keys if k in available]
    missing = [k for k in keys if k not in available]
    return round(100 * len(have) / len(keys)), [FIELDS[k] for k in have], [FIELDS[k] for k in missing]


def fetch_nearby_access(lat, lon, needs_text="", radius=NEARBY_RADIUS_M):
    """위치 주변 무장애 관광정보를 가까운 순으로 찾고, 일행 조건에 맞는 정도를 붙입니다."""
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        raise ValueError("위도(lat)·경도(lon)가 필요합니다.") from None
    if not (33 <= lat <= 39 and 124 <= lon <= 132):
        raise ValueError("국내 위치의 위도·경도가 필요합니다.")
    radius = int(radius or NEARBY_RADIUS_M)
    if not 100 <= radius <= 20000:
        raise ValueError("반경(radius)은 100~20000m 사이여야 합니다.")
    needs = parse_needs(needs_text)

    places = _cached(f"nearby_{lat:.3f}_{lon:.3f}_{radius}", lambda: _call(
        "locationBasedList2",
        {"mapX": f"{lon:.6f}", "mapY": f"{lat:.6f}", "radius": radius, "arrange": "E",
         "numOfRows": 30, "pageNo": 1}))
    places = places[:DETAIL_LIMIT]

    errors = {}

    def detail(place):
        try:
            return fetch_access(place.get("contentid"))
        except (RuntimeError, ValueError) as error:   # 한 곳이 실패해도 나머지는 보여줍니다
            errors[str(place.get("contentid"))] = str(error)
            return {"available": {}, "labels": {}}

    with ThreadPoolExecutor(max_workers=5) as pool:
        details = list(pool.map(detail, places))

    result = []
    for place, info in zip(places, details):
        score, have, missing = access_score(info["available"], needs)
        result.append({
            "contentId": str(place.get("contentid", "")),
            "contentTypeId": str(place.get("contenttypeid", "")),
            "title": place.get("title", ""),
            "address": _clean(f"{place.get('addr1', '')} {place.get('addr2', '')}"),
            "distanceKm": round(float(place.get("dist") or 0) / 1000, 2),
            "lat": _float(place.get("mapy")),
            "lon": _float(place.get("mapx")),
            "image": place.get("firstimage", ""),
            "facilities": list(info["labels"].values()),
            "fitScore": score,          # 일행에게 필요한 시설 정보가 있는 비율(%)
            "fitHave": have,
            "fitMissing": missing,
        })
    if needs:
        # 맞는 정도가 높은 곳을 먼저, 같으면 가까운 곳을 먼저 보여줍니다.
        result.sort(key=lambda p: (-(p["fitScore"] or 0), p["distanceKm"]))
    return {"needs": [NEED_LABEL[n] for n in needs], "radiusM": radius, "places": result, "errors": errors,
            "note": "편의시설은 관광공사에 등록된 정보 기준입니다. 방문 전 시설에 확인하세요."}


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# 웹앱 샘플 관광지 좌표는 실제 위치와 수 km 다를 수 있습니다(청남대 약 8km). 그래서 좌표 주변이 아니라
# 이름으로 찾고, 같은 이름의 다른 지역 장소를 피하려고 좌표에서 이 거리 안인 곳만 받습니다.
MATCH_RADIUS_M = 20000
MATCH_EXTRA_CHARS = 4   # 이름 일부 일치는 글자 수 차이가 이 이하일 때만(예: '천안 독립기념관')
_NAME_NOISE = re.compile(r"[\s()\[\]{}·,.\-_/]")


def _norm_name(text):
    return _NAME_NOISE.sub("", str(text or ""))


def _name_rank(target, title):
    """2: 같은 이름, 1: 한쪽이 다른 쪽을 포함하고 글자 수 차이가 작음, 0: 다른 곳"""
    if not title:
        return 0
    if title == target:
        return 2
    longer, shorter = (title, target) if len(title) > len(target) else (target, title)
    if len(shorter) >= 3 and shorter in longer and len(longer) - len(shorter) <= MATCH_EXTRA_CHARS:
        return 1
    return 0


def _distance_m(lat1, lon1, lat2, lon2):
    import math
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(a))


def fetch_access_match(lat, lon, name, needs_text=""):
    """웹앱 추천 관광지(이름·좌표)와 같은 곳을 무장애 여행정보에서 찾아 무장애 정보를 붙입니다.

    웹앱 관광지에는 관광공사 콘텐츠 ID가 없어서 이름으로 검색(searchKeyword2)하고,
    좌표에서 20km 안에 있는 곳 중 이름이 같은 곳(없으면 이름 일부가 같은 곳)을 가까운 순으로 고릅니다.
    못 찾으면 matched=False이고, 이는 '시설이 없다'가 아니라 '관광공사 무장애 정보에 등록되지 않았다'는 뜻입니다.
    """
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        raise ValueError("위도(lat)·경도(lon)가 필요합니다.") from None
    if not (33 <= lat <= 39 and 124 <= lon <= 132):
        raise ValueError("국내 위치의 위도·경도가 필요합니다.")
    target = _norm_name(name)
    if len(target) < 2:
        raise ValueError("관광지 이름(name)이 필요합니다.")
    needs = parse_needs(needs_text)

    places = _cached(f"search_{target}", lambda: _call(
        "searchKeyword2", {"keyword": str(name).strip(), "numOfRows": 30, "pageNo": 1, "arrange": "A"}))
    candidates = []
    for place in places:
        rank = _name_rank(target, _norm_name(place.get("title")))
        plat, plon = _float(place.get("mapy")), _float(place.get("mapx"))
        if not rank or plat is None or plon is None:
            continue
        dist = _distance_m(lat, lon, plat, plon)
        if dist <= MATCH_RADIUS_M:
            candidates.append((-rank, dist, place))
    base = {"name": name, "needs": [NEED_LABEL[n] for n in needs], "radiusM": MATCH_RADIUS_M,
            "note": "편의시설은 관광공사에 등록된 정보 기준입니다. 방문 전 시설에 확인하세요."}
    if not candidates:
        return {**base, "matched": False}
    neg_rank, dist, place = min(candidates, key=lambda c: (c[0], c[1]))
    info = fetch_access(place.get("contentid"))
    score, have, missing = access_score(info["available"], needs)
    return {**base, "matched": True, "matchedBy": "같은 이름" if neg_rank == -2 else "이름 일부",
            "contentId": str(place.get("contentid", "")), "title": place.get("title", ""),
            "address": _clean(f"{place.get('addr1', '')} {place.get('addr2', '')}"),
            "distanceKm": round(dist / 1000, 2),
            "available": info["available"], "labels": info["labels"],
            "fitScore": score, "fitHave": have, "fitMissing": missing}


ACCESS_ROUTES = {
    "/api/access/nearby": lambda param: fetch_nearby_access(
        param("lat"), param("lon"), param("with"), param("radius") or NEARBY_RADIUS_M),
    "/api/access/detail": lambda param: fetch_access(param("contentId")),
    "/api/access/match": lambda param: fetch_access_match(
        param("lat"), param("lon"), param("name"), param("with")),
}


def check(lat=36.6424, lon=127.4890):
    print(f"무장애 여행정보(KorWithService2) 점검, 위치 ({lat}, {lon}), 반경 {NEARBY_RADIUS_M}m\n")
    try:
        places = _call("locationBasedList2", {"mapX": f"{lon:.6f}", "mapY": f"{lat:.6f}",
                                              "radius": NEARBY_RADIUS_M, "arrange": "E", "numOfRows": 5, "pageNo": 1})
        print(f"[OK]   locationBasedList2: 주변 {len(places)}곳 (예: {places[0].get('title') if places else '없음'})")
    except (RuntimeError, ValueError) as error:
        print(f"[실패] locationBasedList2: {error}")
        return
    if not places:
        print("주변에 등록된 곳이 없습니다. 다른 위치로 다시 점검하세요.")
        return
    try:
        raw = _call("detailWithTour2", {"contentId": places[0].get("contentid")})
        keys = sorted(k for k, v in (raw[0] if raw else {}).items() if _clean(v))
        known = [k for k in keys if k in FIELDS]
        unknown = [k for k in keys if k not in FIELDS and k not in ("contentid",)]
        print(f"[OK]   detailWithTour2: 값이 있는 항목 {len(known)}개 {known}")
        if unknown:
            print(f"       FIELDS에 없는 응답 항목(확인 필요): {unknown}")
    except (RuntimeError, ValueError) as error:
        print(f"[실패] detailWithTour2: {error}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["check"]:
        rest = args[1:]
        check(float(rest[0]), float(rest[1])) if len(rest) == 2 else check()
    elif args[:1] == ["local"]:
        # 웹 서버는 api.py 것을 그대로 씁니다. 무장애 페이지(/access)를 바로 엽니다.
        import api
        api.run_web_app("/access")
    elif len(args) >= 2:
        print(json.dumps(fetch_nearby_access(args[0], args[1], args[2] if len(args) > 2 else ""),
                         ensure_ascii=False, indent=2))
    else:
        print(__doc__)
