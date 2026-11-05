"""공공데이터포털(data.go.kr) Open API 공통 호출 클라이언트.

data.go.kr 산하 API는 실제로는 두 가지 서로 다른 요청 규약을 쓴다 — 하나로
퉁치면 안 된다는 걸 실제 Swagger 명세를 받아보고서야 확인했다:

  - "datalab" 방식 (대부분의 apis.data.go.kr·api.data.go.kr API):
      GET {endpoint}/{operation}?serviceKey=...&pageNo=...&numOfRows=...&type=json
    응답은 {response: {header: {resultCode, resultMsg}, body: {...}}} 형태
    (표준데이터는 response 없이 header/body만 준다 — 같은 모양으로 맞춘다).
    응답 형식 파라미터 이름은 API마다 다르다(type/_type/dataType/returnType).

  - "odcloud" 방식 (파일 데이터를 표준 API로도 열어주는 행정안전부
    공공데이터개방표준서비스, host가 api.odcloud.kr인 것들 — 예: 경찰청
    범죄 통계):
      GET {endpoint}/{namespace}/v1/uddi:{uuid}?serviceKey=...&page=...&perPage=...
    응답은 {page, perPage, totalCount, currentCount, matchCount, data: [...]}
    형태로, header/resultCode 같은 건 없고 HTTP 상태 코드(401/500)로 오류를
    알려준다.

DatasetConfig.api_style로 둘을 구분한다. API마다 다른 나머지(엔드포인트
주소·Operation/경로)는 추측하지 않고 data/apis/ 아래 설정 파일에 분리해 둔다 — 틀린
URL을 하드코딩해서 조용히 실패하는 것보다, 뭘 채워야 하는지 명확한 에러로
알려주는 쪽을 택했다.

실제로 연결하는 절차:
    1. https://www.data.go.kr 에서 원하는 데이터셋 "활용신청" → 승인
       (Open API는 보통 즉시~수 시간, 파일 데이터는 즉시)
    2. 마이페이지 > 개발계정에서 일반 인증키 발급 — Decoding 키를 쓴다. requests가 URL 인코딩을
       한 번 더 하므로 Encoding 키를 넣으면 %가 이중 인코딩된다(2026-11-05 Decoding 키로 호출 성공 확인).
    3. 환경변수 DATA_GO_KR_SERVICE_KEY 에 그 키를 설정
    4. 신청한 API의 상세페이지 "참고문서"를 보고 datasets.py의 해당
       DatasetConfig.endpoint / operation을 채운다
    5. python -m tourism_platform.data.fetch_live 실행
"""
from __future__ import annotations

import json
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any

import requests


class ServiceKeyMissingError(RuntimeError):
    """환경변수에 서비스키가 설정되지 않았을 때."""


class DatasetNotConfiguredError(RuntimeError):
    """endpoint가 없거나 operation이 None(미설정)일 때.
    operation=""(빈 문자열)은 "설정 완료, 추가 경로 없음"이라 여기 해당 안 됨."""


@dataclass(frozen=True)
class DatasetConfig:
    name: str
    """사람이 읽을 데이터셋 이름 — 에러 메시지·로그에 쓰인다."""
    portal_url: str
    """data.go.kr 신청 페이지. 특정 데이터셋 상세페이지 주소를 안다면 그걸,
    모르면 메인 포털(https://www.data.go.kr)을 넣고 search_hint로 보완한다."""
    search_hint: str | None = None
    """portal_url이 메인 포털일 때, 포털 검색창에 입력할 키워드."""
    endpoint: str | None = None
    """API 엔드포인트. 예: https://apis.data.go.kr/B551011/KorService2
    None이면 아직 미설정 — fetch()가 DatasetNotConfiguredError를 던진다."""
    operation: str | None = None
    """datalab 방식: Operation(작업)명 (예: areaBasedList2) — endpoint 뒤에 붙는다.
    odcloud 방식: {namespace}/v1/uddi:{uuid} 전체 경로. endpoint 자체가 이미 완전한
    경로라 더 붙일 게 없으면 빈 문자열("")을 쓴다. None이면 아직 미설정 —
    fetch()가 DatasetNotConfiguredError를 던진다."""
    api_style: str = "datalab"
    """"datalab"(기본) 또는 "odcloud"(api.odcloud.kr 계열) — 요청 파라미터명과 응답 구조가 다르다."""
    service_key_env: str = "DATA_GO_KR_SERVICE_KEY"
    extra_params: dict[str, Any] = field(default_factory=dict)
    timeout: float = 15
    """요청 제한 시간(초)."""


def _service_key(env_var: str) -> str:
    key = os.environ.get(env_var)
    if not key:
        raise ServiceKeyMissingError(
            f"환경변수 {env_var}가 없습니다. data.go.kr 마이페이지 > 개발계정에서 "
            "발급받은 일반 인증키(Decoding)를 설정하세요."
        )
    return key


# API 호출 로그(JSON Lines). 환경변수 TOURLINK_API_LOG로 경로를 바꾸고, 빈 문자열이면 기록하지 않는다.
DEFAULT_API_LOG = Path(__file__).resolve().parents[3] / "data" / "logs" / "api_calls.jsonl"

SUCCESS_CODES = (None, "00", "0", "0000")
FORMAT_PARAMS = {"type", "_type", "dataType", "returnType"}  # 0000은 한국문화정보원(KCISA) API의 정상 코드


def parse_xml_response(text: str) -> dict:
    """XML 응답을 JSON 응답과 같은 모양({"response": {"header", "body": {"items": {"item": [...]}}}})으로 바꾼다.

    게이트웨이 오류(OpenAPI_ServiceResponse)는 resultCode에 errMsg를 담아 돌려준다.
    """
    root = ET.fromstring(text)
    if root.tag == "OpenAPI_ServiceResponse":
        return {"response": {"header": {
            "resultCode": root.findtext("cmmMsgHeader/returnReasonCode", "ERR"),
            "resultMsg": root.findtext("cmmMsgHeader/errMsg", "알 수 없는 오류"),
        }}}
    items = [{child.tag: (child.text or "").strip() for child in item} for item in root.iterfind("body/items/item")]
    body = {child.tag: (child.text or "").strip() for child in root.iterfind("body/*") if child.tag != "items"}
    return {"response": {
        "header": {"resultCode": root.findtext("header/resultCode"), "resultMsg": root.findtext("header/resultMsg")},
        "body": {**body, "items": {"item": items}},
    }}


def _log_call(config: DatasetConfig, *, started: float, ok: bool, status: int | None,
              rows: int | None = None, error: str | None = None) -> None:
    """호출 한 건을 기록한다. 서비스키나 요청 파라미터 값은 남기지 않는다."""
    path = os.environ.get("TOURLINK_API_LOG", str(DEFAULT_API_LOG))
    if not path:
        return
    record = {
        "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "api": config.operation or config.endpoint.rstrip("/").rsplit("/", 1)[-1],
        "name": config.name,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
        "ok": ok,
        "status": status,
        "rows": rows,
        "error": error,
    }
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        pass  # 로그를 못 남겨도 호출 결과에는 영향을 주지 않는다


def fetch(config: DatasetConfig, *, page_no: int = 1, num_of_rows: int = 100, **params: Any) -> dict:
    """설정된 data.go.kr Open API를 호출해 JSON 응답을 그대로 반환한다.

    config.endpoint/operation이 비어 있으면 호출을 시도하지 않고 바로
    DatasetNotConfiguredError를 던진다 — 채워야 할 값과 어디서 찾는지를
    에러 메시지에 그대로 담는다.
    """
    if not config.endpoint or config.operation is None:
        where = config.portal_url + (f" (검색: {config.search_hint})" if config.search_hint else "")
        raise DatasetNotConfiguredError(
            f"'{config.name}'의 endpoint/operation이 아직 설정되지 않았습니다. "
            f"{where} 에서 활용신청 승인 후, 상세페이지의 참고문서를 보고 "
            "datasets.py의 DatasetConfig.endpoint/operation을 채우세요."
        )

    service_key = _service_key(config.service_key_env)
    # operation이 빈 문자열이면 endpoint 자체가 이미 완전한 경로다.
    url = f"{config.endpoint.rstrip('/')}/{config.operation}" if config.operation else config.endpoint
    if config.api_style == "odcloud":
        query = {"serviceKey": service_key, "page": page_no, "perPage": num_of_rows, **config.extra_params, **params}
    else:
        query = {
            "serviceKey": service_key,
            "pageNo": page_no,
            "numOfRows": num_of_rows,
            **config.extra_params,
            **params,
        }
        # 응답 형식 파라미터 이름이 API마다 다르다(type/_type/dataType/returnType).
        # 데이터랩처럼 모르는 type을 받으면 오류(INVALID_REQUEST_PARAMETER_ERROR(type))를 내는 API가 있어서,
        # 설정에 다른 형식 파라미터가 있으면 type을 붙이지 않는다.
        if not FORMAT_PARAMS & query.keys():
            query["type"] = "json"
    started = time.perf_counter()
    status: int | None = None
    try:
        data, status = _request(config, url, query)
    except Exception as e:
        _log_call(config, started=started, ok=False, status=status or getattr(e, "status", None), error=str(e)[:300])
        raise
    if config.api_style == "odcloud":
        items = data.get("data")
    else:
        body = data.get("response", {}).get("body") or {}
        items = body.get("items")
        items = items.get("item") if isinstance(items, dict) else items
    rows = len(items) if isinstance(items, list) else (1 if isinstance(items, dict) else 0)
    _log_call(config, started=started, ok=True, status=status, rows=rows)
    return data


class _HttpStatusError(RuntimeError):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


def _request(config: DatasetConfig, url: str, query: dict) -> tuple[dict, int | None]:
    res = requests.get(url, params=query, timeout=config.timeout)
    try:
        res.raise_for_status()
    except requests.HTTPError:
        # requests의 오류 메시지에는 serviceKey가 들어간 전체 URL이 담긴다 — 키를 빼고 다시 던진다.
        # 403은 보통 이 키로 해당 API 활용신청이 승인되지 않았다는 뜻이다.
        raise _HttpStatusError(
            f"'{config.name}' HTTP {res.status_code} ({url}) — 403이면 이 키로 활용신청이 승인됐는지 확인하세요.",
            res.status_code,
        ) from None
    if config.api_style == "odcloud":
        # odcloud는 오류를 HTTP 상태(401/500)로만 알려 주고 resultCode가 없다 — 위에서 이미 걸러졌다.
        return res.json(), getattr(res, "status_code", None)
    try:
        data = res.json()
    except ValueError:
        # XML만 주는 API(응급의료기관 등)가 있고, 기상청·에어코리아도 인증 오류는 XML로 돌려준다.
        try:
            data = parse_xml_response(res.text)
        except ET.ParseError:
            raise RuntimeError(f"'{config.name}' API 응답을 해석하지 못했습니다: {res.text[:200]}") from None

    # 전국관광지정보표준데이터처럼 response 없이 header/body만 주는 API가 있다 — 같은 모양으로 맞춘다.
    if "response" not in data and "header" in data:
        data = {"response": data}

    # 대부분 response.header에 결과 코드가 있지만, 데이터랩은 오류를 최상위 resultCode로 돌려준다.
    header = data.get("response", {}).get("header") or data
    result_code = header.get("resultCode")
    if result_code not in SUCCESS_CODES:
        raise RuntimeError(
            f"'{config.name}' API 오류 (resultCode={result_code}): "
            f"{header.get('resultMsg', '알 수 없는 오류')}"
        )
    return data, getattr(res, "status_code", None)
