# tourism_platform — TourLink 계산·데이터 모듈

TourLink(빅데이터와 AI 2조)의 파이썬 쪽이다. 공공데이터 API 호출, 날씨·대비 정보 계산,
추천 수식(LQ·동행자 점수), 데이터 레이크·MongoDB 실습을 담는다.
수식과 코드의 대응은 저장소 루트의 [`docs/methodology.md`](../docs/methodology.md)에 있다.

10주차(2026-11-05)부터 범죄율·사고율 기반 지역 안전도 점수는 서비스에서 뺐다.
`indices/`의 유효인구·위해지수·베이즈 축소와 `validation/`의 안전도 검증은 방법론 기록으로 남겨 둔다.

## 폴더 구조

```
tourism_platform/
├── src/tourism_platform/
│   ├── data/
│   │   ├── apis/              # 분야별 API 설정 — tourism(관광지·방문자) · safety(응급의료·대피소) · weather(기상청) · air(에어코리아)
│   │   ├── datasets.py        # apis/를 하나로 모은 DATASETS
│   │   ├── datagokr_client.py # 공통 호출 (XML·JSON, 키 마스킹, 호출 로그)
│   │   ├── fetch_live.py      # 설정된 API를 전부 호출해 연결 상태 확인
│   │   ├── spot_conditions.py # 관광지 좌표 → 강수확률·강수형태·기온·특보·미세먼지
│   │   ├── preparedness.py    # 관광지 좌표 → 가까운 응급의료기관·지진해일대피소·관광안내소
│   │   ├── geo.py             # 하버사인 거리, 국내 좌표 검사
│   │   ├── region_codes.py · cleaning.py
│   ├── indices/               # 추천 수식(LQ, 동행자 점수) + 안전도 수식(기록용)
│   ├── lake/                  # 데이터 레이크(raw→processed→gold), MongoDB 실습, 호출 로그 리포트
│   └── validation/            # 몬테카를로 검증, 실데이터 비교표
├── data/
│   ├── raw/                   # raw/api/: API 응답 원본(자동), 그 밖: 직접 내려받은 파일
│   ├── processed/             # 정제 JSON Lines
│   ├── gold/                  # 지표 Parquet
│   └── logs/                  # API 호출 로그
└── tests/
```

`data/` 아래 산출물은 커밋하지 않는다(README만 커밋).

## 설치와 테스트

```bash
cd tourism_platform
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev,lake]"
.venv/Scripts/python -m pytest -q
```

`tests/test_ts_parity.py`는 node로 `web/src/lib/indices.ts`를 실행해 파이썬 결과와 비교한다(node가 없으면 건너뜀).
MongoDB 실습 테스트는 로컬 MongoDB가 있을 때만 돈다.

## 공공데이터 API 연결

1. [data.go.kr](https://www.data.go.kr)에서 `data/apis/` 설정에 적힌 데이터셋을 활용신청한다.
2. 마이페이지 > 개발계정의 **일반 인증키(Decoding)** 를 환경변수 `DATA_GO_KR_SERVICE_KEY`로 설정한다.
   관광지 안전정보(한국문화정보원)는 `KCISA_API_KEY`를 쓴다.
   requests가 URL 인코딩을 한 번 더 하므로 Encoding 키를 넣으면 이중 인코딩된다.
   키는 저장소 루트의 `.env`에만 두고 코드·커밋에 넣지 않는다.
3. 연결 상태 확인: `python -m tourism_platform.data.fetch_live`
   - 미설정(endpoint 없음)·서비스키 없음·실패(HTTP 403 등)를 데이터셋별로 보여 준다.
   - 403은 대개 그 API의 활용신청이 승인되지 않았다는 뜻이다.

엔드포인트와 오퍼레이션명은 추측하지 않는다. 포털 상세페이지와 참고문서로 확인하거나,
키 없이 호출해 `SERVICE_KEY_IS_NULL`(있는 API)과 `NO_OPENAPI_SERVICE_ERROR`(없는 API)로 구분한 값만 넣는다.

## 오차 검증(교차검증) 실행

문서 10장에서 설명한 몬테카를로 검증을 그대로 재현한다. 참값을 아는 가상
지역으로 방법론의 오차 성능만 측정하는 것이며, 실제 지역의 결과가 아니다.

```bash
python -m tourism_platform.validation.run_all
```

개별 검증만 실행하려면:

```bash
python -m tourism_platform.validation.validate_recommendation        # 10.1
python -m tourism_platform.validation.validate_group_intersection    # 10.2
python -m tourism_platform.validation.validate_safety_index          # 10.4, 10.5
python -m tourism_platform.validation.validate_quadrant_stability    # 10.6
python -m tourism_platform.validation.validate_rank_uncertainty      # 10.7
```

## 데이터 레이크 · MongoDB · 호출 로그 (수업 도구 실습)

```bash
pip install -e ".[dev,lake]"        # pymongo, pyarrow, tabulate
DATA_GO_KR_SERVICE_KEY=... KCISA_API_KEY=... python -m tourism_platform.lake.run
python -m tourism_platform.lake.api_log_report
```

| 단계 | 위치 | 형식 |
|---|---|---|
| raw | `data/raw/api/<데이터셋>/<YYYY-MM-DD>/page-0001.json` | API 응답 원본 그대로 |
| processed | `data/processed/<데이터셋>/<YYYY-MM-DD>.jsonl` | 정제 레코드 (좌표 검사·시도 표준화·중복 제거) |
| gold | `data/gold/*.parquet` | 시도별 지표, 관광지별 가장 가까운 대피소 거리 |
| MongoDB | `tourlink_lab` DB (`MONGO_URI`, 기본 `mongodb://127.0.0.1:27017`) | `spots`·`shelters`·`weather` 컬렉션 |
| 호출 로그 | `data/logs/api_calls.jsonl` (`TOURLINK_API_LOG`로 변경, 빈 값이면 끔) | 시간·API·응답시간·성공 여부·상태코드 (키는 남기지 않음) |

산출물은 `.gitignore`로 커밋에서 뺀다. MongoDB는 `tourapi/api.py`가 쓰는 `tourlink` DB와 섞이지 않게 `tourlink_lab`을 쓴다.

### Redis 응답 캐시 (아직 설치 안 됨)

이 PC에는 Redis가 없어 캐시는 구현하지 않았다. 설치 후 `datagokr_client.fetch()`에
"키 = API + 요청 파라미터(서비스키 제외)의 해시, 값 = 응답 JSON, TTL = 데이터 갱신 주기"로 붙이면 된다
(예: 단기예보 1시간, 관광지 표준데이터 1일).

Windows에서 설치하는 방법(하나만 고르면 된다):

1. **Docker Desktop**: `docker run -d --name redis -p 6379:6379 redis:7`
2. **WSL2(Ubuntu)**: `sudo apt update && sudo apt install redis-server && sudo service redis-server start`
3. **Memurai**(Windows용 Redis 호환 서버): https://www.memurai.com 에서 설치 후 서비스로 실행

확인: `redis-cli ping` → `PONG`. 파이썬 클라이언트는 `pip install redis`.
