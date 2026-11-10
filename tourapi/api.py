import copy
import json
import math
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import webbrowser
import xml.etree.ElementTree as ET
import barrierfree
import rediscache
import weather
from weather import WEATHER_ROUTES
from barrierfree import ACCESS_ROUTES
from sigungu import SIGUNGU


# 공공데이터포털(data.go.kr) 일반(Decoding) 인증키. 코드에 쓰지 말고 환경변수 API_KEY로 설정하세요.
# 의료관광, 전국관광지, 반려동물, 관광자원수요에 함께 쓰입니다.
API_KEY = os.environ.get("API_KEY", "")
# 관광지 안전정보(한국문화정보원, api.kcisa.kr) 인증키. 환경변수 KCISA_API_KEY로 설정하세요.
KCISA_API_KEY = os.environ.get("KCISA_API_KEY", "")

SITE_NAME = "TourLink"
PORT = 8000
# Vercel에 배포된 공유용 주소입니다. `python api.py`로 바로 엽니다.
DEPLOY_URL = "https://tourapi-demo.vercel.app"

# 한국관광공사 TourAPI 계열 서비스: (기본 URL, MobileApp 이름, 화면에 보일 이름)
TOUR_SERVICES = {
    "medical": (
        "https://apis.data.go.kr/B551011/MdclTursmService",
        "MedicalTourismApp",
        "의료 관광정보",
    ),
    "pet": (
        "https://apis.data.go.kr/B551011/KorPetTourService2",
        "PetTourApp",
        "반려동물 동반여행",
    ),
    "demand": (
        "https://apis.data.go.kr/B551011/AreaTarResDemService",
        "TourDemandApp",
        "관광 자원 수요",
    ),
}
SAFETY_API_URL = "https://api.kcisa.kr/openapi/service/rest/convergence2018/conver10"
TOURSPOT_API_URL = "https://api.data.go.kr/openapi/tn_pubr_public_trrsrt_api"

PLACE_PAGE_SIZE = 12
TOURSPOT_PAGE_SIZE = 10
CACHE_SECONDS = 60 * 60
# 관광지 안전정보 전체가 1,500여 건이라 한 번에 받습니다.
SAFETY_ALL_ROWS = 3000
NEARBY_COUNT = 5


# ---------------------------------------------------------------------------
# 공통 호출 도우미
# ---------------------------------------------------------------------------

_caches = {}
_cache_locks = {}
_cache_locks_lock = threading.Lock()


# ---------------------------------------------------------------------------
# MongoDB 저장소: 받아 온 공공데이터를 tourlink DB에 남겨 두고 다시 씁니다.
# 목록 데이터는 데이터셋 이름의 컬렉션에 문서 하나씩, 그 밖의 값과 저장 시각은
# _meta 컬렉션에 둡니다. MongoDB가 꺼져 있거나 pymongo가 없으면(예: Vercel)
# 메모리 캐시만 쓰고 그대로 동작합니다.
# ---------------------------------------------------------------------------

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("MONGO_DB", "tourlink")
DB_REFRESH_SECONDS = 24 * 60 * 60

_mongo = {"db": None, "checked_at": 0}
_mongo_lock = threading.Lock()


def _mask_uri(uri):
    """접속 주소에서 아이디·비밀번호를 ***로 바꾸고 호스트만 남깁니다(경로·옵션은 뺍니다).

    예: mongodb+srv://user:pw@cluster0.xxxx.mongodb.net/?retryWrites=true
        → mongodb+srv://***@cluster0.xxxx.mongodb.net
    """
    scheme, sep, rest = (uri or "").partition("://")
    if not sep:
        return "***"
    authority = rest.split("/", 1)[0].split("?", 1)[0]
    _userinfo, at, hosts = authority.rpartition("@")
    return f"{scheme}://***@{hosts}" if at else f"{scheme}://{hosts}"


def _mongo_db():
    """Return the tourlink database, or None when MongoDB is unavailable."""
    with _mongo_lock:
        if _mongo["db"] is not None:
            return _mongo["db"]
        # 연결 실패 후에는 1분 동안 다시 시도하지 않아 응답이 느려지지 않게 합니다.
        if time.time() - _mongo["checked_at"] < 60:
            return None
        _mongo["checked_at"] = time.time()
        try:
            from pymongo import MongoClient
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1500)
            client.admin.command("ping")
        except Exception as error:  # pymongo 미설치, 서버 꺼짐, 인증 실패 모두 메모리 캐시로 대체
            print(f"[MongoDB] 연결하지 못해 메모리 캐시만 사용합니다: {error}")
            return None
        _mongo["db"] = client[MONGO_DB]
        print(f"[MongoDB] {_mask_uri(MONGO_URI)} / {MONGO_DB} 에 연결했습니다.")
        return _mongo["db"]


def _db_load(db, name):
    meta = db["_meta"].find_one({"_id": name})
    if meta is None:
        return None
    if meta.get("kind") == "list":
        value = list(db[name].find({}, {"_id": 0, "_i": 0}).sort("_i", 1))
    else:
        value = meta.get("value")
    return value, meta["savedAt"]


_ttl_index = {"ready": False}


def _db_save(db, name, value, as_value=False, keep_seconds=None):
    """value를 저장합니다. as_value면 목록도 별도 컬렉션 없이 _meta 문서 안에 넣습니다.

    keep_seconds를 주면 expireAt을 붙여, 그 시간이 지난 항목을 MongoDB TTL 인덱스가 지웁니다.
    (요청 값마다 이름이 달라 계속 쌓이는 날씨·무장애 결과용. expireAt이 없는 항목은 지우지 않습니다.)
    """
    if isinstance(value, list) and not as_value:
        collection = db[name]
        collection.delete_many({})
        if value:
            # insert_many가 원본에 _id를 붙이지 않도록 복사해서 넣습니다.
            collection.insert_many([{**item, "_i": index} for index, item in enumerate(value)])
        meta = {"kind": "list", "count": len(value)}
    else:
        meta = {"kind": "value", "value": value}
        if isinstance(value, list):
            meta["count"] = len(value)
    if keep_seconds:
        if not _ttl_index["ready"]:
            db["_meta"].create_index("expireAt", expireAfterSeconds=0)
            _ttl_index["ready"] = True
        meta["expireAt"] = datetime.now(timezone.utc) + timedelta(seconds=keep_seconds)
    db["_meta"].replace_one({"_id": name}, {**meta, "savedAt": time.time()}, upsert=True)


# 캐시가 어느 단계에서 응답했는지 세어 /api/cache/status로 보여 줍니다(이 서버 프로세스 기준).
_cache_stats = {"memory": 0, "redis": 0, "mongo": 0, "api": 0}
_cache_stats_lock = threading.Lock()


def _count(stage):
    with _cache_stats_lock:
        _cache_stats[stage] += 1


def fetch_cache_status(param):
    """GET /api/cache/status — Redis 연결 여부와 단계별 캐시 적중 수."""
    conn = rediscache.client()
    with _cache_stats_lock:
        stats = dict(_cache_stats)
    total = sum(stats.values())
    return {
        "redis": {"configured": bool(os.environ.get("REDIS_URL")), "connected": conn is not None},
        "mongo": {"connected": _mongo["db"] is not None},
        "served": stats,
        "total": total,
        # 외부 API를 부르지 않고 응답한 비율(메모리·Redis·MongoDB에서 응답한 요청)
        "cacheHitPct": round(100 * (total - stats["api"]) / total, 1) if total else None,
    }


def _cached(name, loader, db_seconds=DB_REFRESH_SECONDS, as_value=False, keep_seconds=None):
    """Return loader() through a memory cache and MongoDB (db_seconds).

    조회 순서는 메모리 → Redis(rediscache.py, REDIS_URL이 있을 때) → MongoDB → API 입니다.
    메모리 캐시는 CACHE_SECONDS와 db_seconds 중 짧은 시간만 둡니다.
    API 호출이 실패하면 MongoDB에 남은 예전 데이터라도 돌려줍니다.
    as_value·keep_seconds는 _db_save 설명을 보세요.
    """
    with _cache_locks_lock:
        lock = _cache_locks.setdefault(name, threading.Lock())
    with lock:
        entry = _caches.get(name)
        if entry is not None and time.time() - entry[1] < min(CACHE_SECONDS, db_seconds):
            _count("memory")
            return entry[0]

        shared = rediscache.get(name)  # 인스턴스끼리 나눠 쓰는 Redis 캐시 (REDIS_URL이 있을 때만)
        if shared is not None:
            _caches[name] = (shared[0], shared[1])  # 저장 시각을 그대로 써서 메모리에서 TTL이 두 번 더해지지 않게 한다
            _count("redis")
            return shared[0]

        db = _mongo_db()
        stored = None
        if db is not None:
            try:
                stored = _db_load(db, name)
            except Exception as error:
                print(f"[MongoDB] {name} 읽기 실패: {error}")
        if stored is not None and time.time() - stored[1] < db_seconds:
            _caches[name] = (stored[0], time.time())
            rediscache.set(name, stored[0], db_seconds - (time.time() - stored[1]))
            _count("mongo")
            return stored[0]

        # 캐시가 빈 순간 여러 인스턴스가 한꺼번에 API를 부르지 않게, 먼저 온 한 곳만 부르고 나머지는 결과를 기다린다.
        refresh = rediscache.Lock(name)
        try:
            if refresh.enabled and not refresh.held:
                waited = rediscache.wait_for(name)
                if waited is not None:
                    _caches[name] = (waited[0], waited[1])
                    _count("redis")
                    return waited[0]
            try:
                value = loader()
            except (RuntimeError, ValueError):
                if stored is None:
                    raise
                print(f"[MongoDB] {name} API 호출에 실패해 저장된 데이터를 씁니다.")
                _caches[name] = (stored[0], time.time())
                _count("mongo")
                return stored[0]

            if db is not None:
                try:
                    _db_save(db, name, value, as_value, keep_seconds)
                except Exception as error:
                    print(f"[MongoDB] {name} 저장 실패: {error}")
            rediscache.set(name, value, db_seconds)
            _caches[name] = (value, time.time())
            _count("api")
            return value
        finally:
            refresh.release()


def fetch_db_status():
    """MongoDB에 저장된 데이터셋과 저장 시각을 보여줍니다."""
    db = _mongo_db()
    if db is None:
        return {"connected": False, "host": _mask_uri(MONGO_URI), "database": MONGO_DB, "datasets": []}
    datasets = [
        {
            "name": meta["_id"],
            "kind": meta.get("kind"),
            "count": meta.get("count"),
            "savedAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(meta["savedAt"])),
        }
        for meta in db["_meta"].find({}, {"value": 0}).sort("_id", 1)
    ]
    return {"connected": True, "host": _mask_uri(MONGO_URI), "database": MONGO_DB, "datasets": datasets}


def _require_key(key, name):
    if not key.strip():
        raise ValueError(f"api.py의 {name}에 발급받은 인증키를 입력해 주세요.")


def _http_get(url, params, label, timeout=15):
    request = Request(
        f"{url}?{urlencode(params)}",
        headers={"Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{label} API가 HTTP {error.code}을(를) 반환했습니다: {detail}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"{label} API 연결에 실패했습니다: {error}") from error


def _parse_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError("API 응답을 JSON으로 해석하지 못했습니다.") from error


def _response_items(body):
    items = body.get("items") or {}
    if not isinstance(items, dict):
        return []
    items = items.get("item", [])
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        raise RuntimeError("API 응답의 항목 형식이 올바르지 않습니다.")
    return items


def _fetch_tour_api(service, operation, operation_params):
    """Call a Korea Tourism Organization TourAPI operation and return its body."""
    _require_key(API_KEY, "API_KEY")
    base_url, mobile_app, label = TOUR_SERVICES[service]
    params = {
        "serviceKey": API_KEY.strip(),
        "MobileOS": "ETC",
        "MobileApp": mobile_app,
        "_type": "json",
    }
    params.update(operation_params)
    payload = _parse_json(
        _http_get(f"{base_url}/{operation}", params, f"{label} {operation}")
    )

    # 관광 자원 수요 API는 오류를 response 없이 최상위 resultCode로 돌려줍니다.
    response = payload.get("response")
    header = (response or payload).get("header", payload)
    if response is None or header.get("resultCode") != "0000":
        raise RuntimeError(
            f"{label} {operation} API 오류 "
            f"{header.get('resultCode', 'unknown')}: "
            f"{header.get('resultMsg', '응답 메시지 없음')}"
        )
    return response.get("body") or {}


# ---------------------------------------------------------------------------
# 의료 관광정보 (MdclTursmService)
# ---------------------------------------------------------------------------

def fetch_medical_tourism(page_no=1, num_of_rows=10, keyword=None):
    """Fetch a page of medical tourism data from the Korea Tourism API."""
    params = {
        "numOfRows": num_of_rows,
        "pageNo": page_no,
        "langDivCd": "ENG",
        "arrange": "C",
    }
    operation = "mdclTursmSyncList"
    if keyword:
        operation = "searchKeyword"
        params["keyword"] = keyword

    body = _fetch_tour_api("medical", operation, params)
    return {
        "items": _response_items(body),
        "pageNo": body.get("pageNo", page_no),
        "numOfRows": body.get("numOfRows", num_of_rows),
        "totalCount": body.get("totalCount", 0),
    }


def fetch_medical_details(content_id):
    """Fetch common, introduction, and medical tourism details for an institution."""
    _require_key(API_KEY, "API_KEY")
    if not content_id.isdigit():
        raise ValueError("콘텐츠 ID가 올바르지 않습니다.")

    params = {"contentId": content_id, "langDivCd": "ENG"}
    operations = {
        "common": "detailCommon",
        "intro": "detailIntro",
        "medical": "detailMdclTursm",
    }
    with ThreadPoolExecutor(max_workers=len(operations)) as executor:
        futures = {
            name: executor.submit(_fetch_tour_api, "medical", operation, params)
            for name, operation in operations.items()
        }
        return {
            name: _response_items(future.result())
            for name, future in futures.items()
        }


# ---------------------------------------------------------------------------
# 반려동물 동반여행 (KorPetTourService2)
# ---------------------------------------------------------------------------

def fetch_regions(service):
    """Fetch the province (legal-dong) codes used for region filtering."""
    body = _fetch_tour_api(service, "ldongCode2", {"numOfRows": 50, "pageNo": 1})
    return _response_items(body)


def fetch_places(service, page_no=1, keyword=None, region=None, content_type=None):
    """Fetch a page of places, by keyword or by region."""
    params = {"numOfRows": PLACE_PAGE_SIZE, "pageNo": page_no, "arrange": "Q"}
    if region:
        params["lDongRegnCd"] = region
    if content_type:
        params["contentTypeId"] = content_type

    operation = "areaBasedList2"
    if keyword:
        operation = "searchKeyword2"
        params["keyword"] = keyword

    body = _fetch_tour_api(service, operation, params)
    return {
        "items": _response_items(body),
        "pageNo": body.get("pageNo", page_no),
        "totalCount": body.get("totalCount", 0),
    }


def fetch_place_details(service, content_id, content_type):
    """Fetch common and introduction details (plus pet info for the pet service)."""
    if not content_id.isdigit() or not content_type.isdigit():
        raise ValueError("콘텐츠 ID가 올바르지 않습니다.")

    operations = {
        "common": ("detailCommon2", {"contentId": content_id}),
        "intro": (
            "detailIntro2",
            {"contentId": content_id, "contentTypeId": content_type},
        ),
    }
    if service == "pet":
        operations["pet"] = ("detailPetTour2", {"contentId": content_id})

    with ThreadPoolExecutor(max_workers=len(operations)) as executor:
        futures = {
            name: executor.submit(_fetch_tour_api, service, operation, params)
            for name, (operation, params) in operations.items()
        }
        return {
            name: _response_items(future.result())
            for name, future in futures.items()
        }


# ---------------------------------------------------------------------------
# 지역별 관광 자원 수요 (AreaTarResDemService)
# ---------------------------------------------------------------------------

# 활용가이드의 지역/시군구 코드 파일 기준
DEMAND_AREAS = {
    "11": "서울특별시",
    "26": "부산광역시",
    "27": "대구광역시",
    "28": "인천광역시",
    "29": "광주광역시",
    "30": "대전광역시",
    "31": "울산광역시",
    "36": "세종특별자치시",
    "41": "경기도",
    "43": "충청북도",
    "44": "충청남도",
    "46": "전라남도",
    "47": "경상북도",
    "48": "경상남도",
    "50": "제주특별자치도",
    "51": "강원특별자치도",
    "52": "전북특별자치도",
}

# 명세상 지표 코드는 선택이지만, 빼면 결과가 0건이라 항상 보냅니다.
DEMAND_INDICATORS = {
    "11": "관광 서비스 수요 (전체)",
    "1101": "레포츠 SNS 언급량",
    "1102": "휴식·힐링 SNS 언급량",
    "1103": "미식 SNS 언급량",
    "1104": "체험 SNS 언급량",
    "1105": "쇼핑업 소비액",
    "1106": "식음료 소비액",
    "1107": "숙박업 소비액",
    "1108": "여가 서비스업 소비액",
    "1109": "운송업 소비액",
    "1110": "내비게이션 숙박 검색량",
    "1111": "내비게이션 음식 검색량",
    "1112": "내비게이션 쇼핑 검색량",
    "12": "문화 자원 수요 (전체)",
    "1201": "내비게이션 문화 관광 검색량",
    "1202": "내비게이션 레저 스포츠 검색량",
    "1203": "내비게이션 역사 관광 검색량",
    "1204": "내비게이션 체험 관광 검색량",
    "1205": "내비게이션 자연 관광 검색량",
}


def fetch_demand(base_ym, area_cd, indicator):
    """Fetch the demand index of every district in a province for one month."""
    if len(base_ym) != 6 or not base_ym.isdigit():
        raise ValueError("기준 연월은 YYYYMM 형식이어야 합니다.")
    if area_cd not in DEMAND_AREAS:
        raise ValueError("지역 코드가 올바르지 않습니다.")
    if indicator not in DEMAND_INDICATORS:
        raise ValueError("지표 코드가 올바르지 않습니다.")

    if indicator.startswith("11"):
        operation, code_param, value_field = "areaTarSvcDemList", "tarSvcDemIxCd", "tarSvcDemIxVal"
    else:
        operation, code_param, value_field = "areaCulResDemList", "culResDemIxCd", "culResDemIxVal"

    body = _fetch_tour_api("demand", operation, {
        "baseYm": base_ym,
        "areaCd": area_cd,
        code_param: indicator,
        "numOfRows": 100,
        "pageNo": 1,
    })

    rows = []
    area_total = None
    for item in _response_items(body):
        try:
            value = float(item.get(value_field) or "")
        except ValueError:
            continue
        name = item.get("signguNm") or ""
        if name in ("", "_"):
            area_total = value
            continue
        rows.append({"name": name, "code": item.get("signguCd"), "value": value})
    rows.sort(key=lambda row: row["value"], reverse=True)

    return {
        "baseYm": base_ym,
        "areaName": DEMAND_AREAS[area_cd],
        "indicatorName": DEMAND_INDICATORS[indicator],
        "areaTotal": area_total,
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# 관광지 안전정보 (한국문화정보원)
# ---------------------------------------------------------------------------

SAFETY_SUCCESS_CODES = {"0000", "00"}


def _parse_safety_xml(text):
    """XML 응답을 JSON 응답과 같은 형태(dict)로 변환합니다."""
    root = ET.fromstring(text)
    header = {
        "resultCode": root.findtext("header/resultCode", ""),
        "resultMsg": root.findtext("header/resultMsg", ""),
    }
    body = {
        "numOfRows": root.findtext("body/numOfRows", ""),
        "pageNo": root.findtext("body/pageNo", ""),
        "totalCount": root.findtext("body/totalCount", "0"),
        "items": {
            "item": [
                {child.tag: (child.text or "").strip() for child in item}
                for item in root.findall("body/items/item")
            ]
        },
    }
    return {"response": {"header": header, "body": body}}


def fetch_tour_safety(page_no=1, num_of_rows=10, sido=None, gungu=None):
    """Fetch a page of tourist-site safety data from the KCISA API."""
    _require_key(KCISA_API_KEY, "KCISA_API_KEY")
    params = {
        "serviceKey": KCISA_API_KEY.strip(),
        "numOfRows": num_of_rows,
        "pageNo": page_no,
    }
    if sido:
        params["sido"] = sido
    if gungu:
        params["gungu"] = gungu

    text = _http_get(SAFETY_API_URL, params, "관광지 안전정보")
    try:
        if text.lstrip().startswith("<"):
            payload = _parse_safety_xml(text)
        else:
            payload = json.loads(text)
    except (json.JSONDecodeError, ET.ParseError) as error:
        raise RuntimeError("API 응답을 해석하지 못했습니다.") from error

    response = payload.get("response", payload)
    header = response.get("header", {})
    if header.get("resultCode") not in SAFETY_SUCCESS_CODES:
        raise RuntimeError(
            f"관광지 안전정보 API 오류 "
            f"{header.get('resultCode', 'unknown')}: "
            f"{header.get('resultMsg', '응답 메시지 없음')}"
        )

    body = response.get("body") or {}
    return {
        "items": _response_items(body),
        "pageNo": body.get("pageNo", page_no),
        "numOfRows": body.get("numOfRows", num_of_rows),
        "totalCount": body.get("totalCount", 0),
    }


# ---------------------------------------------------------------------------
# 전국관광지정보표준데이터
# ---------------------------------------------------------------------------

def _fetch_tourspot_page(page_no, num_of_rows):
    params = {
        "serviceKey": API_KEY.strip(),
        "pageNo": page_no,
        "numOfRows": num_of_rows,
        "type": "json",
    }
    payload = _parse_json(_http_get(TOURSPOT_API_URL, params, "전국관광지", timeout=60))

    response = payload.get("response", payload)
    header = response.get("header", {})
    if header.get("resultCode") == "03":
        return [], 0
    if header.get("resultCode") != "00":
        raise RuntimeError(
            f"전국관광지 API 오류 "
            f"{header.get('resultCode', 'unknown')}: "
            f"{header.get('resultMsg', '응답 메시지 없음')}"
        )

    body = response.get("body") or {}
    return _response_items(body), int(body.get("totalCount") or 0)


def fetch_all_tourspots():
    """Fetch every tourist site once and keep it cached for an hour.

    The API only supports exact-match filters, so region and keyword
    searches are done locally on the cached list.
    """
    _require_key(API_KEY, "API_KEY")

    def load():
        items, total_count = _fetch_tourspot_page(1, 1000)
        page_no = 2
        while len(items) < total_count:
            page_items, _ = _fetch_tourspot_page(page_no, 1000)
            if not page_items:
                break
            items.extend(page_items)
            page_no += 1
        return items

    return _cached("tourspots", load)


def search_tourspots(page_no=1, region=None, keyword=None, category=None):
    items = fetch_all_tourspots()
    if region:
        items = [
            item for item in items
            if region in f"{item.get('rdnmadr', '')} {item.get('lnmadr', '')} {item.get('insttNm', '')}"
        ]
    if keyword:
        items = [
            item for item in items
            if keyword in f"{item.get('trrsrtNm', '')} {item.get('trrsrtIntrcn', '')}"
        ]
    if category:
        items = [item for item in items if item.get("trrsrtSe") == category]

    start = (page_no - 1) * TOURSPOT_PAGE_SIZE
    return {
        "items": items[start:start + TOURSPOT_PAGE_SIZE],
        "pageNo": page_no,
        "totalCount": len(items),
    }


# ---------------------------------------------------------------------------
# 지역 안전 종합 (안전정보 + 전국관광지 + 관광 수요를 합쳐 계산)
# ---------------------------------------------------------------------------

# 데이터마다 시도 이름이 달라서(강원도/강원특별자치도) 주소 앞부분으로 맞춥니다.
AREA_PREFIXES = {
    "11": ("서울",), "26": ("부산",), "27": ("대구",), "28": ("인천",),
    "29": ("광주",), "30": ("대전",), "31": ("울산",), "36": ("세종",),
    "41": ("경기",), "43": ("충청북도", "충북"), "44": ("충청남도", "충남"),
    "46": ("전라남도", "전남"), "47": ("경상북도", "경북"), "48": ("경상남도", "경남"),
    "50": ("제주",), "51": ("강원",), "52": ("전라북도", "전북"),
}


def fetch_all_safety():
    """Fetch every KCISA safety record once and keep it cached for an hour."""
    return _cached("kcisa_safety", lambda: fetch_tour_safety(1, SAFETY_ALL_ROWS)["items"])


def _coords(lat, lon):
    try:
        lat, lon = float(lat or ""), float(lon or "")
    except ValueError:
        return None
    # 국내 범위를 벗어난 좌표(빈 값, 위경도 뒤바뀜)는 거리 계산에서 뺍니다.
    if not (33 <= lat <= 39 and 124 <= lon <= 132):
        return None
    return lat, lon


def _distance_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(h))


def _number(value):
    try:
        return int(float(str(value).replace(",", "")))
    except ValueError:
        return None


def _safety_place(item):
    return {
        "name": item.get("tourName") or "",
        "kind": item.get("subject") or "",
        "region": f"{(item.get('sido') or '').strip()} {(item.get('gungu') or '').strip()}",
        "address": item.get("address2") or item.get("address") or "",
        "contact": item.get("operateContact") or item.get("contact") or "",
        "capacity": _number(item.get("totalCapacity")),
        "shelterType": item.get("category7") or "",
        "altitude": item.get("category16") or "",
        "operating": item.get("operateyn") or "",
        "coords": _coords(item.get("lat"), item.get("lon")),
    }


def _tourspot_place(item):
    address = item.get("rdnmadr") or item.get("lnmadr") or ""
    return {
        "name": item.get("trrsrtNm") or "",
        "kind": item.get("trrsrtSe") or "",
        "region": address,
        "address": address,
        "contact": item.get("phoneNumber") or "",
        "capacity": _number(item.get("aceptncCo")),
        "coords": _coords(item.get("latitude"), item.get("longitude")),
    }


def _safety_groups():
    places = [_safety_place(item) for item in fetch_all_safety()]
    shelters = [place for place in places if place["kind"] == "지진해일대피소"]
    hospitals = [place for place in places if "응급" in place["kind"]]
    return shelters, hospitals


def _district(region):
    """주소 앞부분에서 (시도 코드, 시군구)를 뽑아 데이터 간 지역을 맞춥니다."""
    region = region.strip()
    code = next((code for code, prefixes in AREA_PREFIXES.items() if region.startswith(prefixes)), None)
    parts = region.split()
    # 세종시는 시군구가 없습니다.
    gungu = parts[1] if len(parts) > 1 and code != "36" else ""
    return code, gungu


def _nearest(origin, places, count):
    ranked = [
        dict(place, distanceKm=round(_distance_km(origin, place["coords"]), 1))
        for place in places if place["coords"]
    ]
    ranked.sort(key=lambda place: place["distanceKm"])
    return ranked[:count]


def _public(place):
    """좌표 튜플을 화면에서 쓰기 쉬운 lat/lon 필드로 바꿉니다."""
    result = {key: value for key, value in place.items() if key not in ("coords", "region")}
    result["lat"], result["lon"] = place["coords"] or (None, None)
    return result


def _latest_demand(area_cd, gungu):
    # 매월 16일에 전월 데이터가 올라오므로 최근 두 달 중 데이터가 있는 달을 씁니다.
    today = date.today()
    month = today.month - (1 if today.day >= 16 else 2)
    year = today.year
    for _ in range(2):
        if month < 1:
            year, month = year - 1, month + 12
        base_ym = f"{year}{month:02d}"
        # 지난달 수요지수는 바뀌지 않아 DB에 오래 둡니다. 순위 표시는 복사본에 붙입니다.
        demand = copy.deepcopy(_cached(
            f"demand_{area_cd}_{base_ym}",
            lambda: fetch_demand(base_ym, area_cd, "11"),
            db_seconds=30 * 24 * 60 * 60,
        ))
        if demand["rows"]:
            rows = demand["rows"]
            for rank, row in enumerate(rows, 1):
                row["rank"] = rank
                row["selected"] = bool(gungu) and gungu in row["name"]
            return demand
        month -= 1
    return None


def fetch_area_safety(area_cd, gungu=None):
    """Combine shelters, emergency hospitals, tourist sites and demand for one region."""
    if area_cd not in AREA_PREFIXES:
        raise ValueError("지역 코드가 올바르지 않습니다.")
    prefixes = AREA_PREFIXES[area_cd]

    def in_area(place):
        region = place["region"].strip()
        return region.startswith(prefixes) and (not gungu or gungu in region)

    with ThreadPoolExecutor(max_workers=3) as executor:
        safety_future = executor.submit(_safety_groups)
        spots_future = executor.submit(fetch_all_tourspots)
        demand_future = executor.submit(_latest_demand, area_cd, gungu)
        shelters, hospitals = safety_future.result()
        spots = [_tourspot_place(item) for item in spots_future.result()]
        # 수요 지수는 보조 정보라 실패해도 나머지 결과는 보여줍니다.
        try:
            demand, demand_error = demand_future.result(), None
        except (RuntimeError, ValueError) as error:
            demand, demand_error = None, str(error)

    # 응급의료기관 데이터에는 좌표가 없어 거리 대신 같은 시군구의 기관 수를 셉니다.
    hospital_counts = {}
    for hospital in hospitals:
        key = _district(hospital["region"])
        hospital_counts[key] = hospital_counts.get(key, 0) + 1

    area_spots = []
    for spot in filter(in_area, spots):
        result = _public(spot)
        result["districtHospitals"] = hospital_counts.get(_district(spot["region"]), 0)
        nearest = _nearest(spot["coords"], shelters, 1) if spot["coords"] else []
        result["nearestShelter"] = _public(nearest[0]) if nearest else None
        area_spots.append(result)
    area_spots.sort(key=lambda spot: spot["capacity"] or 0, reverse=True)

    area_shelters = sorted(filter(in_area, shelters), key=lambda p: p["capacity"] or 0, reverse=True)
    return {
        "areaName": DEMAND_AREAS[area_cd],
        "gungu": gungu or "",
        "hospitals": [_public(place) for place in filter(in_area, hospitals)],
        "shelters": [_public(place) for place in area_shelters],
        "spots": area_spots,
        "demand": demand,
        "demandError": demand_error,
    }


def fetch_nearby(lat, lon):
    """Find the closest shelters, emergency hospitals and tourist sites to a point."""
    origin = _coords(lat, lon)
    if origin is None:
        raise ValueError("국내 위치의 위도·경도가 필요합니다.")
    shelters, hospitals = _safety_groups()
    spots = [_tourspot_place(item) for item in fetch_all_tourspots()]
    result = {
        name: [_public(place) for place in _nearest(origin, places, NEARBY_COUNT)]
        for name, places in (("shelters", shelters), ("spots", spots))
    }

    # 응급의료기관은 좌표가 없어서, 가장 가까운 장소가 속한 시군구의 기관을 보여줍니다.
    closest = _nearest(origin, shelters + spots, 1)
    district = _district(closest[0]["region"]) if closest else (None, "")
    result["district"] = " ".join(
        part for part in (DEMAND_AREAS.get(district[0], ""), district[1]) if part
    )
    result["hospitals"] = [
        _public(place) for place in hospitals if _district(place["region"]) == district
    ]
    return result


# ---------------------------------------------------------------------------
# 지도용 묶음 조회 (TourLink 웹의 카카오맵이 시도 하나를 한 번에 그릴 때 사용)
# ---------------------------------------------------------------------------

MAP_PAGE_ROWS = 1000
# 반려동물 API는 광주·전남을 통합 코드 12(전남광주통합특별시)로 돌려줍니다.
LDONG_CODES = {"29": ("29", "12"), "46": ("46", "12")}
PET_CONTENT_TYPES = {
    "12": "관광지", "14": "문화시설", "15": "축제·행사", "28": "레포츠",
    "32": "숙박", "38": "쇼핑", "39": "음식점",
}


def _area_code_by_name(name):
    for code, area_name in DEMAND_AREAS.items():
        if area_name == name:
            return code
    raise ValueError("시도 이름이 올바르지 않습니다.")


def _fetch_all_tour_items(service, operation, params):
    items = []
    page_no = 1
    while True:
        body = _fetch_tour_api(service, operation, {**params, "numOfRows": MAP_PAGE_ROWS, "pageNo": page_no})
        batch = _response_items(body)
        items.extend(batch)
        if not batch or len(items) >= int(body.get("totalCount") or 0):
            return items
        page_no += 1


def _map_spot(item):
    address = item.get("rdnmadr") or item.get("lnmadr") or ""
    code, gungu = _district(address)
    lat_lon = _coords(item.get("latitude"), item.get("longitude"))
    return {
        "name": item.get("trrsrtNm") or "",
        "kind": item.get("trrsrtSe") or "관광지",
        "province": DEMAND_AREAS.get(code, ""),
        "district": gungu,
        "address": address,
        "lat": lat_lon and lat_lon[0],
        "lng": lat_lon and lat_lon[1],
        "capacity": _number(item.get("aceptncCo")),
        "parking": _number(item.get("prkplceCo")),
        "phone": item.get("phoneNumber") or "",
        "facilities": (item.get("cnvnncFclty") or "").replace("+", ", "),
        "intro": item.get("trrsrtIntrcn") or "",
        "referenceDate": item.get("referenceDate") or "",
    }


def _map_safety(place):
    code, gungu = _district(place["region"])
    result = _public(place)
    result.update({"province": DEMAND_AREAS.get(code, ""), "district": gungu, "lng": result.pop("lon")})
    return result


def _medical_in_area(place, area_cd):
    if place["ldong"] == area_cd:
        return True
    # 통합 코드 12는 영문 주소의 도시명으로 광주와 전남을 나눕니다.
    if place["ldong"] == "12" and area_cd in ("29", "46"):
        return ("Gwangju" in place["address"]) == (area_cd == "29")
    return False


def _pet_places(area_cd):
    def load():
        places = {}
        for ldong in LDONG_CODES.get(area_cd, (area_cd,)):
            for item in _fetch_all_tour_items("pet", "areaBasedList2", {"arrange": "Q", "lDongRegnCd": ldong}):
                lat_lon = _coords(item.get("mapy"), item.get("mapx"))
                if lat_lon and item.get("contentid"):
                    places[item["contentid"]] = {
                        "name": item.get("title") or "",
                        "kind": PET_CONTENT_TYPES.get(item.get("contenttypeid"), "장소"),
                        "address": item.get("addr1") or "",
                        "lat": lat_lon[0],
                        "lng": lat_lon[1],
                        "image": item.get("firstimage2") or item.get("firstimage") or "",
                        "phone": item.get("tel") or "",
                        "contentId": item["contentid"],
                        "contentTypeId": item.get("contenttypeid") or "",
                    }
        return list(places.values())

    # 통합 코드로 받은 결과도 주소로 다시 시도를 나눕니다.
    return [
        place for place in _cached(f"pet_places_{area_cd}", load)
        if _district(place["address"])[0] == area_cd
    ]


def _medical_places():
    def load():
        places = []
        for item in _fetch_all_tour_items("medical", "mdclTursmSyncList", {"langDivCd": "KOR", "arrange": "C"}):
            lat_lon = _coords(item.get("mapY"), item.get("mapX"))
            if lat_lon:
                places.append({
                    "name": item.get("title") or "",
                    "address": item.get("baseAddr") or "",
                    "lat": lat_lon[0],
                    "lng": lat_lon[1],
                    "phone": item.get("tel") or "",
                    "ldong": item.get("lDongRegnCd") or "",
                    "contentId": item.get("contentId") or "",
                })
        return places

    return _cached("medical_places", load)


def fetch_map_places(province=None):
    """Return everything the TourLink map draws for one province (or the whole country)."""
    area_cd = _area_code_by_name(province) if province else None

    with ThreadPoolExecutor(max_workers=5) as executor:
        spots_future = executor.submit(fetch_all_tourspots)
        safety_future = executor.submit(_safety_groups)
        medical_future = executor.submit(_medical_places)
        pet_future = executor.submit(_pet_places, area_cd) if area_cd else None
        demand_future = executor.submit(_latest_demand, area_cd, None) if area_cd else None

        spots = [_map_spot(item) for item in spots_future.result()]
        shelters, hospitals = safety_future.result()
        medical = medical_future.result()
        # 반려동물·수요 지수는 보조 정보라 실패해도 나머지는 보여줍니다.
        errors = {}
        pets, demand = [], None
        for key, future in (("pets", pet_future), ("demand", demand_future)):
            if future is None:
                continue
            try:
                value = future.result()
            except (RuntimeError, ValueError) as error:
                errors[key] = str(error)
                continue
            if key == "pets":
                pets = value
            else:
                demand = value

    spots = [spot for spot in spots if spot["lat"] is not None]
    shelters = [_map_safety(place) for place in shelters]
    hospitals = [_map_safety(place) for place in hospitals]
    if area_cd:
        spots = [spot for spot in spots if spot["province"] == province]
        shelters = [place for place in shelters if place["province"] == province]
        hospitals = [place for place in hospitals if place["province"] == province]
        medical = [place for place in medical if _medical_in_area(place, area_cd)]

    return {
        "province": province or "",
        "provinces": list(DEMAND_AREAS.values()),
        "spots": spots,
        "shelters": shelters,
        "hospitals": hospitals,
        "medical": medical,
        "pets": pets,
        "demand": demand,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# 웹 화면
# ---------------------------------------------------------------------------

NAV_ITEMS = [
    ("/", "홈"),
    ("/area", "지역 안전 종합"),
    ("/weather", "날씨 맞춤 추천"),
    ("/access", "일행 맞춤 무장애"),
    ("/safety", "관광지 안전정보"),
    ("/tourspot", "전국 관광지"),
    ("/demand", "관광 자원 수요"),
    ("/pet", "반려동물 동반여행"),
    ("/medical", "의료 관광정보"),
]

BASE_STYLE = r"""
    body { max-width: 960px; margin: 0 auto; padding: 0 20px 40px; font: 16px/1.6 sans-serif; color: #222; }
    header nav { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 16px 0; border-bottom: 1px solid #ddd; margin-bottom: 24px; }
    header nav a { color: #555; text-decoration: none; }
    header nav a.brand { color: #1d4ed8; font-weight: 800; margin-right: 8px; }
    header nav a[aria-current="page"] { color: #111; font-weight: 700; }
    h1 { margin-bottom: 4px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0; align-items: center; }
    input, select, button { padding: 10px; font: inherit; }
    button { cursor: pointer; }
    #status, .note { color: #555; }
    .note { font-size: 0.9rem; }
    #error { color: #b00020; white-space: pre-wrap; }
    #results { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    article { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    article img { width: 100%; height: 180px; object-fit: cover; background: #eee; }
    article .content { padding: 14px; }
    article h2 { margin: 0 0 8px; font-size: 1.1rem; }
    article p { margin: 4px 0; color: #555; }
    article details { margin-top: 12px; }
    article summary { cursor: pointer; font-weight: 600; }
    .detail-section h3 { margin: 10px 0 4px; font-size: 1rem; }
    .detail-fields { display: grid; grid-template-columns: minmax(110px, 35%) 1fr; gap: 4px 8px; margin-top: 8px; }
    .detail-fields dt { font-weight: 600; overflow-wrap: anywhere; }
    .detail-fields dd { margin: 0; overflow-wrap: anywhere; white-space: pre-line; }
    #paging { display: flex; justify-content: center; align-items: center; gap: 16px; margin: 24px; }
    .hub { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .hub a { display: block; padding: 16px; border: 1px solid #ddd; border-radius: 8px; color: inherit; text-decoration: none; }
    .hub a strong { display: block; margin-bottom: 4px; }
    .hub a span { color: #555; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; }
    th { background: #f5f5f5; }
    td.rank { width: 3em; color: #777; text-align: right; }
    td.name { width: 9em; white-space: nowrap; }
    td.value { width: 5em; text-align: right; font-variant-numeric: tabular-nums; }
    .bar { position: relative; height: 14px; background: #f0f0f0; border-radius: 3px; min-width: 120px; }
    .bar span { position: absolute; inset: 0 auto 0 0; background: #3b82f6; border-radius: 3px; }
    .bar i { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #b00020; }
    .map-link { display: inline-block; margin-top: 6px; font-size: 0.9rem; color: #1d4ed8; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 16px 0 8px; }
    .stats div { border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; }
    .stats strong { display: block; font-size: 1.6rem; font-variant-numeric: tabular-nums; }
    .stats span { color: #555; font-size: 0.9rem; }
    #report h2 { margin: 32px 0 8px; font-size: 1.2rem; }
    #report td { vertical-align: top; }
    #report tr.selected td { background: #eff6ff; font-weight: 600; }
    .far { color: #b00020; font-weight: 600; }
"""

COMMON_SCRIPT = r"""
    const status = document.querySelector("#status");
    const error = document.querySelector("#error");
    const results = document.querySelector("#results");

    function addText(parent, tag, text) {
      const element = document.createElement(tag);
      element.textContent = text ?? "";
      parent.append(element);
      return element;
    }

    function cleanText(value) {
      const template = document.createElement("template");
      template.innerHTML = String(value).replace(/<br\s*\/?>/gi, "\n");
      return template.content.textContent.trim();
    }

    function renderFields(container, title, records, labels, hidden = new Set(), format = text => text) {
      const section = document.createElement("section");
      section.className = "detail-section";
      if (title) addText(section, "h3", title);
      let count = 0;
      for (const record of records) {
        const fields = document.createElement("dl");
        fields.className = "detail-fields";
        for (const [key, value] of Object.entries(record)) {
          if (hidden.has(key) || value === null || value === undefined) continue;
          const text = typeof value === "object" ? JSON.stringify(value) : format(cleanText(value));
          if (!text) continue;
          addText(fields, "dt", labels[key] || key);
          addText(fields, "dd", text);
          count++;
        }
        section.append(fields);
      }
      if (!count) addText(section, "p", "제공 정보가 없습니다.");
      container.append(section);
    }

    async function getJson(url) {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "데이터를 불러오지 못했습니다.");
      return data;
    }

    function addCard(image, title, lines) {
      const card = document.createElement("article");
      if (image) {
        const img = document.createElement("img");
        img.src = image;
        img.alt = "";
        img.loading = "lazy";
        card.append(img);
      }
      const content = document.createElement("div");
      content.className = "content";
      addText(content, "h2", title);
      for (const line of lines) if (line) addText(content, "p", line);
      card.append(content);
      results.append(card);
      return content;
    }

    // 좌표가 있으면 카카오맵에서 위치를 여는 링크를 만듭니다.
    function mapLink(name, lat, lon) {
      const y = Number(lat), x = Number(lon);
      if (!y || !x) return null;
      const link = document.createElement("a");
      link.className = "map-link";
      link.href = `https://map.kakao.com/link/map/${encodeURIComponent(name || "위치")},${y},${x}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "지도 보기";
      return link;
    }

    function addMapLink(content, name, lat, lon) {
      const link = mapLink(name, lat, lon);
      if (link) content.append(link);
    }

    function addDetails(content) {
      const details = document.createElement("details");
      addText(details, "summary", "상세 정보 보기");
      content.append(details);
      return details;
    }

    // 상세 정보를 처음 펼칠 때 한 번만 불러옵니다.
    function addLazyDetails(content, loader) {
      const details = addDetails(content);
      const body = document.createElement("div");
      details.append(body);
      details.addEventListener("toggle", async () => {
        if (!details.open || details.dataset.loaded) return;
        details.dataset.loaded = "loading";
        body.textContent = "상세 정보를 불러오는 중...";
        try {
          const container = document.createElement("div");
          await loader(container);
          body.replaceChildren(container);
          details.dataset.loaded = "true";
        } catch (exception) {
          details.dataset.loaded = "";
          body.replaceChildren();
          addText(body, "p", exception.message);
        }
      });
    }

    function startLoading() {
      status.textContent = "불러오는 중...";
      error.textContent = "";
      if (results) results.replaceChildren();
    }

    function showError(exception) {
      status.textContent = "";
      error.textContent = exception.message;
    }

    function createPager(pageSize, load) {
      const pager = { pageNo: 1, total: 0 };
      const previous = document.querySelector("#previous");
      const next = document.querySelector("#next");
      pager.update = (total, count) => {
        pager.total = Number(total) || 0;
        status.textContent = count ? `전체 ${pager.total}건 중 ${count}건` : "조회 결과가 없습니다.";
        document.querySelector("#page").textContent = `${pager.pageNo} 페이지`;
        previous.disabled = pager.pageNo <= 1;
        next.disabled = pager.pageNo * pageSize >= pager.total;
      };
      pager.reset = () => {
        pager.pageNo = 1;
        load();
      };
      previous.addEventListener("click", () => {
        if (pager.pageNo > 1) { pager.pageNo--; load(); }
      });
      next.addEventListener("click", () => {
        if (pager.pageNo * pageSize < pager.total) { pager.pageNo++; load(); }
      });
      return pager;
    }

    function onSearch(pager, inputs, selects = []) {
      document.querySelector("#search").addEventListener("click", pager.reset);
      for (const input of inputs) {
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") pager.reset();
        });
      }
      for (const select of selects) select.addEventListener("change", pager.reset);
    }
"""

LISTING_HTML = r"""
  <main id="results"></main>
  <nav id="paging" aria-label="페이지 이동">
    <button id="previous">이전</button>
    <span id="page"></span>
    <button id="next">다음</button>
  </nav>
"""


def _build_page(path, title, intro, body, script="", listing=True):
    links = [f'<a href="/" class="brand">{SITE_NAME}</a>']
    for href, label in NAV_ITEMS:
        current = ' aria-current="page"' if href == path else ""
        links.append(f'<a href="{href}"{current}>{label}</a>')
    return (
        '<!doctype html>\n<html lang="ko">\n<head>\n'
        '  <meta charset="utf-8">\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"  <title>{title if title == SITE_NAME else f'{title} | {SITE_NAME}'}</title>\n"
        f"  <style>{BASE_STYLE}  </style>\n"
        "</head>\n<body>\n"
        f'  <header><nav aria-label="메뉴">{"".join(links)}</nav></header>\n'
        f"  <h1>{title}</h1>\n  <p>{intro}</p>\n"
        f"{body}\n"
        '  <p id="status" role="status"></p>\n'
        '  <p id="error" role="alert"></p>\n'
        f"{LISTING_HTML if listing else ''}"
        f"  <script>{COMMON_SCRIPT}{script}  </script>\n"
        "</body>\n</html>\n"
    )


HOME_PAGE = _build_page(
    "/",
    SITE_NAME,
    "관광지 안전과 관련된 공공데이터를 한곳에서 조회합니다.",
    r"""
  <div class="hub">
    <a href="/area"><strong>지역 안전 종합</strong><span>지역별 응급의료기관·대피소·관광지 수용인원·관광수요를 한 화면에, 내 위치 주변 검색까지</span></a>
    <a href="/weather"><strong>날씨 맞춤 추천</strong><span>단기·중기예보, 기상특보, 미세먼지로 실내·야외 추천(어르신·아이 동반 기준 따로)</span></a>
    <a href="/access"><strong>일행 맞춤 무장애 정보</strong><span>어르신·아이·휠체어·유아차에 필요한 편의시설 정보가 있는 주변 관광지(한국관광공사 무장애 여행정보)</span></a>
    <a href="/safety"><strong>관광지 안전정보</strong><span>지진해일대피소, 응급의료기관, 관광지 위치와 수용인원</span></a>
    <a href="/tourspot"><strong>전국 관광지</strong><span>전국관광지정보표준데이터 892곳의 시설·수용인원</span></a>
    <a href="/demand"><strong>관광 자원 수요</strong><span>시군구별 관광수요지수로 사람이 몰리는 지역 비교</span></a>
    <a href="/pet"><strong>반려동물 동반여행</strong><span>동반 가능 장소와 목줄·입마개 등 동반 안전수칙</span></a>
    <a href="/medical"><strong>의료 관광정보</strong><span>한국관광공사 의료 관광기관 정보</span></a>
  </div>
""",
    listing=False,
)


MEDICAL_PAGE = _build_page(
    "/medical",
    "의료 관광정보",
    "한국관광공사 의료 관광정보를 조회합니다.",
    r"""
  <div class="toolbar">
    <label for="keyword">기관 검색</label>
    <input id="keyword" type="search" placeholder="병원명·지역·진료 분야">
    <button id="search">조회</button>
  </div>
""",
    r"""
    const keyword = document.querySelector("#keyword");
    const fieldLabels = {
      contentId: "콘텐츠 ID",
      contentTypeId: "관광타입 ID",
      title: "제목",
      homepage: "홈페이지",
      baseAddr: "주소",
      detailAddr: "상세 주소",
      zipCd: "우편번호",
      tel: "전화번호",
      telname: "전화번호명",
      overview: "개요",
      mapX: "경도",
      mapY: "위도",
      regDt: "등록일",
      mdfcnDt: "수정일",
      cpyrhtDivCd: "저작권 유형",
      mdclTursmDivInfo: "의료관광 구분",
      svcLangInfo: "서비스 언어",
      hmpgInfo: "홈페이지",
      prSnsInfo: "홍보 SNS",
      histrCn: "기관 연혁",
      onlineRsvtPsblYn: "온라인 예약 가능 여부",
      gdsCnselCn: "상품 상담 내용",
      insttDevInfo: "기관 구분",
      mainMdlcSubjInfo: "주요 진료 과목",
      specProcMdlcInfo: "특화 시술",
      coorResidYn: "의료 코디네이터 상주 여부",
      specFcltyInfo: "특화 시설",
      corprHsptlInfo: "협력 병원",
      trtmntGdsKndInfo: "취급 의료 상품"
    };
    const pager = createPager(10, load);

    async function load() {
      startLoading();
      try {
        const params = new URLSearchParams({ page: pager.pageNo, keyword: keyword.value.trim() });
        const data = await getJson(`/api/medical?${params}`);
        for (const item of data.items) {
          const content = addCard(item.thumbImage, item.title || "이름 없는 의료기관", [
            item.baseAddr,
            item.tel && `전화: ${item.tel}`
          ]);
          addMapLink(content, item.title, item.mapY || item.mapy, item.mapX || item.mapx);
          addLazyDetails(content, async container => {
            const detailParams = new URLSearchParams({ contentId: item.contentId || item.contentid || "" });
            const detail = await getJson(`/api/medical/detail?${detailParams}`);
            renderFields(container, "공통 정보", detail.common, fieldLabels);
            renderFields(container, "소개 정보", detail.intro, fieldLabels);
            renderFields(container, "의료 관광 상세 정보", detail.medical, fieldLabels);
          });
        }
        pager.update(data.totalCount, data.items.length);
      } catch (exception) {
        showError(exception);
      }
    }

    onSearch(pager, [keyword]);
    load();
""",
)


SAFETY_PAGE = _build_page(
    "/safety",
    "관광지 안전정보",
    "한국문화정보원 관광지 안전정보를 조회합니다. 지진해일대피소, 응급의료기관, 관광지가 들어 있습니다.",
    r"""
  <div class="toolbar">
    <label for="sido">시도</label>
    <input id="sido" type="search" placeholder="예: 강원도">
    <label for="gungu">군구</label>
    <input id="gungu" type="search" placeholder="예: 강릉시">
    <button id="search">조회</button>
  </div>
""",
    r"""
    const sido = document.querySelector("#sido");
    const gungu = document.querySelector("#gungu");
    const fieldLabels = {
      rnum: "번호",
      tourName: "관광지명/명칭",
      subject: "구분",
      sido: "시도",
      gungu: "시군구",
      address: "지번 주소",
      address2: "도로명 주소",
      affiliation: "관리기관명",
      contact: "전화번호",
      description: "설명",
      extent: "면적",
      lat: "위도",
      lon: "경도",
      totalCapacity: "수용인원",
      parkingCapacity: "주차가능",
      period: "지정일자",
      creator: "개체",
      publisher: "수집기관코드",
      regDate: "등록일",
      insertDate: "수집일",
      category1: "공공편익시설정보",
      category2: "숙박시설정보 수",
      category3: "운동및오락시설 정보",
      category4: "휴양및문화시설 정보",
      category5: "접객시설정보",
      category6: "지원시설정보",
      category7: "지진해일대피소유형",
      category8: "지진해일대피소유형구분",
      operateyn: "지진해일대피소운영상태",
      operateContact: "지진해일대피소전화번호",
      category9: "부대편의시설",
      category10: "주민대피지구명",
      category11: "주민대피지구내가구수",
      category12: "주민대피지구내거주인수",
      category13: "주민대피지구내재해약자수",
      category14: "내진적용여부",
      grade: "내진설계등급",
      category15: "해안선이격거리",
      category16: "해발높이",
      category17: "지진대피안내표지판수",
      category18: "긴급대피장소안내표지판수",
      category19: "지진대피로안내표지판수"
    };
    const pager = createPager(10, load);

    async function load() {
      startLoading();
      try {
        const params = new URLSearchParams({
          page: pager.pageNo,
          sido: sido.value.trim(),
          gungu: gungu.value.trim()
        });
        const data = await getJson(`/api/safety?${params}`);
        for (const item of data.items) {
          const content = addCard(null, item.tourName || "이름 없는 관광지", [
            item.subject && `구분: ${item.subject}`,
            item.address2 || item.address,
            item.contact && `전화: ${item.contact}`
          ]);
          addMapLink(content, item.tourName, item.lat, item.lon);
          renderFields(addDetails(content), null, [item], fieldLabels);
        }
        pager.update(data.totalCount, data.items.length);
      } catch (exception) {
        showError(exception);
      }
    }

    onSearch(pager, [sido, gungu]);
    load();
""",
)


TOURSPOT_PAGE = _build_page(
    "/tourspot",
    "전국 관광지 정보",
    "전국관광지정보표준데이터를 조회합니다.",
    r"""
  <div class="toolbar">
    <label for="region">지역</label>
    <input id="region" type="search" placeholder="예: 용인, 강릉, 제주">
    <label for="keyword">검색어</label>
    <input id="keyword" type="search" placeholder="예: 온천, 해수욕장">
    <select id="category" aria-label="구분">
      <option value="">전체</option>
      <option value="관광지">관광지</option>
      <option value="관광단지">관광단지</option>
    </select>
    <button id="search">조회</button>
  </div>
""",
    r"""
    const region = document.querySelector("#region");
    const keyword = document.querySelector("#keyword");
    const category = document.querySelector("#category");
    const fieldLabels = {
      trrsrtNm: "관광지명",
      trrsrtSe: "관광지구분",
      rdnmadr: "도로명주소",
      lnmadr: "지번주소",
      latitude: "위도",
      longitude: "경도",
      ar: "면적(㎡)",
      cnvnncFclty: "공공편익시설",
      stayngInfo: "숙박시설",
      mvmAmsmtFclty: "운동·오락시설",
      recrtClturFclty: "휴양·문화시설",
      hospitalityFclty: "접객시설",
      sportFclty: "지원시설",
      appnDate: "지정일자",
      aceptncCo: "수용인원수",
      prkplceCo: "주차가능수",
      trrsrtIntrcn: "관광지소개",
      phoneNumber: "관리기관전화번호",
      institutionNm: "관리기관명",
      referenceDate: "데이터기준일자",
      insttCode: "제공기관코드",
      insttNm: "제공기관명"
    };
    const pager = createPager(__TOURSPOT_PAGE_SIZE__, load);

    async function load() {
      startLoading();
      try {
        const params = new URLSearchParams({
          page: pager.pageNo,
          region: region.value.trim(),
          keyword: keyword.value.trim(),
          category: category.value
        });
        const data = await getJson(`/api/tourspots?${params}`);
        for (const item of data.items) {
          const content = addCard(null, item.trrsrtNm || "이름 없는 관광지", [
            item.trrsrtSe && `구분: ${item.trrsrtSe}`,
            item.rdnmadr || item.lnmadr,
            item.phoneNumber && `전화: ${item.phoneNumber}`
          ]);
          addMapLink(content, item.trrsrtNm, item.latitude, item.longitude);
          renderFields(addDetails(content), null, [item], fieldLabels, new Set(), text => text.replaceAll("+", ", "));
        }
        pager.update(data.totalCount, data.items.length);
      } catch (exception) {
        showError(exception);
      }
    }

    onSearch(pager, [region, keyword], [category]);
    load();
""".replace("__TOURSPOT_PAGE_SIZE__", str(TOURSPOT_PAGE_SIZE)),
)


# 반려동물 화면 설정. 목록·상세 화면은 _place_page가 이 설정으로 만듭니다.
PLACE_PAGE_CONFIG = {
    "pet": {
        "title": "반려동물 동반여행",
        "intro": "한국관광공사 반려동물 동반여행 정보를 조회합니다.",
        "placeholder": "검색어 (예: 해수욕장, 카페)",
        "untitled": "이름 없는 장소",
        "tel": "전화",
        "content_types": [
            ("12", "관광지"), ("14", "문화시설"), ("15", "축제·공연·행사"), ("28", "레포츠"),
            ("32", "숙박"), ("38", "쇼핑"), ("39", "음식점"),
        ],
        "sections": [("pet", "반려동물 동반 정보"), ("common", "기본 정보"), ("intro", "이용 안내")],
    },
}

PLACE_SCRIPT = r"""
    const service = __SERVICE__;
    const sections = __SECTIONS__;
    const untitled = __UNTITLED__;
    const telLabel = __TEL__;
    const keyword = document.querySelector("#keyword");
    const region = document.querySelector("#region");
    const contentType = document.querySelector("#contentType");
    const hiddenFields = new Set([
      "contentid", "contenttypeid", "firstimage", "firstimage2", "cpyrhtDivCd",
      "areacode", "sigungucode", "cat1", "cat2", "cat3", "mlevel",
      "lDongRegnCd", "lDongSignguCd", "lclsSystm1", "lclsSystm2", "lclsSystm3",
      "createdtime", "modifiedtime", "heritage1", "heritage2", "heritage3"
    ]);
    const fieldLabels = {
      acmpyTypeCd: "동반 구분",
      acmpyPsblCpam: "동반 가능 동물",
      acmpyNeedMtr: "동반 시 필요사항",
      relaAcdntRiskMtr: "사고 대비사항",
      relaPosesFclty: "관련 구비시설",
      relaFrnshPrdlst: "관련 비치품목",
      relaPurcPrdlst: "관련 구매품목",
      relaRntlPrdlst: "관련 렌탈품목",
      etcAcmpyInfo: "기타 동반 정보",
      title: "이름",
      overview: "개요",
      homepage: "홈페이지",
      tel: "전화번호",
      telname: "전화번호명",
      addr1: "주소",
      addr2: "상세 주소",
      zipcode: "우편번호",
      mapx: "경도",
      mapy: "위도",
      infocenter: "문의처",
      usetime: "이용시간",
      restdate: "쉬는 날",
      parking: "주차",
      usefee: "이용요금",
      opendate: "개장일",
      useseason: "이용시기",
      expguide: "체험 안내",
      expagerange: "체험 가능 연령",
      accomcount: "수용인원",
      chkbabycarriage: "유모차 대여",
      chkpet: "반려동물 동반",
      chkcreditcard: "신용카드",
      eventstartdate: "행사 시작일",
      eventenddate: "행사 종료일",
      eventplace: "행사 장소",
      playtime: "공연시간",
      checkintime: "체크인",
      checkouttime: "체크아웃",
      firstmenu: "대표 메뉴",
      treatmenu: "취급 메뉴",
      opentimefood: "영업시간",
      restdatefood: "쉬는 날"
    };
    // 반려동물 기타 안내는 "- 항목- 항목"처럼 붙어 와서 줄을 나눠 줍니다.
    const format = service === "pet" ? text => text.replace(/\s*- /g, "\n- ").trim() : text => text;
    const pager = createPager(__PAGE_SIZE__, load);

    async function loadRegions() {
      try {
        const data = await getJson(`/api/${service}/regions`);
        for (const item of data.items) addText(region, "option", item.name).value = item.code;
      } catch (exception) {
        error.textContent = exception.message || "지역 목록을 불러오지 못했습니다.";
      }
    }

    async function load() {
      startLoading();
      try {
        const params = new URLSearchParams({
          page: pager.pageNo,
          keyword: keyword.value.trim(),
          region: region.value,
          contentType: contentType.value
        });
        const data = await getJson(`/api/${service}/places?${params}`);
        for (const item of data.items) {
          const content = addCard(item.firstimage, item.title || untitled, [
            item.addr1,
            item.tel && `${telLabel}: ${cleanText(item.tel)}`
          ]);
          addMapLink(content, item.title, item.mapy, item.mapx);
          addLazyDetails(content, async container => {
            const detailParams = new URLSearchParams({
              contentId: item.contentid || "",
              contentTypeId: item.contenttypeid || ""
            });
            const detail = await getJson(`/api/${service}/detail?${detailParams}`);
            for (const [key, title] of sections) {
              renderFields(container, title, detail[key] || [], fieldLabels, hiddenFields, format);
            }
          });
        }
        pager.update(data.totalCount, data.items.length);
      } catch (exception) {
        showError(exception);
      }
    }

    onSearch(pager, [keyword], [region, contentType]);
    loadRegions();
    load();
"""


def _place_page(service):
    config = PLACE_PAGE_CONFIG[service]
    options = "".join(
        f'\n      <option value="{code}">{name}</option>'
        for code, name in config["content_types"]
    )
    toolbar = (
        '\n  <div class="toolbar">\n'
        '    <select id="region" aria-label="지역">\n      <option value="">전체 지역</option>\n    </select>\n'
        f'    <select id="contentType" aria-label="관광 타입">\n      <option value="">전체 타입</option>{options}\n    </select>\n'
        f'    <input id="keyword" type="search" placeholder="{config["placeholder"]}">\n'
        '    <button id="search">조회</button>\n  </div>\n'
    )
    script = (
        PLACE_SCRIPT
        .replace("__SERVICE__", json.dumps(service))
        .replace("__SECTIONS__", json.dumps(config["sections"], ensure_ascii=False))
        .replace("__UNTITLED__", json.dumps(config["untitled"], ensure_ascii=False))
        .replace("__TEL__", json.dumps(config["tel"], ensure_ascii=False))
        .replace("__PAGE_SIZE__", str(PLACE_PAGE_SIZE))
    )
    return _build_page(f"/{service}", config["title"], config["intro"], toolbar, script)


DEMAND_PAGE = _build_page(
    "/demand",
    "지역별 관광 자원 수요",
    "한국관광데이터랩 관광수요지수의 관광 서비스·문화 자원 수요를 시군구별로 비교합니다.",
    r"""
  <div class="toolbar">
    <label for="baseYm">기준 월</label>
    <input id="baseYm" type="month">
    <select id="area" aria-label="시도"></select>
    <select id="indicator" aria-label="지표"></select>
    <button id="search">조회</button>
  </div>
  <p class="note">지수가 높을수록 수요가 많다는 뜻입니다. 빨간 선은 시도 전체 값(제공되는 달만)이며, 데이터는 매월 16일에 전월 기준으로 갱신됩니다.</p>
  <div class="table-wrap">
    <table id="table" hidden>
      <thead><tr><th>순위</th><th>시군구</th><th>지수</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
""",
    r"""
    const areas = __AREAS__;
    const indicators = __INDICATORS__;
    const table = document.querySelector("#table");
    const baseYm = document.querySelector("#baseYm");
    const area = document.querySelector("#area");
    const indicator = document.querySelector("#indicator");

    for (const [code, name] of Object.entries(areas)) {
      addText(area, "option", name).value = code;
    }
    const groups = { "11": "관광 서비스 수요", "12": "문화 자원 수요" };
    for (const [prefix, label] of Object.entries(groups)) {
      const group = document.createElement("optgroup");
      group.label = label;
      for (const [code, name] of Object.entries(indicators)) {
        if (code.startsWith(prefix)) addText(group, "option", name).value = code;
      }
      indicator.append(group);
    }

    // 매월 16일에 전월 데이터가 올라오므로 그 전에는 전전월을 기본값으로 씁니다.
    const today = new Date();
    const latest = new Date(today.getFullYear(), today.getMonth() - (today.getDate() >= 16 ? 1 : 2), 1);
    baseYm.value = `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, "0")}`;
    baseYm.max = baseYm.value;

    async function load() {
      startLoading();
      table.hidden = true;
      const body = table.querySelector("tbody");
      body.replaceChildren();
      try {
        const params = new URLSearchParams({
          baseYm: baseYm.value.replace("-", ""),
          area: area.value,
          indicator: indicator.value
        });
        const data = await getJson(`/api/demand?${params}`);
        if (!data.rows.length) {
          status.textContent = "해당 월의 데이터가 없습니다. 이전 달을 선택해 보세요.";
          return;
        }
        const max = Math.max(...data.rows.map(row => row.value), data.areaTotal || 0);
        data.rows.forEach((row, index) => {
          const tr = addText(body, "tr", "");
          addText(tr, "td", index + 1).className = "rank";
          addText(tr, "td", row.name).className = "name";
          addText(tr, "td", row.value.toFixed(2)).className = "value";
          const bar = addText(addText(tr, "td", ""), "div", "");
          bar.className = "bar";
          addText(bar, "span", "").style.width = `${(row.value / max) * 100}%`;
          if (data.areaTotal !== null) {
            addText(bar, "i", "").style.left = `${(data.areaTotal / max) * 100}%`;
          }
        });
        const total = data.areaTotal !== null ? ` · 시도 전체 ${data.areaTotal.toFixed(2)}` : "";
        status.textContent = `${data.baseYm.slice(0, 4)}년 ${data.baseYm.slice(4)}월 ${data.areaName} ${data.indicatorName} · ${data.rows.length}개 시군구${total}`;
        table.hidden = false;
      } catch (exception) {
        showError(exception);
      }
    }

    document.querySelector("#search").addEventListener("click", load);
    for (const control of [baseYm, area, indicator]) control.addEventListener("change", load);
    load();
""".replace(
        "__AREAS__", json.dumps(DEMAND_AREAS, ensure_ascii=False)
    ).replace(
        "__INDICATORS__", json.dumps(DEMAND_INDICATORS, ensure_ascii=False)
    ),
    listing=False,
)


AREA_PAGE = _build_page(
    "/area",
    "지역 안전 종합",
    "지역을 고르면 응급의료기관, 지진해일대피소, 관광지 수용인원, 관광 수요를 한 화면에 모아 보여줍니다.",
    r"""
  <div class="toolbar">
    <select id="area" aria-label="시도"></select>
    <label for="gungu">시군구</label>
    <input id="gungu" type="search" placeholder="예: 강릉 (비우면 시도 전체)">
    <button id="search">조회</button>
    <button id="nearby" type="button">내 위치 주변 찾기</button>
  </div>
  <p class="note">거리는 직선거리입니다. 응급의료기관 데이터에는 좌표가 없어 거리 대신 같은 시군구 기준으로 보여줍니다. 출처: 한국문화정보원 관광지 안전정보(응급의료기관·지진해일대피소), 전국관광지정보표준데이터(관광지·수용인원), 한국관광데이터랩 관광수요지수.</p>
  <div id="report"></div>
""",
    r"""
    const areas = __AREAS__;
    const report = document.querySelector("#report");
    const area = document.querySelector("#area");
    const gungu = document.querySelector("#gungu");
    // 해일대피소는 해안 가까운 관광지에만 의미가 있어 이 거리 안쪽만 보여줍니다.
    const SHELTER_KM = 10;

    for (const [code, name] of Object.entries(areas)) addText(area, "option", name).value = code;
    area.value = "51";

    const number = value => value === null || value === undefined ? "-" : Number(value).toLocaleString("ko-KR");
    const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

    function addStat(parent, value, label) {
      const box = addText(parent, "div", "");
      addText(box, "strong", value);
      addText(box, "span", label);
    }

    // cells에는 문자열이나 DOM 노드를 넣을 수 있습니다.
    function addTable(title, headers, rows, empty) {
      addText(report, "h2", `${title} (${rows.length})`);
      if (!rows.length) {
        addText(report, "p", empty).className = "note";
        return;
      }
      const wrap = addText(report, "div", "");
      wrap.className = "table-wrap";
      const table = addText(wrap, "table", "");
      const head = addText(addText(table, "thead", ""), "tr", "");
      for (const header of headers) addText(head, "th", header);
      const body = addText(table, "tbody", "");
      for (const cells of rows) {
        const tr = addText(body, "tr", "");
        for (const cell of cells) {
          const td = addText(tr, "td", "");
          if (cell instanceof Node) td.append(cell);
          else td.textContent = cell ?? "";
        }
      }
    }

    function placeCell(place, withDistance = false) {
      const cell = document.createElement("div");
      if (!place) {
        cell.textContent = "-";
        return cell;
      }
      addText(cell, "div", place.name);
      if (withDistance) addText(cell, "div", `${place.distanceKm}km`);
      const link = mapLink(place.name, place.lat, place.lon);
      if (link) cell.append(link);
      return cell;
    }

    function renderHospitals(rows, title = "응급의료기관") {
      addTable(title, ["이름", "구분", "전화", "주소"],
        rows.map(row => [row.name, row.kind, row.contact, row.address]),
        "이 지역의 응급의료기관 데이터가 없습니다.");
    }

    function renderShelters(rows, withDistance = false) {
      addTable("지진해일대피소", ["이름", "유형", "수용인원", "해발(m)", "운영"].concat(withDistance ? ["거리"] : []),
        rows.map(row => [
          placeCell(row), row.shelterType, number(row.capacity), row.altitude || "-",
          row.operating === "Y" ? "운영" : row.operating || "-"
        ].concat(withDistance ? [`${row.distanceKm}km`] : [])),
        "지진해일대피소는 해안 지역에만 지정되어 있어 이 지역에는 데이터가 없습니다.");
    }

    function renderDemand(data) {
      addText(report, "h2", "관광 서비스 수요지수");
      if (!data.demand) {
        addText(report, "p", data.demandError || "최근 두 달의 수요지수 데이터가 없습니다.").className = "note";
        return;
      }
      const { demand } = data;
      const month = `${demand.baseYm.slice(0, 4)}년 ${demand.baseYm.slice(4)}월`;
      addText(report, "p", `${month} 기준 · 지수가 높을수록 사람이 몰리는 지역입니다. 빨간 선은 시도 전체 값입니다.`).className = "note";
      const wrap = addText(report, "div", "");
      wrap.className = "table-wrap";
      const body = addText(addText(wrap, "table", ""), "tbody", "");
      const max = Math.max(...demand.rows.map(row => row.value), demand.areaTotal || 0);
      for (const row of demand.rows) {
        const tr = addText(body, "tr", "");
        if (row.selected) tr.className = "selected";
        addText(tr, "td", row.rank).className = "rank";
        addText(tr, "td", row.name).className = "name";
        addText(tr, "td", row.value.toFixed(2)).className = "value";
        const bar = addText(addText(tr, "td", ""), "div", "");
        bar.className = "bar";
        addText(bar, "span", "").style.width = `${(row.value / max) * 100}%`;
        if (demand.areaTotal !== null) addText(bar, "i", "").style.left = `${(demand.areaTotal / max) * 100}%`;
      }
    }

    async function load() {
      startLoading();
      report.replaceChildren();
      try {
        const params = new URLSearchParams({ area: area.value, gungu: gungu.value.trim() });
        const data = await getJson(`/api/area?${params}`);
        const place = `${data.areaName}${data.gungu ? ` ${data.gungu}` : ""}`;
        status.textContent = `${place} 안전 요약`;

        const stats = addText(report, "div", "");
        stats.className = "stats";
        addStat(stats, `${data.hospitals.length}곳`, "응급의료기관");
        addStat(stats, `${data.shelters.length}곳`, `지진해일대피소 · 수용 ${number(sum(data.shelters, "capacity"))}명`);
        addStat(stats, `${data.spots.length}곳`, `관광지 · 수용 ${number(sum(data.spots, "capacity"))}명`);
        const uncovered = data.spots.filter(spot => !spot.districtHospitals).length;
        addStat(stats, `${uncovered}곳`, "시군구 안에 응급의료기관이 없는 관광지");
        const selected = data.demand && data.demand.rows.find(row => row.selected);
        if (selected) addStat(stats, selected.value.toFixed(2), `관광수요지수 · ${data.demand.rows.length}곳 중 ${selected.rank}위`);

        addTable("관광지별 응급의료기관·대피소",
          ["관광지", "구분", "수용인원", "같은 시군구 응급의료기관", `${SHELTER_KM}km 안 가까운 대피소`],
          data.spots.map(spot => [
            placeCell(spot), spot.kind, number(spot.capacity),
            spot.districtHospitals ? `${spot.districtHospitals}곳` : Object.assign(document.createElement("span"), { className: "far", textContent: "없음" }),
            placeCell(spot.nearestShelter && spot.nearestShelter.distanceKm <= SHELTER_KM ? spot.nearestShelter : null, true)
          ]),
          "이 지역의 관광지 데이터가 없습니다.");
        renderHospitals(data.hospitals);
        renderShelters(data.shelters);
        renderDemand(data);
      } catch (exception) {
        showError(exception);
      }
    }

    function loadNearby() {
      if (!navigator.geolocation) {
        showError(new Error("이 브라우저에서는 위치 정보를 쓸 수 없습니다."));
        return;
      }
      startLoading();
      report.replaceChildren();
      status.textContent = "현재 위치를 확인하는 중...";
      navigator.geolocation.getCurrentPosition(async position => {
        try {
          const { latitude, longitude } = position.coords;
          const params = new URLSearchParams({ lat: latitude, lon: longitude });
          const data = await getJson(`/api/nearby?${params}`);
          status.textContent = `내 위치(${latitude.toFixed(4)}, ${longitude.toFixed(4)}) 주변 가까운 순`;
          renderShelters(data.shelters, true);
          renderHospitals(data.hospitals, `${data.district || "가까운 시군구"} 응급의료기관`);
          addTable("관광지", ["이름", "구분", "수용인원", "거리"],
            data.spots.map(spot => [placeCell(spot), spot.kind, number(spot.capacity), `${spot.distanceKm}km`]),
            "주변 관광지 데이터가 없습니다.");
        } catch (exception) {
          showError(exception);
        }
      }, () => showError(new Error("위치 권한이 거부되었거나 위치를 확인하지 못했습니다.")));
    }

    document.querySelector("#search").addEventListener("click", load);
    document.querySelector("#nearby").addEventListener("click", loadNearby);
    gungu.addEventListener("keydown", event => { if (event.key === "Enter") load(); });
    area.addEventListener("change", load);
    load();
""".replace("__AREAS__", json.dumps(DEMAND_AREAS, ensure_ascii=False)),
    listing=False,
)


WEATHER_PAGE = _build_page(
    "/weather",
    "날씨 맞춤 추천",
    "방문할 곳의 날씨·특보·미세먼지를 보고 실내·야외 중 어디가 좋을지 알려 줍니다. 어르신·아이와 함께면 기준을 더 엄격하게 봅니다.",
    r"""
  <div class="toolbar">
    <label for="wsido">시도</label>
    <select id="wsido"></select>
    <label for="wgungu">시군구</label>
    <select id="wgungu"></select>
    <button id="locate" type="button">내 위치</button>
  </div>
  <details class="note">
    <summary>위도·경도 직접 입력</summary>
    <div class="toolbar">
      <label for="lat">위도</label>
      <input id="lat" inputmode="decimal" size="8">
      <label for="lon">경도</label>
      <input id="lon" inputmode="decimal" size="8">
    </div>
    <p>시군구를 고르면 시청·군청 부근 좌표가 자동으로 들어갑니다. 관광지 좌표를 넣으면 그 자리의 5km 격자 예보를 봅니다.</p>
  </details>
  <div class="toolbar">
    <label for="visit">방문일</label>
    <input id="visit" type="date">
    <select id="party" aria-label="일행">
      <option value="">일반 일행</option>
      <option value="senior,child">어르신·아이 동반</option>
    </select>
    <button id="search">조회</button>
  </div>
  <p class="note">출처: 기상청 단기예보·중기예보·기상특보 조회서비스, 한국환경공단 에어코리아 대기오염정보(공공데이터포털). 판단 기준은 팀 기준(안)이며 기상청·환경부 공식 기준이 아닙니다. 예보는 1시간 동안 저장해 두고 씁니다.</p>
  <div id="report"></div>
""",
    r"""
    // 시도 → [[시군구, 위도, 경도], ...] (tourapi/sigungu.py)
    const sigungu = __SIGUNGU__;
    const report = document.querySelector("#report");
    const wsido = document.querySelector("#wsido");
    const wgungu = document.querySelector("#wgungu");
    const lat = document.querySelector("#lat");
    const lon = document.querySelector("#lon");
    const visit = document.querySelector("#visit");
    const party = document.querySelector("#party");

    for (const name of Object.keys(sigungu)) addText(wsido, "option", name).value = name;

    // 시도를 바꾸면 그 시도의 시군구만 다시 채웁니다.
    function fillGungu(selected) {
      wgungu.replaceChildren();
      for (const [name] of sigungu[wsido.value]) addText(wgungu, "option", name).value = name;
      if (selected) wgungu.value = selected;
      applyGungu();
    }

    // 고른 시군구의 대표 좌표를 위도·경도 칸에 넣습니다.
    function applyGungu() {
      const row = sigungu[wsido.value].find(([name]) => name === wgungu.value);
      if (row) [, lat.value, lon.value] = row;
    }

    const pad = n => String(n).padStart(2, "0");
    const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    visit.value = visit.min = isoDate(today);
    visit.max = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10));

    wsido.value = "충북";
    fillGungu("청주시");

    const temp = v => v === null || v === undefined ? "-" : `${Number(v)}℃`;
    const percent = v => v === null || v === undefined ? "-" : `${Number(v)}%`;
    function dayLabel(key) {
      const d = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
      return `${d.getMonth() + 1}월 ${d.getDate()}일(${"일월화수목금토"[d.getDay()]})`;
    }
    const issuedLabel = text => {
      const s = String(text || "").replace(/\D/g, "");
      return s.length >= 12 ? `${s.slice(4, 6)}월 ${s.slice(6, 8)}일 ${s.slice(8, 10)}:${s.slice(10, 12)} 발표` : "";
    };

    function addStat(parent, value, label) {
      const box = addText(parent, "div", "");
      addText(box, "strong", value);
      addText(box, "span", label);
    }

    function addSection(title, source) {
      const section = addText(report, "section", "");
      addText(section, "h2", title);
      if (source) addText(section, "p", source).className = "note";
      return section;
    }

    function addTable(parent, headers, rows, selectedIndex = -1) {
      const wrap = addText(parent, "div", "");
      wrap.className = "table-wrap";
      const table = addText(wrap, "table", "");
      const head = addText(addText(table, "thead", ""), "tr", "");
      for (const header of headers) addText(head, "th", header);
      const body = addText(table, "tbody", "");
      rows.forEach((cells, index) => {
        const tr = addText(body, "tr", "");
        if (index === selectedIndex) tr.className = "selected";
        for (const cell of cells) addText(tr, "td", cell ?? "-");
      });
    }

    function addList(parent, items, empty) {
      if (!items || !items.length) {
        addText(parent, "p", empty).className = "note";
        return;
      }
      const list = addText(parent, "ul", "");
      for (const item of items) addText(list, "li", item);
    }

    function sectionError(section, result) {
      if (result.status === "fulfilled") return false;
      addText(section, "p", result.reason.message).className = "far";
      return true;
    }

    function renderRecommend(result) {
      const section = addSection("추천", null);
      if (sectionError(section, result)) return;
      const data = result.value;
      const rec = data.recommend;
      const stats = addText(section, "div", "");
      stats.className = "stats";
      addStat(stats, rec.modeLabel, `${dayLabel(data.date.replace(/-/g, ""))} · ${data.strict ? "어르신·아이 동반 기준" : "일반 기준"}`);
      if (data.forecast) {
        addStat(stats, `${temp(data.forecast.tmin)} / ${temp(data.forecast.tmax)}`, `최저 / 최고 · ${data.forecast.source}`);
        addStat(stats, percent(data.forecast.pop), `강수확률 · ${data.forecast.sky || "하늘 정보 없음"}`);
      }
      if (data.air) addStat(stats, data.air.worstLabel, "미세먼지(시도 측정소 중 가장 나쁜 등급)");
      addText(section, "h3", "이유");
      addList(section, rec.reasons, "특별히 조심할 날씨가 없습니다.");
      if (rec.tips.length) addText(section, "p", `챙길 것: ${rec.tips.join(", ")}`);
      if (rec.excludeOutdoor.length) addText(section, "p", `추천에서 빼는 야외 장소: ${rec.excludeOutdoor.join(", ")}`).className = "far";
      if (data.notice) addText(section, "p", data.notice).className = "note";
      const failed = Object.keys(data.errors || {});
      if (failed.length) addText(section, "p", `일부 자료를 불러오지 못했습니다: ${failed.join(", ")}`).className = "note";
    }

    function renderShort(result, visitKey) {
      const section = addSection("① 단기예보 조회서비스", "기상청 · 초단기실황(지금) + 단기예보(오늘~3일 뒤, 5km 격자)");
      if (sectionError(section, result)) return;
      const data = result.value;
      const stats = addText(section, "div", "");
      stats.className = "stats";
      addStat(stats, temp(data.now.temp), `지금 기온 · 격자 (${data.grid.join(", ")})`);
      addStat(stats, data.now.precipType, `강수 형태 · 1시간 강수량 ${data.now.rain1h ?? "-"}mm`);
      const keys = Object.keys(data.days).sort();
      addText(section, "p", `${issuedLabel(data.issued)} 단기예보`).className = "note";
      addTable(section, ["날짜", "하늘", "강수확률(최대)", "비·눈", "최저", "최고"],
        keys.map(k => { const d = data.days[k]; return [dayLabel(k), d.sky, percent(d.pop), d.precip.join(", ") || "없음", temp(d.tmin), temp(d.tmax)]; }),
        keys.indexOf(visitKey));
    }

    function renderMid(result, visitKey) {
      const section = addSection("② 중기예보 조회서비스", "기상청 · 4~10일 뒤 육상예보(강수확률·하늘)와 기온");
      if (sectionError(section, result)) return;
      const data = result.value;
      const keys = Object.keys(data.days).sort();
      addText(section, "p", `${issuedLabel(data.issued)} 중기예보 · 육상 ${data.landRegId}, 기온 ${data.taRegId}`).className = "note";
      if (!keys.length) {
        addText(section, "p", "중기예보 자료가 없습니다.").className = "note";
        return;
      }
      addTable(section, ["날짜", "하늘(오전 / 오후)", "강수확률", "최저", "최고"],
        keys.map(k => { const d = data.days[k]; return [dayLabel(k), d.sky, percent(d.pop), temp(d.tmin), temp(d.tmax)]; }),
        keys.indexOf(visitKey));
    }

    function renderWarnings(result) {
      const section = addSection("③ 기상특보 조회서비스", "기상청 · 지금 발효 중인 특보(오늘·내일 추천에만 씁니다)");
      if (sectionError(section, result)) return;
      const data = result.value;
      addText(section, "h3", data.matchedBy === "시군구" ? `${wgungu.value.trim()}에 발효 중` : `${wsido.value} 전체에 발효 중`);
      addList(section, data.active, "발효 중인 특보가 없습니다.");
      addText(section, "h3", `${wsido.value}의 다른 지역 (추천 판단에는 쓰지 않음)`);
      addList(section, data.elsewhereInSido, "없습니다.");
      if (data.matchedBy !== "시군구") addText(section, "p", "시군구를 넣으면 그 지역 특보만 골라 판단합니다.").className = "note";
    }

    function renderAir(result) {
      const section = addSection("④ 에어코리아 대기오염정보", "한국환경공단 · 시도 측정소 실시간 미세먼지(PM10·PM2.5)");
      if (sectionError(section, result)) return;
      const data = result.value;
      const stats = addText(section, "div", "");
      stats.className = "stats";
      addStat(stats, data.worstLabel, `가장 나쁜 등급 · 측정소 ${data.stations}곳`);
      addStat(stats, data.pm10Median ?? "-", "PM10 중앙값(㎍/㎥)");
      addStat(stats, data.pm25Median ?? "-", "PM2.5 중앙값(㎍/㎥)");
      if (data.time) addText(section, "p", `${data.time} 측정 · 미세먼지는 실시간 값이라 오늘 방문에만 추천에 씁니다.`).className = "note";
    }

    async function load() {
      startLoading();
      report.replaceChildren();
      const place = { lat: lat.value.trim(), lon: lon.value.trim(), sido: wsido.value };
      const gungu = wgungu.value.trim();
      const visitKey = visit.value.replace(/-/g, "");
      const q = extra => new URLSearchParams({ ...place, ...extra });
      const results = await Promise.allSettled([
        getJson(`/api/weather?${q({ gungu, date: visitKey, with: party.value })}`),
        getJson(`/api/weather/short?${q({})}`),
        getJson(`/api/weather/mid?${q({ gungu })}`),
        getJson(`/api/weather/warnings?${new URLSearchParams({ sido: place.sido, gungu })}`),
        getJson(`/api/weather/air?${new URLSearchParams({ sido: place.sido })}`)
      ]);
      status.textContent = "";
      addText(report, "p", `${place.sido} ${gungu} (${place.lat}, ${place.lon}) · ${dayLabel(visitKey)} 방문`).className = "note";
      renderRecommend(results[0]);
      renderShort(results[1], visitKey);
      renderMid(results[2], visitKey);
      renderWarnings(results[3]);
      renderAir(results[4]);
    }

    function locate() {
      if (!navigator.geolocation) {
        showError(new Error("이 브라우저에서는 위치 정보를 쓸 수 없습니다."));
        return;
      }
      status.textContent = "현재 위치를 확인하는 중...";
      navigator.geolocation.getCurrentPosition(position => {
        const y = position.coords.latitude, x = position.coords.longitude;
        // 대표 좌표가 가장 가까운 시군구를 골라 시도·시군구를 맞춥니다(특보·미세먼지 판단용).
        let best = null;
        for (const [sido, rows] of Object.entries(sigungu)) {
          for (const [name, la, lo] of rows) {
            const d = (la - y) ** 2 + ((lo - x) * Math.cos(y * Math.PI / 180)) ** 2;
            if (!best || d < best.d) best = { sido, name, d };
          }
        }
        wsido.value = best.sido;
        fillGungu(best.name);
        lat.value = y.toFixed(4);
        lon.value = x.toFixed(4);
        load();
      }, () => showError(new Error("위치 권한이 거부되었거나 위치를 확인하지 못했습니다.")));
    }

    wsido.addEventListener("change", () => { fillGungu(); load(); });
    wgungu.addEventListener("change", () => { applyGungu(); load(); });
    for (const input of [lat, lon]) input.addEventListener("keydown", event => { if (event.key === "Enter") load(); });
    document.querySelector("#search").addEventListener("click", load);
    document.querySelector("#locate").addEventListener("click", locate);
    load();
""".replace("__SIGUNGU__", json.dumps(SIGUNGU, ensure_ascii=False)),
    listing=False,
)


ACCESS_PAGE = _build_page(
    "/access",
    "일행 맞춤 무장애 정보",
    "어르신·아이·휠체어·유아차와 함께 갈 때 필요한 편의시설(주차·엘리베이터·화장실·유아차 대여 등) 정보가 있는 관광지를 가까운 곳부터 보여 줍니다.",
    r"""
  <div class="toolbar">
    <label for="asido">시도</label>
    <select id="asido"></select>
    <label for="agungu">시군구</label>
    <select id="agungu"></select>
    <button id="alocate" type="button">내 위치</button>
  </div>
  <details class="note">
    <summary>위도·경도 직접 입력</summary>
    <div class="toolbar">
      <label for="alat">위도</label>
      <input id="alat" inputmode="decimal" size="8">
      <label for="alon">경도</label>
      <input id="alon" inputmode="decimal" size="8">
    </div>
    <p>시군구를 고르면 시청·군청 부근 좌표가 자동으로 들어갑니다.</p>
  </details>
  <div class="toolbar" role="group" aria-label="일행 구성">
    <span>함께 가는 사람</span>
    <label><input type="checkbox" name="with" value="senior" checked> 어르신</label>
    <label><input type="checkbox" name="with" value="child"> 아이</label>
    <label><input type="checkbox" name="with" value="wheelchair"> 휠체어</label>
    <label><input type="checkbox" name="with" value="stroller"> 유아차</label>
    <label for="aradius">반경</label>
    <select id="aradius">
      <option value="3000">3km</option>
      <option value="5000" selected>5km</option>
      <option value="10000">10km</option>
      <option value="20000">20km</option>
    </select>
    <button id="asearch">조회</button>
  </div>
  <p class="note">출처: 한국관광공사 무장애 여행정보(KorWithService2) 위치기반 목록·무장애 상세정보(공공데이터포털). '맞는 정도'는 일행에게 필요한 시설 중 관광공사에 정보가 등록된 비율이며, 시설이 실제로 갖춰졌는지를 보장하지 않습니다. 결과는 6시간 동안 저장해 두고 씁니다.</p>
  <div id="report"></div>
  <div id="adetail"></div>
""",
    r"""
    // 시도 → [[시군구, 위도, 경도], ...] (tourapi/sigungu.py)
    const sigungu = __SIGUNGU__;
    const report = document.querySelector("#report");
    const detail = document.querySelector("#adetail");
    const asido = document.querySelector("#asido");
    const agungu = document.querySelector("#agungu");
    const alat = document.querySelector("#alat");
    const alon = document.querySelector("#alon");
    const aradius = document.querySelector("#aradius");

    for (const name of Object.keys(sigungu)) addText(asido, "option", name).value = name;

    // 시도를 바꾸면 그 시도의 시군구만 다시 채웁니다.
    function fillGungu(selected) {
      agungu.replaceChildren();
      for (const [name] of sigungu[asido.value]) addText(agungu, "option", name).value = name;
      if (selected) agungu.value = selected;
      applyGungu();
    }

    // 고른 시군구의 대표 좌표를 위도·경도 칸에 넣습니다.
    function applyGungu() {
      const row = sigungu[asido.value].find(([name]) => name === agungu.value);
      if (row) [, alat.value, alon.value] = row;
    }

    asido.value = "충북";
    fillGungu("청주시");

    const party = () => [...document.querySelectorAll('input[name="with"]:checked')].map(box => box.value);

    function addTable(parent, headers, rows) {
      const wrap = addText(parent, "div", "");
      wrap.className = "table-wrap";
      const table = addText(wrap, "table", "");
      const head = addText(addText(table, "thead", ""), "tr", "");
      for (const header of headers) addText(head, "th", header);
      const body = addText(table, "tbody", "");
      return rows.map(cells => {
        const tr = addText(body, "tr", "");
        return cells.map(cell => addText(tr, "td", cell ?? "-"));
      });
    }

    async function showDetail(place) {
      detail.replaceChildren();
      const section = addText(detail, "section", "");
      addText(section, "h2", `${place.title} 무장애 정보`);
      addText(section, "p", place.address || "").className = "note";
      const wait = addText(section, "p", "불러오는 중...");
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        const data = await getJson(`/api/access/detail?${new URLSearchParams({ contentId: place.contentId })}`);
        wait.remove();
        const keys = Object.keys(data.available);
        if (!keys.length) {
          addText(section, "p", "관광공사에 등록된 무장애 정보가 없습니다.").className = "note";
          return;
        }
        addTable(section, ["항목", "내용"], keys.map(key => [data.labels[key] || key, cleanText(data.available[key])]));
      } catch (exception) {
        wait.textContent = exception.message;
        wait.className = "far";
      }
    }

    async function load() {
      startLoading();
      report.replaceChildren();
      detail.replaceChildren();
      const params = new URLSearchParams({
        lat: alat.value.trim(), lon: alon.value.trim(), radius: aradius.value, with: party().join(",")
      });
      try {
        const data = await getJson(`/api/access/nearby?${params}`);
        status.textContent = "";
        const who = data.needs.length ? data.needs.join("·") : "일행 조건 없음";
        addText(report, "p", `${asido.value} ${agungu.value} (${alat.value}, ${alon.value}) 반경 ${data.radiusM / 1000}km · ${who}`).className = "note";
        if (!data.places.length) {
          addText(report, "p", "이 반경 안에 무장애 정보가 등록된 관광지가 없습니다. 반경을 넓혀 보세요.").className = "note";
          return;
        }
        const withNeeds = data.needs.length > 0;
        const rows = addTable(report, ["관광지", "거리", "맞는 정도", "정보가 있는 시설", "정보가 없는 시설"],
          data.places.map(p => [
            p.title,
            `${p.distanceKm}km`,
            p.fitScore === null ? "-" : `${p.fitScore}%`,
            (withNeeds ? p.fitHave : p.facilities).join(", ") || "없음",
            withNeeds ? (p.fitMissing.join(", ") || "없음") : "-"
          ]));
        rows.forEach((cells, index) => {
          const place = data.places[index];
          cells[0].replaceChildren();
          const button = addText(cells[0], "button", place.title);
          button.type = "button";
          button.addEventListener("click", () => showDetail(place));
        });
        addText(report, "p", `관광지 이름을 누르면 등록된 무장애 정보를 모두 볼 수 있습니다. ${data.note}`).className = "note";
        const failed = Object.keys(data.errors || {});
        if (failed.length) addText(report, "p", `${failed.length}곳의 상세 정보를 불러오지 못했습니다.`).className = "note";
      } catch (exception) {
        showError(exception);
      }
    }

    function locate() {
      if (!navigator.geolocation) {
        showError(new Error("이 브라우저에서는 위치 정보를 쓸 수 없습니다."));
        return;
      }
      status.textContent = "현재 위치를 확인하는 중...";
      navigator.geolocation.getCurrentPosition(position => {
        const y = position.coords.latitude, x = position.coords.longitude;
        // 대표 좌표가 가장 가까운 시군구를 골라 시도·시군구를 맞춥니다.
        let best = null;
        for (const [sido, rows] of Object.entries(sigungu)) {
          for (const [name, la, lo] of rows) {
            const d = (la - y) ** 2 + ((lo - x) * Math.cos(y * Math.PI / 180)) ** 2;
            if (!best || d < best.d) best = { sido, name, d };
          }
        }
        asido.value = best.sido;
        fillGungu(best.name);
        alat.value = y.toFixed(4);
        alon.value = x.toFixed(4);
        load();
      }, () => showError(new Error("위치 권한이 거부되었거나 위치를 확인하지 못했습니다.")));
    }

    asido.addEventListener("change", () => { fillGungu(); load(); });
    agungu.addEventListener("change", () => { applyGungu(); load(); });
    aradius.addEventListener("change", load);
    for (const box of document.querySelectorAll('input[name="with"]')) box.addEventListener("change", load);
    for (const input of [alat, alon]) input.addEventListener("keydown", event => { if (event.key === "Enter") load(); });
    document.querySelector("#asearch").addEventListener("click", load);
    document.querySelector("#alocate").addEventListener("click", locate);
    load();
""".replace("__SIGUNGU__", json.dumps(SIGUNGU, ensure_ascii=False)),
    listing=False,
)


PAGES = {
    "/": HOME_PAGE,
    "/area": AREA_PAGE,
    "/weather": WEATHER_PAGE,
    "/access": ACCESS_PAGE,
    "/safety": SAFETY_PAGE,
    "/tourspot": TOURSPOT_PAGE,
    "/demand": DEMAND_PAGE,
    "/pet": _place_page("pet"),
    "/medical": MEDICAL_PAGE,
}


# ---------------------------------------------------------------------------
# 웹 서버
# ---------------------------------------------------------------------------

def _page_no(param):
    page_no = int(param("page") or "1")
    if page_no < 1:
        raise ValueError("페이지 번호는 1 이상이어야 합니다.")
    return page_no


API_ROUTES = {
    "/api/medical": lambda param: fetch_medical_tourism(
        page_no=_page_no(param),
        num_of_rows=10,
        keyword=param("keyword") or None,
    ),
    "/api/medical/detail": lambda param: fetch_medical_details(param("contentId")),
    "/api/safety": lambda param: fetch_tour_safety(
        page_no=_page_no(param),
        num_of_rows=10,
        sido=param("sido") or None,
        gungu=param("gungu") or None,
    ),
    "/api/tourspots": lambda param: search_tourspots(
        page_no=_page_no(param),
        region=param("region") or None,
        keyword=param("keyword") or None,
        category=param("category") or None,
    ),
    "/api/demand": lambda param: fetch_demand(
        base_ym=param("baseYm"),
        area_cd=param("area"),
        indicator=param("indicator") or "11",
    ),
    "/api/area": lambda param: fetch_area_safety(param("area"), param("gungu") or None),
    "/api/nearby": lambda param: fetch_nearby(param("lat"), param("lon")),
    "/api/map/places": lambda param: fetch_map_places(param("province") or None),
    "/api/db/status": lambda param: fetch_db_status(),
}
for _service in ("pet",):
    API_ROUTES.update({
        f"/api/{_service}/regions": lambda param, s=_service: {"items": fetch_regions(s)},
        f"/api/{_service}/places": lambda param, s=_service: fetch_places(
            s,
            page_no=_page_no(param),
            keyword=param("keyword") or None,
            region=param("region") or None,
            content_type=param("contentType") or None,
        ),
        f"/api/{_service}/detail": lambda param, s=_service: fetch_place_details(
            s, param("contentId"), param("contentTypeId")
        ),
    })
API_ROUTES.update({"/api/cache/status": fetch_cache_status})
API_ROUTES.update(WEATHER_ROUTES)
API_ROUTES.update(ACCESS_ROUTES)


def _module_cache(db_seconds, keep_seconds):
    """weather.py·barrierfree.py에 넣어 줄 캐시 함수. 두 모듈이 api.py를 import하면 순환 import가
    생기므로, 모듈에는 캐시 함수를 받는 자리(use_cache)만 두고 여기서 _cached를 넣어 줍니다."""
    return lambda name, loader: _cached(name, loader, db_seconds=db_seconds, as_value=True,
                                        keep_seconds=keep_seconds)


# 날씨 1시간, 무장애 6시간 저장. 지난 항목은 날씨 2일, 무장애 7일 뒤 MongoDB가 지웁니다.
weather.use_cache(_module_cache(weather.WEATHER_CACHE_SECONDS, 2 * 24 * 60 * 60))
barrierfree.use_cache(_module_cache(barrierfree.CACHE_SECONDS, 7 * 24 * 60 * 60))


# ---------------------------------------------------------------------------
# 접근 로그: 환경변수 ACCESS_LOG가 있을 때만 요청마다 JSON 한 줄을 logs/access.jsonl에 남깁니다.
# Vercel에는 ACCESS_LOG를 넣지 않아 기록하지 않습니다(파일 시스템이 읽기 전용).
# 쿼리 값(위도·경도·서비스키 등)은 남기지 않고 파라미터 이름만 남깁니다.
# tourapi/fluent-bit/fluent-bit.conf가 이 파일을 읽어 갑니다.
# ---------------------------------------------------------------------------
ACCESS_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "access.jsonl")
_access_log_lock = threading.Lock()


def _access_level(status):
    if status >= 500:
        return "ERROR"
    if status >= 400:
        return "WARN"
    return "INFO"


def _write_access_log(path, query, status, started):
    if not os.environ.get("ACCESS_LOG"):
        return
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(started)),
        "level": _access_level(status),
        "path": path[:200],
        "params": sorted(parse_qs(query, keep_blank_values=True)),
        "status": status,
        "ms": round((time.time() - started) * 1000, 1),
    }
    try:
        with _access_log_lock:
            os.makedirs(os.path.dirname(ACCESS_LOG_PATH), exist_ok=True)
            with open(ACCESS_LOG_PATH, "a", encoding="utf-8") as log_file:
                log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as error:   # 로그를 못 남겨도 응답은 그대로 보냅니다.
        print(f"[접근 로그] 기록 실패: {error}")


class TourRequestHandler(BaseHTTPRequestHandler):
    def _send(self, status_code, body, content_type):
        self._status = status_code
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status_code, body, "application/json; charset=utf-8")

    def do_GET(self):
        started = time.time()
        parsed_url = urlparse(self.path)
        self._status = 500
        try:
            self._handle_get(parsed_url)
        except Exception as error:   # 예상하지 못한 오류도 500으로 응답하고 로그에 남깁니다.
            print(f"[웹 서버] 처리 중 오류: {error!r}")
            try:
                self._send_json(500, {"error": "서버에서 오류가 났습니다. 잠시 후 다시 시도해 주세요."})
            except OSError:
                pass
        finally:
            _write_access_log(parsed_url.path.rstrip("/") or "/", parsed_url.query, self._status, started)

    def _handle_get(self, parsed_url):
        path = parsed_url.path.rstrip("/") or "/"

        if path in PAGES:
            self._send(200, PAGES[path].encode("utf-8"), "text/html; charset=utf-8")
            return

        route = API_ROUTES.get(path)
        if route is None:
            self._send_json(404, {"error": "요청한 페이지를 찾을 수 없습니다."})
            return

        params = parse_qs(parsed_url.query)

        def param(name):
            return params.get(name, [""])[0].strip()

        try:
            result = route(param)
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
        except RuntimeError as error:
            self._send_json(502, {"error": str(error)})
        else:
            self._send_json(200, result)

    def log_message(self, format_string, *args):
        print(f"[웹 서버] {args[0]}")


def run_web_app(path="/"):
    """내 PC에서 웹 서버를 켜고 path 페이지를 브라우저로 엽니다(weather.py local은 path="/weather")."""
    address = ("127.0.0.1", PORT)
    server = ThreadingHTTPServer(address, TourRequestHandler)
    url = f"http://{address[0]}:{address[1]}{path if path != '/' else ''}"
    print(f"{SITE_NAME} 웹 화면: {url}")
    print(f"공유용 링크 (Vercel): {DEPLOY_URL}")
    print("종료하려면 이 창에서 Ctrl+C를 누르세요.")
    # web의 npm run dev:all은 이 환경변수를 켜서 브라우저 창을 띄우지 않는다.
    if not os.environ.get("TOURAPI_NO_BROWSER"):
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n웹 서버를 종료합니다.")
    finally:
        server.server_close()


if __name__ == "__main__":
    if sys.argv[1:] == ["local"]:
        run_web_app()
    else:
        print(f"공유용 링크 (Vercel): {DEPLOY_URL}")
        print("내 PC에서 서버를 직접 켜려면: py api.py local")
        webbrowser.open(DEPLOY_URL)
