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
"""
import json
import os
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


def _cached(key, loader):
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
    items = _cached(f"with_{content_id}", lambda: _call("detailWithTour2", {"contentId": content_id}))
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

    places = _cached(f"near_{lat:.3f}_{lon:.3f}_{radius}", lambda: _call(
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


ACCESS_ROUTES = {
    "/api/access/nearby": lambda param: fetch_nearby_access(
        param("lat"), param("lon"), param("with"), param("radius") or NEARBY_RADIUS_M),
    "/api/access/detail": lambda param: fetch_access(param("contentId")),
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
    elif len(args) >= 2:
        print(json.dumps(fetch_nearby_access(args[0], args[1], args[2] if len(args) > 2 else ""),
                         ensure_ascii=False, indent=2))
    else:
        print(__doc__)
