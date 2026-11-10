"""TourLink 날씨 맞춤 추천 모듈 (11주차, 추가 기능).

api.py에서 분리한 날씨 전용 파일입니다. api.py에는 두 줄만 추가합니다.

    from weather import WEATHER_ROUTES      # 맨 위 import 아래
    API_ROUTES.update(WEATHER_ROUTES)       # API_ROUTES 정의 바로 아래

쓰는 공공데이터포털 API (모두 같은 서비스키 API_KEY, Decoding 키):
  1. 기상청_단기예보 조회서비스   VilageFcstInfoService_2.0  (초단기실황, 단기예보 ~3일)
  2. 기상청_중기예보 조회서비스   MidFcstInfoService          (4~10일 강수확률·기온)
  3. 기상청_기상특보 조회서비스   WthrWrnInfoService          (호우·태풍·한파 등 특보 현황)
  4. 한국환경공단_에어코리아_대기오염정보  ArpltnInforInqireSvc (시도별 실시간 미세먼지)

웹으로 보기:     py weather.py local          (내 PC 서버를 켜고 /weather 페이지 열기)
                 py weather.py                (배포된 Vercel /weather 페이지 열기)
혼자 점검할 때:  py weather.py check            (청주 기준 4개 API 확인)
                 py weather.py check 37.75 128.90 강원
추천 결과 보기:  py weather.py 36.64 127.49 충북 20261110 senior 청주시
"""
import datetime as dt
import json
import math
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_KEY = os.environ.get("API_KEY", "")
KST = dt.timezone(dt.timedelta(hours=9))

VILAGE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
MID_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService"
WARN_URL = "https://apis.data.go.kr/1360000/WthrWrnInfoService"
AIR_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc"

# 예보는 자주 바뀌지 않으므로 30분 동안 메모리에 둡니다(호출 한도 절약).
WEATHER_CACHE_SECONDS = 60 * 60   # 예보·특보·대기 결과를 1시간 둡니다

# ---------------------------------------------------------------------------
# 판단 기준 (팀 기준안: 보고서 10주차 '날씨 맞춤 추천 규칙(안)')
# ---------------------------------------------------------------------------
# 값은 web/src/config/weatherThresholds.ts와 같아야 합니다(화면과 서버가 같은 기준을 쓰도록).
# 바꿀 때는 두 파일을 함께 고치고, 바꾼 이유를 작업기록에 남깁니다.
RULES = {   # 일반 일행
    "rain_pop": 60,          # RAIN_INDOOR_POP: 강수확률(%) 이상 → 비·눈 예보, 실내만 추천
    "rain_notice_pop": 30,   # RAIN_NOTICE_POP: 강수확률(%) 이상 → '비 소식', 실내 대안을 함께
    "cold_min": -5,          # COLD_MAX_TEMP_C: 최저기온(℃) 이하 → 추운 날, 실내만 추천
    "hot_max": 33,           # HOT_MIN_TEMP_C: 최고기온(℃) 이상 → 더운 날, 실내만 추천
    "dust_grade": 3,         # DUST_INDOOR_GRADE: PM10·PM2.5 등급(3 나쁨) 이상 → 실내만 추천
    "terrain_warnings": ("호우", "태풍", "풍랑"),   # TERRAIN_EXCLUDE_WARNINGS → 바다·산·계곡 제외
}
STRICT = {  # 어르신(60대 이상)이나 아이(10세 미만)가 있는 일행
    "rain_pop": 40,
    "rain_notice_pop": 20,
    "cold_min": 0,
    "hot_max": 30,
    "dust_grade": 3,
    "terrain_warnings": ("호우", "태풍", "풍랑", "강풍", "대설"),
}
FORECAST_RECHECK_DAYS = 3   # 방문일이 이보다 멀면 '출발 2~3일 전에 다시 확인' 안내

# 특보가 나오면 피해야 할 야외 유형
DANGER_WARNINGS = ("호우", "태풍", "풍랑", "강풍", "대설", "폭풍해일", "지진해일")
TEMP_WARNINGS = ("한파", "폭염")

# 시도 → (에어코리아 sidoName, 특보 문구에서 찾을 이름들, 중기육상예보 regId, 중기기온 regId)
# 중기기온 regId는 시도 대표 도시 하나. 10개 시범 지역이 확정되면 지역별로 바꿉니다.
SIDO = {
    "서울": ("서울", ("서울",), "11B00000", "11B10101"),
    "인천": ("인천", ("인천",), "11B00000", "11B20201"),
    "경기": ("경기", ("경기",), "11B00000", "11B20601"),
    "강원": ("강원", ("강원",), "11D10000", "11D10301"),   # 영동은 아래에서 경도로 바꿈
    "대전": ("대전", ("대전",), "11C20000", "11C20401"),
    "세종": ("세종", ("세종",), "11C20000", "11C20401"),
    "충남": ("충남", ("충청남도", "충남"), "11C20000", "11C20401"),
    "충북": ("충북", ("충청북도", "충북"), "11C10000", "11C10301"),
    "광주": ("광주", ("광주", "전남광주"), "11F20000", "11F20501"),
    "전남": ("전남", ("전라남도", "전남", "전남광주"), "11F20000", "11F20501"),
    "전북": ("전북", ("전북", "전라북도"), "11F10000", "11F10201"),
    "대구": ("대구", ("대구",), "11H10000", "11H10701"),
    "경북": ("경북", ("경상북도", "경북"), "11H10000", "11H10701"),
    "부산": ("부산", ("부산",), "11H20000", "11H20201"),
    "울산": ("울산", ("울산",), "11H20000", "11H20101"),
    "경남": ("경남", ("경상남도", "경남"), "11H20000", "11H20201"),
    "제주": ("제주", ("제주",), "11G00000", "11G00201"),
}
GANGWON_EAST = ("11D20000", "11D20501")   # 강원 영동(강릉 등)
# 강원 시군별 중기기온 regId(2026-11-07 getMidTa로 19곳 모두 확인).
# 11D1로 시작하면 영서(육상 11D10000), 11D2로 시작하면 영동(육상 11D20000)입니다.
GANGWON_TA = {
    "철원": "11D10101", "화천": "11D10102", "인제": "11D10201", "양구": "11D10202", "춘천": "11D10301",
    "홍천": "11D10302", "원주": "11D10401", "횡성": "11D10402", "영월": "11D10501", "정선": "11D10502",
    "평창": "11D10503", "태백": "11D20301", "속초": "11D20401", "고성": "11D20402", "양양": "11D20403",
    "강릉": "11D20501", "동해": "11D20601", "삼척": "11D20602",
}

# ---------------------------------------------------------------------------
# 공통 호출 (api.py의 _http_get·_parse_json·_response_items와 같은 방식)
# ---------------------------------------------------------------------------
_cache = {}
_cache_lock = threading.Lock()
_store = None   # api.py가 use_cache()로 넣어 주는 캐시 함수(메모리 + MongoDB)


def use_cache(store):
    """api.py에서 store(name, loader)를 넣어 주면 결과를 MongoDB(tourlink DB)에도 저장합니다.

    순환 import를 피하려고 이 모듈은 api.py를 import하지 않습니다. 넣어 주지 않으면
    (py weather.py check 등) 아래 메모리 캐시만 씁니다.
    """
    global _store
    _store = store


def _cached(key, loader):
    """저장 이름은 weather_ + 요청 값(격자·발표 시각·지역 코드 등)입니다."""
    if _store is not None:
        return _store(f"weather_{key}", loader)
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.time() - entry[1] < WEATHER_CACHE_SECONDS:
            return entry[0]
    value = loader()
    with _cache_lock:
        _cache[key] = (value, time.time())
    return value


def _call(url, params, label):
    """공공데이터포털 API를 호출해 item 목록을 돌려줍니다. 자료 없음(03)은 빈 목록."""
    if not API_KEY.strip():
        raise ValueError("환경변수 API_KEY에 공공데이터포털 인증키(Decoding)를 넣어 주세요.")
    query = urlencode({"serviceKey": API_KEY.strip(), **params})
    request = Request(f"{url}?{query}", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            text = response.read().decode("utf-8")
    except HTTPError as error:
        raise RuntimeError(f"{label} API가 HTTP {error.code}을(를) 반환했습니다.") from error
    except URLError as error:
        raise RuntimeError(f"{label} API 연결에 실패했습니다: {error}") from error
    if text.lstrip().startswith("<"):
        # 키 미등록·호출 한도 초과는 JSON 요청에도 XML로 옵니다.
        raise RuntimeError(f"{label} API 오류: {text[:200]}")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{label} API 응답을 JSON으로 해석하지 못했습니다.") from error
    header = payload.get("response", {}).get("header", {})
    code = str(header.get("resultCode", ""))
    if code == "03":
        return []
    if code not in ("00", "0000"):
        raise RuntimeError(f"{label} API 오류 {code}: {header.get('resultMsg', '응답 메시지 없음')}")
    items = payload["response"].get("body", {}).get("items") or {}
    items = items.get("item", []) if isinstance(items, dict) else items
    return items if isinstance(items, list) else [items]


# ---------------------------------------------------------------------------
# 좌표·발표 시각
# ---------------------------------------------------------------------------
def latlon_to_grid(lat, lon):
    """위경도 → 단기예보 격자(nx, ny). 기상청 Lambert 정각원추 변환식."""
    re_, grid, slat1, slat2, olon, olat, xo, yo = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    d = math.pi / 180.0
    re_ = re_ / grid
    slat1, slat2, olon, olat = slat1 * d, slat2 * d, olon * d, olat * d
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(
        math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5))
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5) ** sn * math.cos(slat1) / sn
    ro = re_ * sf / math.tan(math.pi * 0.25 + olat * 0.5) ** sn
    ra = re_ * sf / math.tan(math.pi * 0.25 + lat * d * 0.5) ** sn
    theta = (lon * d - olon + math.pi) % (2 * math.pi) - math.pi
    theta *= sn
    return int(ra * math.sin(theta) + xo + 0.5), int(ro - ra * math.cos(theta) + yo + 0.5)


def _vilage_base(now):
    """단기예보 발표(02·05·…·23시, 10분 뒤 조회 가능) 중 가장 최근."""
    t = now - dt.timedelta(minutes=10)
    for hour in (23, 20, 17, 14, 11, 8, 5, 2):
        if t.hour >= hour:
            return t.strftime("%Y%m%d"), f"{hour:02d}00"
    return (t - dt.timedelta(days=1)).strftime("%Y%m%d"), "2300"


def _ncst_base(now):
    """초단기실황: 매시 정각 자료, 40분 뒤부터 조회 가능."""
    t = now - dt.timedelta(minutes=40)
    return t.strftime("%Y%m%d"), t.strftime("%H00")


def _mid_tmfc(now):
    """중기예보 발표(06·18시) 중 가장 최근. 발표 직후 반영이 늦어 30분 여유를 둡니다."""
    t = now - dt.timedelta(minutes=30)
    if t.hour >= 18:
        return t.strftime("%Y%m%d1800")
    if t.hour >= 6:
        return t.strftime("%Y%m%d0600")
    return (t - dt.timedelta(days=1)).strftime("%Y%m%d1800")


def _sido_info(sido, lon, gungu=""):
    if sido not in SIDO:
        raise ValueError(f"시도 이름이 올바르지 않습니다: {sido} (예: 서울, 강원, 충북, 제주)")
    air_name, names, land_id, ta_id = SIDO[sido]
    if sido == "강원":
        ta = GANGWON_TA.get(_gungu_key(gungu))
        if ta:   # 시군을 알면 그 시군의 기온과 영서·영동 구역을 씁니다
            land_id, ta_id = ("11D20000" if ta.startswith("11D2") else "11D10000"), ta
        elif lon >= 128.4:   # 시군을 모르면 경도로 나눕니다(대관령 동쪽은 영동)
            land_id, ta_id = GANGWON_EAST
    return air_name, names, land_id, ta_id


# ---------------------------------------------------------------------------
# API별 조회
# ---------------------------------------------------------------------------
def fetch_now(nx, ny, now):
    d, t = _ncst_base(now)
    items = _cached(f"ncst_{nx}_{ny}_{d}{t}", lambda: _call(
        f"{VILAGE_URL}/getUltraSrtNcst",
        {"pageNo": 1, "numOfRows": 20, "dataType": "JSON", "base_date": d, "base_time": t, "nx": nx, "ny": ny},
        "초단기실황"))
    values = {i["category"]: i["obsrValue"] for i in items}
    return {"time": f"{d} {t}", "temp": _num(values.get("T1H")), "rain1h": values.get("RN1"),
            "precipType": PTY.get(str(values.get("PTY", "0")), "없음")}


PTY = {"0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기", "5": "빗방울", "6": "빗방울눈날림", "7": "눈날림"}
SKY = {"1": "맑음", "3": "구름많음", "4": "흐림"}


def fetch_short_days(nx, ny, now):
    """단기예보를 날짜별로 요약: 최대 강수확률, 비·눈 여부, 최저·최고기온, 하늘."""
    d, t = _vilage_base(now)
    items = _cached(f"vilage_{nx}_{ny}_{d}{t}", lambda: _call(
        f"{VILAGE_URL}/getVilageFcst",
        {"pageNo": 1, "numOfRows": 1000, "dataType": "JSON", "base_date": d, "base_time": t, "nx": nx, "ny": ny},
        "단기예보"))
    days = {}
    for item in items:
        day = days.setdefault(item["fcstDate"], {"pop": 0, "precip": set(), "tmin": None, "tmax": None,
                                                 "temps": [], "sky": []})
        cat, value = item["category"], item["fcstValue"]
        if cat == "POP":
            day["pop"] = max(day["pop"], int(value))
        elif cat == "PTY" and value != "0":
            day["precip"].add(PTY.get(value, value))
        elif cat == "TMN":
            day["tmin"] = _num(value)
        elif cat == "TMX":
            day["tmax"] = _num(value)
        elif cat == "TMP":
            day["temps"].append(_num(value))
        elif cat == "SKY":
            day["sky"].append(SKY.get(value, value))
    result = {}
    today_key = now.strftime("%Y%m%d")
    for date_key, day in days.items():
        # 단기예보 끝 날짜는 00시 한두 시간대만 들어 있기도 합니다. 최저·최고기온(TMN·TMX)이 모두 없는
        # 미래 날짜는 하루 예보로 쓰지 않고 빼서, fetch_weather가 중기예보를 보게 합니다(오늘은 그대로 둡니다).
        if date_key > today_key and day["tmin"] is None and day["tmax"] is None:
            continue
        temps = [x for x in day["temps"] if x is not None]
        # TMN·TMX가 없는 시간대(오늘 오후 등)는 시간별 기온으로 채웁니다.
        tmin = day["tmin"] if day["tmin"] is not None else (min(temps) if temps else None)
        tmax = day["tmax"] if day["tmax"] is not None else (max(temps) if temps else None)
        sky = max(set(day["sky"]), key=day["sky"].count) if day["sky"] else None
        result[date_key] = {"source": "단기예보", "pop": day["pop"], "precip": sorted(day["precip"]),
                            "tmin": tmin, "tmax": tmax, "sky": sky, "issued": f"{d}{t}"}
    return {"issued": f"{d} {t}", "days": result}


def fetch_mid_day(land_id, ta_id, target, now):
    """중기예보에서 target 날짜(4~10일 뒤) 하나를 꺼냅니다."""
    tm = _mid_tmfc(now)
    base = dt.datetime.strptime(tm[:8], "%Y%m%d").date()
    offset = (target - base).days
    if not 4 <= offset <= 10:
        return None
    land = _cached(f"midland_{land_id}_{tm}", lambda: _call(
        f"{MID_URL}/getMidLandFcst", {"pageNo": 1, "numOfRows": 10, "dataType": "JSON", "regId": land_id, "tmFc": tm},
        "중기육상예보"))
    ta = _cached(f"midta_{ta_id}_{tm}", lambda: _call(
        f"{MID_URL}/getMidTa", {"pageNo": 1, "numOfRows": 10, "dataType": "JSON", "regId": ta_id, "tmFc": tm},
        "중기기온"))
    if not land:
        return None
    land, ta = land[0], (ta[0] if ta else {})
    if offset <= 7:   # 4~7일 뒤는 오전·오후로 나뉩니다
        pop = max(_num(land.get(f"rnSt{offset}Am")) or 0, _num(land.get(f"rnSt{offset}Pm")) or 0)
        sky = f"{land.get(f'wf{offset}Am', '')} / {land.get(f'wf{offset}Pm', '')}"
    else:
        pop = _num(land.get(f"rnSt{offset}")) or 0
        sky = land.get(f"wf{offset}", "")
    if not sky.strip(" /") and _num(ta.get(f"taMin{offset}")) is None:
        return None   # 18시 발표에는 4일 뒤 자료가 비어 있습니다. 빈 값을 '0%·야외 가능'으로 보지 않습니다.
    precip = [w for w in ("비", "눈", "소나기") if w in sky]
    return {"source": "중기예보", "pop": pop, "precip": precip, "tmin": _num(ta.get(f"taMin{offset}")),
            "tmax": _num(ta.get(f"taMax{offset}")), "sky": sky, "issued": tm}


def _warning_areas(line, names):
    """특보 한 줄에서 해당 시도의 괄호 안 지역 목록을 꺼냅니다.

    예: '한파주의보 : 경기도(가평, 양평서부), 충청북도(영동)' + ('충청북도', '충북') → ['영동']
    괄호가 없으면(시도 전체 발효) ['*']를 돌려줍니다.
    """
    areas = []
    body = line.split(":", 1)[1] if ":" in line else line
    depth, chunk, chunks = 0, "", []
    for ch in body:                       # 괄호 안의 쉼표는 나누지 않도록 한 글자씩 봅니다
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth == 0:
            chunks.append(chunk)
            chunk = ""
        else:
            chunk += ch
    chunks.append(chunk)
    for part in chunks:
        part = part.strip()
        if not any(part.startswith(name) for name in names):
            continue
        if "(" in part:
            inner = part[part.index("(") + 1:part.rindex(")") if ")" in part else len(part)]
            areas += [a.strip() for a in inner.split(",") if a.strip()]
        else:
            areas.append("*")
    return areas


def _gungu_key(gungu):
    """'청주시'·'청주시 상당구' → '청주' 처럼 특보 지역 이름과 맞출 앞부분만 남깁니다."""
    word = (gungu or "").split()[0] if gungu else ""
    return word[:-1] if len(word) > 2 and word[-1] in "시군구" else word


def fetch_warnings(names, gungu=""):
    """현재 발효 중인 특보 가운데 이 지역에 해당하는 것만 돌려줍니다.

    gungu(시군구)를 주면 특보의 괄호 안 지역 이름과 맞춰 봅니다. 예를 들어
    '충청북도(영동)'에 내린 한파주의보는 청주 요청에는 걸리지 않습니다.
    gungu가 없으면 시도 안 어디든 내려진 특보를 '일부 지역'으로 표시합니다.
    """
    items = _cached("warnings", lambda: _call(
        f"{WARN_URL}/getPwnStatus", {"pageNo": 1, "numOfRows": 10, "dataType": "JSON"}, "기상특보"))
    key = _gungu_key(gungu)
    here, nearby = [], []
    for item in items:
        for raw in str(item.get("t6") or "").splitlines():
            line = raw.strip(" o\t")
            if not line:
                continue
            areas = _warning_areas(line, names)
            if not areas:
                continue
            kind = line.split(":", 1)[0].strip()
            if "*" in areas or (key and any(a.startswith(key) for a in areas)):
                here.append(kind)
            else:
                nearby.append(f"{kind}({', '.join(areas)})")
    kinds = sorted({k for k in DANGER_WARNINGS + TEMP_WARNINGS if any(k in kind for kind in here)})
    # 시군구를 모르면 판단에는 쓰지 않고 '시도 일부 지역' 정보로만 보여줍니다.
    return {"active": here, "kinds": kinds, "elsewhereInSido": nearby, "matchedBy": "시군구" if key else "시도"}


def fetch_air(air_name):
    """시도 측정소들의 실시간 미세먼지. 측정소 중 가장 나쁜 등급과 중앙값을 씁니다."""
    items = _cached(f"air_{air_name}", lambda: _call(
        f"{AIR_URL}/getCtprvnRltmMesureDnsty",
        {"pageNo": 1, "numOfRows": 200, "returnType": "json", "sidoName": air_name, "ver": "1.0"}, "에어코리아"))
    grades10 = [g for g in (_num(i.get("pm10Grade")) for i in items) if g]
    grades25 = [g for g in (_num(i.get("pm25Grade")) for i in items) if g]
    grades = grades10 + grades25
    pm10 = sorted(v for v in (_num(i.get("pm10Value")) for i in items) if v is not None)
    pm25 = sorted(v for v in (_num(i.get("pm25Value")) for i in items) if v is not None)
    worst = max(grades) if grades else None
    return {"stations": len(items), "worstGrade": worst, "worstLabel": GRADE.get(worst, "정보 없음"),
            # 웹앱 판정용: PM10·PM2.5 각각 측정소 중 가장 나쁜 등급
            "pm10Grade": max(grades10) if grades10 else None,
            "pm25Grade": max(grades25) if grades25 else None,
            "pm10Median": pm10[len(pm10) // 2] if pm10 else None,
            "pm25Median": pm25[len(pm25) // 2] if pm25 else None,
            "time": items[0].get("dataTime") if items else None}


GRADE = {1: "좋음", 2: "보통", 3: "나쁨", 4: "매우나쁨"}


def _num(value):
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# 추천 규칙
# ---------------------------------------------------------------------------
def decide(day, air, warnings, strict=False):
    """날씨 요약 → 추천 모드, 이유, 함께 보여줄 것, 제외할 야외 유형.

    web의 weatherThresholds.ts와 같은 규칙입니다. 비·눈, 추위, 더위, 미세먼지 중 하나라도
    걸리면 '실내만', 강수확률이 '비 소식' 기준 이상이면 '실내 대안 함께', 특보는 바다·산·계곡 제외.
    """
    rule = STRICT if strict else RULES
    reasons, tips, exclude = [], [], []
    indoor_only, with_indoor = False, False

    if day:
        pop = day.get("pop") or 0
        if pop >= rule["rain_pop"] or day["precip"]:
            what = "눈" if any("눈" in p for p in day["precip"]) else "비"
            reasons.append(f"{what} 예보(강수확률 {int(pop)}%)")
            tips += ["우산", "미끄럼 주의"]
            indoor_only = True
        elif pop >= rule["rain_notice_pop"]:
            reasons.append(f"비 소식(강수확률 {int(pop)}%)")
            tips.append("우산")
            with_indoor = True
        tmin, tmax = day.get("tmin"), day.get("tmax")
        if tmin is not None and tmin <= rule["cold_min"]:
            reasons.append(f"추운 날(최저 {_fmt(tmin)}℃)")
            tips += ["방한용품", "어르신·아이 체온 주의"]
            indoor_only = True
        if tmax is not None and tmax >= rule["hot_max"]:
            reasons.append(f"더운 날(최고 {_fmt(tmax)}℃)")
            tips += ["물", "자외선 차단", "한낮 야외 피하기"]
            indoor_only = True
    if air and air["worstGrade"] and air["worstGrade"] >= rule["dust_grade"]:
        reasons.append(f"미세먼지 {air['worstLabel']}")
        tips.append("마스크")
        indoor_only = True
    if warnings:
        terrain = [k for k in warnings["kinds"] if k in rule["terrain_warnings"]]
        if terrain:
            reasons.append(f"기상특보({', '.join(terrain)})")
            exclude += ["바다", "산", "계곡"]
            tips.append("가까운 대피소·응급실 확인")
            with_indoor = True
        temp = [k for k in warnings["kinds"] if k in TEMP_WARNINGS]
        if temp:   # 한파·폭염 특보는 기온 기준과 같은 뜻이라 실내만
            reasons.append(f"기상특보({', '.join(temp)})")
            tips += ["방한용품"] if "한파" in temp else ["물", "한낮 야외 피하기"]
            indoor_only = True

    if indoor_only:
        mode = "indoor"
    elif with_indoor:
        mode = "mixed"
    elif day is None:
        mode = "unknown"   # 예보가 없으면 '야외 가능'이라고 단정하지 않습니다
    else:
        mode = "outdoor"
    return {"mode": mode, "modeLabel": {"indoor": "실내만 추천", "mixed": "실내 대안 함께",
                                        "outdoor": "야외 가능", "unknown": "예보 확인 필요"}[mode],
            "reasons": reasons, "tips": list(dict.fromkeys(tips)), "excludeOutdoor": exclude}


def _fmt(x):
    return "-" if x is None else f"{x:g}"


# 실내·야외 분류: TourAPI 콘텐츠 타입 + 이름 키워드 (Orange 결정 트리 결과로 보완 예정)
INDOOR_TYPES = {"14": "문화시설", "38": "쇼핑", "39": "음식점"}
OUTDOOR_TYPES = {"12": "관광지", "28": "레포츠"}
INDOOR_WORDS = ("박물관", "미술관", "전시", "기념관", "과학관", "아쿠아리움", "체험관", "실내", "도서관", "공연장", "갤러리")
OUTDOOR_HINTS = {"바다": ("해수욕장", "해변", "해안", "항구"), "산": ("등산", "오름", "봉우리", "국립공원"),
                 "계곡": ("계곡", "폭포")}


def classify_place(content_type_id="", title=""):
    """관광지 하나를 실내/야외로 나누고, 야외면 바다·산·계곡 중 어디에 가까운지 붙입니다."""
    title = title or ""
    if any(word in title for word in INDOOR_WORDS) or str(content_type_id) in INDOOR_TYPES:
        return {"indoor": True, "outdoorKind": None}
    kind = next((k for k, words in OUTDOOR_HINTS.items() if any(w in title for w in words)), None)
    # '부산'·'산업'처럼 '산'이 들어간 이름이 많아, 이름이 '산'으로 끝날 때만 산으로 봅니다(예: 속리산).
    if kind is None and title.strip().endswith("산"):
        kind = "산"
    return {"indoor": False, "outdoorKind": kind}


# ---------------------------------------------------------------------------
# 묶음 조회 (/api/weather)
# ---------------------------------------------------------------------------
def fetch_weather(lat, lon, sido, date_text="", companions="", gungu=""):
    """위치·시도·방문일·일행(·시군구)으로 날씨 요약과 실내·야외 추천을 돌려줍니다."""
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        raise ValueError("위도(lat)·경도(lon)가 필요합니다.") from None
    if not (33 <= lat <= 39 and 124 <= lon <= 132):
        raise ValueError("국내 위치의 위도·경도가 필요합니다.")
    air_name, names, land_id, ta_id = _sido_info(sido, lon, gungu)
    now = dt.datetime.now(KST)
    target = dt.datetime.strptime(date_text, "%Y%m%d").date() if date_text else now.date()
    days_ahead = (target - now.date()).days
    if days_ahead < 0:
        raise ValueError("방문일은 오늘 이후여야 합니다.")
    strict = any(w in (companions or "") for w in ("senior", "child", "어르신", "아이"))
    nx, ny = latlon_to_grid(lat, lon)

    with ThreadPoolExecutor(max_workers=4) as pool:
        short_f = pool.submit(fetch_short_days, nx, ny, now)
        warn_f = pool.submit(fetch_warnings, names, gungu)
        air_f = pool.submit(fetch_air, air_name) if days_ahead == 0 else None
        now_f = pool.submit(fetch_now, nx, ny, now) if days_ahead == 0 else None
        errors = {}

        def get(future, label):
            if future is None:
                return None
            try:
                return future.result()
            except (RuntimeError, ValueError) as error:   # 하나가 실패해도 나머지로 판단
                errors[label] = str(error)
                return None

        short = get(short_f, "short")
        warnings = get(warn_f, "warnings") if days_ahead <= 1 else None   # 특보는 오늘·내일만 의미
        air = get(air_f, "air")
        current = get(now_f, "now")

    day = (short or {}).get("days", {}).get(target.strftime("%Y%m%d"))
    if day is None and days_ahead == 0 and short is not None:
        # 23시 발표는 다음 날 00시부터라 23:10~24:00에는 오늘 예보가 없습니다. 20시 발표를 한 번 더 봅니다.
        try:
            earlier = fetch_short_days(nx, ny, now - dt.timedelta(hours=3))
            day = earlier["days"].get(target.strftime("%Y%m%d"))
        except (RuntimeError, ValueError) as error:
            errors["short_prev"] = str(error)
    if day is None and days_ahead >= 4:
        try:
            day = fetch_mid_day(land_id, ta_id, target, now)
        except (RuntimeError, ValueError) as error:
            errors["mid"] = str(error)
    notice = None
    if day is None:
        notice = "아직 이 날짜의 예보가 없습니다. 출발 2~3일 전에 다시 확인하세요."
    elif days_ahead > FORECAST_RECHECK_DAYS:
        notice = f"{FORECAST_RECHECK_DAYS}일 이후 예보는 바뀔 수 있습니다. 출발 2~3일 전에 다시 확인하세요."

    return {"date": target.isoformat(), "sido": sido, "grid": [nx, ny], "strict": strict,
            "now": current, "forecast": day, "air": air, "warnings": warnings,
            "recommend": decide(day, air, warnings, strict), "notice": notice, "errors": errors}


def _place(lat, lon, sido, gungu=""):
    """API별 조회 경로의 공통 입력 검사: 위경도 → 격자, 시도 → 지역 코드."""
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        raise ValueError("위도(lat)·경도(lon)가 필요합니다.") from None
    if not (33 <= lat <= 39 and 124 <= lon <= 132):
        raise ValueError("국내 위치의 위도·경도가 필요합니다.")
    return (*latlon_to_grid(lat, lon), *_sido_info(sido, lon, gungu))


def short_detail(lat, lon, sido):
    """① 단기예보 조회서비스: 초단기실황 + 날짜별 단기예보(오늘~3일 뒤)."""
    nx, ny, *_ = _place(lat, lon, sido)
    now = dt.datetime.now(KST)
    return {"grid": [nx, ny], "now": fetch_now(nx, ny, now), **fetch_short_days(nx, ny, now)}


def mid_detail(lat, lon, sido, gungu=""):
    """② 중기예보 조회서비스: 4~10일 뒤 강수확률·하늘·기온."""
    *_, land_id, ta_id = _place(lat, lon, sido, gungu)
    now = dt.datetime.now(KST)
    base = dt.datetime.strptime(_mid_tmfc(now)[:8], "%Y%m%d").date()
    days = {}
    for offset in range(4, 11):
        target = base + dt.timedelta(days=offset)
        day = fetch_mid_day(land_id, ta_id, target, now)
        if day:
            days[target.strftime("%Y%m%d")] = day
    return {"issued": _mid_tmfc(now), "landRegId": land_id, "taRegId": ta_id, "days": days}


def warnings_detail(sido, gungu=""):
    """③ 기상특보 조회서비스: 이 지역 발효 특보와 같은 시도의 다른 지역 특보."""
    if sido not in SIDO:
        raise ValueError(f"시도 이름이 올바르지 않습니다: {sido} (예: 서울, 강원, 충북, 제주)")
    return fetch_warnings(SIDO[sido][1], gungu)


def air_detail(sido):
    """④ 에어코리아 대기오염정보: 시도 측정소 실시간 미세먼지."""
    if sido not in SIDO:
        raise ValueError(f"시도 이름이 올바르지 않습니다: {sido} (예: 서울, 강원, 충북, 제주)")
    return fetch_air(SIDO[sido][0])


WEATHER_ROUTES = {
    "/api/weather": lambda param: fetch_weather(
        param("lat"), param("lon"), param("sido"), param("date"), param("with"), param("gungu")),
    # API별 원자료 확인용(웹 /weather 페이지에서 사용)
    "/api/weather/short": lambda param: short_detail(param("lat"), param("lon"), param("sido")),
    "/api/weather/mid": lambda param: mid_detail(param("lat"), param("lon"), param("sido"), param("gungu")),
    "/api/weather/warnings": lambda param: warnings_detail(param("sido"), param("gungu")),
    "/api/weather/air": lambda param: air_detail(param("sido")),
}


# ---------------------------------------------------------------------------
# 단독 실행: API 4종 점검, 추천 결과 확인
# ---------------------------------------------------------------------------
def check_apis(lat=36.6424, lon=127.4890, sido="충북"):
    now = dt.datetime.now(KST)
    nx, ny = latlon_to_grid(lat, lon)
    air_name, names, land_id, ta_id = _sido_info(sido, lon)
    print(f"기준 {now:%Y-%m-%d %H:%M} KST, ({lat}, {lon}) → 격자 ({nx}, {ny}), {sido}\n")
    tests = [
        ("단기예보 조회서비스", lambda: f"{len(fetch_short_days(nx, ny, now)['days'])}일치 예보, "
                                f"실황 기온 {fetch_now(nx, ny, now)['temp']}℃"),
        ("중기예보 조회서비스", lambda: str(fetch_mid_day(land_id, ta_id, now.date() + dt.timedelta(days=5), now))),
        ("기상특보 조회서비스", lambda: (lambda r: f"{sido} 전체 발효 {len(r['active'])}건, 시도 일부 지역 {len(r['elsewhereInSido'])}건")(
            fetch_warnings(names))),
        ("에어코리아 대기오염정보", lambda: (lambda a: f"측정소 {a['stations']}곳, 최악 등급 {a['worstLabel']}")(
            fetch_air(air_name))),
    ]
    ok = 0
    for label, run in tests:
        try:
            print(f"[OK]   {label}: {run()}")
            ok += 1
        except (RuntimeError, ValueError) as error:
            print(f"[실패] {label}: {error}")
    print(f"\n결과: 4개 중 {ok}개 정상")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["check"]:
        rest = args[1:]
        check_apis(float(rest[0]), float(rest[1]), rest[2]) if len(rest) == 3 else check_apis()
    elif len(args) >= 3:
        result = fetch_weather(args[0], args[1], args[2], args[3] if len(args) > 3 else "",
                               args[4] if len(args) > 4 else "", args[5] if len(args) > 5 else "")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args[:1] == ["local"]:
        # 웹 서버는 api.py 것을 그대로 씁니다. 날씨 페이지(/weather)를 바로 엽니다.
        import api
        api.run_web_app("/weather")
    elif args[:1] == ["help"]:
        print(__doc__)
    else:
        import webbrowser
        url = "https://tourapi-demo.vercel.app/weather"
        print(f"날씨 페이지 (Vercel): {url}")
        print("내 PC에서 서버를 직접 켜려면: py weather.py local")
        print("사용법 보기: py weather.py help")
        webbrowser.open(url)
