"""기상청 날씨 API(단기예보·중기예보·기상특보) 설정과 보조 함수.

엔드포인트와 요청 파라미터는 공공데이터포털 상세페이지에서 확인했다(2026-11-05):
    단기예보 https://www.data.go.kr/data/15084084/openapi.do
    중기예보 https://www.data.go.kr/data/15059468/openapi.do
    기상특보 https://www.data.go.kr/data/15000415/openapi.do
상세페이지에는 오퍼레이션이 한글 이름으로만 나온다. 그래서 영문 오퍼레이션명은 키 없이
직접 호출해 확인했다. 실제로 있는 오퍼레이션은 SERVICE_KEY_IS_NULL을 돌려주고, 없는
이름은 NO_OPENAPI_SERVICE_ERROR를 돌려준다.

세 API 모두 응답 형식 파라미터는 type이 아니라 dataType(XML/JSON)이다.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from ..datagokr_client import DatasetConfig

KST = timezone(timedelta(hours=9))

WEATHER_DATASETS: dict[str, DatasetConfig] = {
    "kma_short_forecast": DatasetConfig(
        # 같은 서비스의 다른 오퍼레이션: getUltraSrtNcst(초단기실황), getUltraSrtFcst(초단기예보),
        # getFcstVersion(예보버전). 필수 파라미터: base_date, base_time, nx, ny.
        name="기상청 단기예보 조회서비스 - 단기예보조회",
        portal_url="https://www.data.go.kr/data/15084084/openapi.do",
        endpoint="https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0",
        operation="getVilageFcst",
        extra_params={"dataType": "JSON"},
    ),
    "kma_mid_land_forecast": DatasetConfig(
        # 3~10일 뒤 강수확률(rnSt*)·날씨(wf*). 필수: regId, tmFc(YYYYMMDD0600 또는 1800).
        # 다른 오퍼레이션: getMidFcst(중기전망), getMidSeaFcst(중기해상예보).
        name="기상청 중기예보 조회서비스 - 중기육상예보조회",
        portal_url="https://www.data.go.kr/data/15059468/openapi.do",
        endpoint="https://apis.data.go.kr/1360000/MidFcstInfoService",
        operation="getMidLandFcst",
        extra_params={"dataType": "JSON"},
    ),
    "kma_mid_temperature": DatasetConfig(
        # 3~10일 뒤 최저·최고기온(taMin*, taMax*). regId는 육상예보와 다른 도시 단위 코드다.
        name="기상청 중기예보 조회서비스 - 중기기온조회",
        portal_url="https://www.data.go.kr/data/15059468/openapi.do",
        endpoint="https://apis.data.go.kr/1360000/MidFcstInfoService",
        operation="getMidTa",
        extra_params={"dataType": "JSON"},
    ),
    "kma_warning_status": DatasetConfig(
        # 최근 7일 특보현황. ServiceKey·pageNo·numOfRows·dataType 말고는 파라미터가 없다.
        # 다른 오퍼레이션: getWthrWrnList(특보목록), getWthrWrnMsg(통보문), getPwnCd(특보코드),
        # getWthrPwnList/getWthrPwn(예비특보), getWthrInfoList/getWthrInfo, getWthrBrkNewsList/getWthrBrkNews.
        name="기상청 기상특보 조회서비스 - 특보현황조회",
        portal_url="https://www.data.go.kr/data/15000415/openapi.do",
        endpoint="https://apis.data.go.kr/1360000/WthrWrnInfoService",
        operation="getPwnStatus",
        extra_params={"dataType": "JSON"},
    ),
}

# 중기예보 regId. 상세페이지 예시에 이름과 함께 나온 값만 넣었다.
# TODO: 상세페이지 "별첨엑셀자료"의 전체 regId 표로 채우기.
MID_LAND_REG_IDS: dict[str, str] = {"서울·인천·경기": "11B00000"}
MID_TA_REG_IDS: dict[str, str] = {"서울": "11B10101", "인천": "11B20201"}

# 단기예보 코드값. 상세페이지에는 "하단 코드값 정보 참조"라고만 되어 있고 표가 없다.
# 아래 값은 기상청 단기예보 활용가이드(첨부문서)의 내용이다.
# TODO: 실제 키로 받은 응답과 대조해 확인하기.
PTY_LABELS: dict[str, str] = {
    "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기",
    # 5~7은 초단기실황·초단기예보에만 나온다.
    "5": "빗방울", "6": "빗방울눈날림", "7": "눈날림",
}

# 단기예보는 하루 8번(02·05·08·11·14·17·20·23시) 발표하고, 발표 10분 뒤부터 조회된다.
# 이 값도 활용가이드 기준이다.
SHORT_BASE_HOURS = (2, 5, 8, 11, 14, 17, 20, 23)
SHORT_AVAILABLE_AFTER = timedelta(minutes=10)

# 기상청 동네예보 격자(Lambert Conformal Conic) 상수 — 기상청 활용가이드의 변환 예제와 같은 값.
_RE = 6371.00877   # 지구 반경(km)
_GRID = 5.0        # 격자 간격(km)
_SLAT1 = 30.0      # 표준위도 1
_SLAT2 = 60.0      # 표준위도 2
_OLON = 126.0      # 기준점 경도
_OLAT = 38.0       # 기준점 위도
_XO = 43           # 기준점 X 격자
_YO = 136          # 기준점 Y 격자


def _lcc_constants() -> tuple[float, float, float, float]:
    deg = math.pi / 180.0
    re = _RE / _GRID
    slat1, slat2, olat = _SLAT1 * deg, _SLAT2 * deg, _OLAT * deg
    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = sf**sn * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / ro**sn
    return re, sn, sf, ro


def latlon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    """위경도(WGS84)를 단기예보 격자 (nx, ny)로 바꾼다."""
    re, sn, sf, ro = _lcc_constants()
    deg = math.pi / 180.0
    ra = math.tan(math.pi * 0.25 + lat * deg * 0.5)
    ra = re * sf / ra**sn
    theta = lon * deg - _OLON * deg
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn
    nx = math.floor(ra * math.sin(theta) + _XO + 0.5)
    ny = math.floor(ro - ra * math.cos(theta) + _YO + 0.5)
    return nx, ny


def grid_to_latlon(nx: int, ny: int) -> tuple[float, float]:
    """격자 (nx, ny)의 중심 위경도. latlon_to_grid의 역변환으로, 테스트와 검증에 쓴다."""
    re, sn, sf, ro = _lcc_constants()
    xn = nx - _XO
    yn = ro - ny + _YO
    ra = math.hypot(xn, yn)
    if sn < 0:
        ra = -ra
    alat = 2.0 * math.atan((re * sf / ra) ** (1.0 / sn)) - math.pi * 0.5
    theta = math.atan2(xn, yn)
    alon = theta / sn + _OLON * math.pi / 180.0
    return math.degrees(alat), math.degrees(alon)


def latest_short_base(now: datetime) -> tuple[str, str]:
    """now(KST) 기준으로 지금 조회할 수 있는 가장 최근 단기예보 발표 (base_date, base_time)."""
    now = now.astimezone(KST) if now.tzinfo else now.replace(tzinfo=KST)
    for day_offset in (0, 1):
        day = now - timedelta(days=day_offset)
        for hour in reversed(SHORT_BASE_HOURS):
            base = day.replace(hour=hour, minute=0, second=0, microsecond=0)
            if base + SHORT_AVAILABLE_AFTER <= now:
                return base.strftime("%Y%m%d"), base.strftime("%H%M")
    raise AssertionError("unreachable: 전날 23시 발표는 항상 조회 가능하다")


def latest_mid_tmfc(now: datetime) -> str:
    """now(KST) 기준 가장 최근 중기예보 발표시각 tmFc (하루 2번: 06시, 18시)."""
    now = now.astimezone(KST) if now.tzinfo else now.replace(tzinfo=KST)
    for day_offset in (0, 1):
        day = now - timedelta(days=day_offset)
        for hour in (18, 6):
            base = day.replace(hour=hour, minute=0, second=0, microsecond=0)
            if base <= now:
                return base.strftime("%Y%m%d%H%M")
    raise AssertionError("unreachable")


def sample_params(now: datetime | None = None) -> dict[str, dict]:
    """fetch_live가 실제 호출할 때 쓸 예시 파라미터(서울시청 기준)."""
    now = now or datetime.now(KST)
    base_date, base_time = latest_short_base(now)
    nx, ny = latlon_to_grid(37.5665, 126.9780)
    tmfc = latest_mid_tmfc(now)
    return {
        "kma_short_forecast": {"base_date": base_date, "base_time": base_time, "nx": nx, "ny": ny},
        "kma_mid_land_forecast": {"regId": MID_LAND_REG_IDS["서울·인천·경기"], "tmFc": tmfc},
        "kma_mid_temperature": {"regId": MID_TA_REG_IDS["서울"], "tmFc": tmfc},
    }
