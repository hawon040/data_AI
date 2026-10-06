"""공공데이터포털(data.go.kr) Open API 공통 호출 클라이언트.

data.go.kr에 올라온 Open API는 거의 전부 같은 요청 규약을 쓴다:

    GET {endpoint}/{operation}?serviceKey=...&pageNo=...&numOfRows=...&type=json

이 모듈은 그 "공통 규약"만 구현한다. API마다 다른 부분(엔드포인트 주소·
Operation명·데이터셋 고유 파라미터)은 추측하지 않고 datasets.py의
DatasetConfig로 분리해 비워 뒀다 — 틀린 URL을 하드코딩해서 조용히 실패하는
것보다, 뭘 채워야 하는지 명확한 에러로 알려주는 쪽을 택했다.

실제로 연결하는 절차:
    1. https://www.data.go.kr 에서 원하는 데이터셋 "활용신청" → 승인
       (Open API는 보통 즉시~수 시간, 파일 데이터는 즉시)
    2. 마이페이지 > 개발계정에서 일반 인증키(Encoding) 발급
    3. 환경변수 DATA_GO_KR_SERVICE_KEY 에 그 키를 설정
    4. 신청한 API의 상세페이지 "참고문서"를 보고 datasets.py의 해당
       DatasetConfig.endpoint / operation을 채운다
    5. python -m tourism_platform.data.fetch_live 실행
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import requests


class ServiceKeyMissingError(RuntimeError):
    """환경변수에 서비스키가 설정되지 않았을 때."""


class DatasetNotConfiguredError(RuntimeError):
    """datasets.py에 endpoint/operation이 아직 채워지지 않았을 때."""


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
    """Operation(작업)명. 예: areaBasedList2. None이면 아직 미설정."""
    service_key_env: str = "DATA_GO_KR_SERVICE_KEY"
    extra_params: dict[str, Any] = field(default_factory=dict)


def _service_key(env_var: str) -> str:
    key = os.environ.get(env_var)
    if not key:
        raise ServiceKeyMissingError(
            f"환경변수 {env_var}가 없습니다. data.go.kr 마이페이지 > 개발계정에서 "
            "발급받은 일반 인증키(Encoding)를 설정하세요."
        )
    return key


def fetch(config: DatasetConfig, *, page_no: int = 1, num_of_rows: int = 100, **params: Any) -> dict:
    """설정된 data.go.kr Open API를 호출해 JSON 응답을 그대로 반환한다.

    config.endpoint/operation이 비어 있으면 호출을 시도하지 않고 바로
    DatasetNotConfiguredError를 던진다 — 채워야 할 값과 어디서 찾는지를
    에러 메시지에 그대로 담는다.
    """
    if not config.endpoint or not config.operation:
        where = config.portal_url + (f" (검색: {config.search_hint})" if config.search_hint else "")
        raise DatasetNotConfiguredError(
            f"'{config.name}'의 endpoint/operation이 아직 설정되지 않았습니다. "
            f"{where} 에서 활용신청 승인 후, 상세페이지의 참고문서를 보고 "
            "datasets.py의 DatasetConfig.endpoint/operation을 채우세요."
        )

    service_key = _service_key(config.service_key_env)
    url = f"{config.endpoint.rstrip('/')}/{config.operation}"
    query = {
        "serviceKey": service_key,
        "pageNo": page_no,
        "numOfRows": num_of_rows,
        "type": "json",
        **config.extra_params,
        **params,
    }
    res = requests.get(url, params=query, timeout=15)
    res.raise_for_status()
    data = res.json()

    header = data.get("response", {}).get("header", {})
    result_code = header.get("resultCode")
    if result_code not in (None, "00", "0"):
        raise RuntimeError(
            f"'{config.name}' API 오류 (resultCode={result_code}): "
            f"{header.get('resultMsg', '알 수 없는 오류')}"
        )
    return data
