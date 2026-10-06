# 관광 노출 보정 안전지수 기반 맞춤형 안심 관광 추천 플랫폼

창업 도전신청서([원본 문서](https://claude.ai/artifact/CBfwnCSGjiYwrQCAYZRNJt))에
나온 수식과 결정값을 실제로 돌아가는 코드로 옮긴 핵심 계산 모듈이다.
신청서 본문의 수식 하나하나가 어떤 파일에 대응하는지는 `docs/methodology.md`를 보면 된다.

## 폴더 구조

```
tourism_platform/
├── src/tourism_platform/
│   ├── indices/        # 문서 4장 — 추천·안전도 핵심 수식 (LQ, 그룹점수, 유효인구, 위해지수, 베이즈축소)
│   ├── data/            # 문서 5.3 — 시군구 코드 매핑, 정제 규칙, 원본 데이터 로더
│   └── validation/       # 문서 10장 — 몬테카를로 오차 검증 (교차검증)
├── data/
│   ├── raw/              # 공공데이터 포털에서 내려받은 원본 (리포지토리에는 미포함, README만)
│   └── processed/        # 정제된 데이터
├── docs/methodology.md   # 문서 절 ↔ 코드 파일 대응표
└── tests/                # 각 수식의 단위 테스트
```

## 설치

```bash
cd tourism_platform
pip install -e ".[dev]"
```

## 테스트

```bash
pytest
```

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

## 다음 단계 (실데이터 확보 후)

`data/raw/README.md`의 "제출 전 반드시 확인할 것" 항목부터 처리한다 —
특히 경찰청 범죄 통계의 군 지역 제공 여부와 데이터랩 성·연령 분포의
공간 단위 확인이 핵심 기술의 실현 가능성을 좌우한다.

## 실제 API 연동 (data.go.kr Open API)

아직 어느 데이터셋도 API 키를 발급받지 않은 상태라, 당장 호출되는 실제 연동은
없다. 대신 키를 받는 즉시 바로 동작하도록 연동 뼈대만 먼저 만들어 뒀다:

- `data/datagokr_client.py` — data.go.kr의 공통 요청 규약(serviceKey·
  pageNo·type=json)을 구현한 클라이언트. 엔드포인트/Operation을 추측해
  하드코딩하지 않고, 설정 안 됐으면 `DatasetNotConfiguredError`로 뭘 채워야
  하는지 알려준다.
- `data/datasets.py` — 연동해야 할 데이터셋 7개(데이터랩 방문자, TourAPI
  관광지, 경찰청 범죄 2종, 도로교통공단·소방청·국립중앙의료원)의 설정 레지스트리.
  `endpoint`/`operation`이 `None`인 항목은 아직 미설정.
- `data/fetch_live.py` — 설정된 데이터셋을 전부 호출해 `data/live/`에
  저장하는 CLI (`python -m tourism_platform.data.fetch_live`). 일부만
  설정돼 있어도 나머지는 "미설정"으로 건너뛰고 계속 진행한다.

실제로 연결하려면:

1. [data.go.kr](https://www.data.go.kr)에서 `datasets.py`에 나열된 데이터셋을
   활용신청 → 승인
2. 마이페이지 > 개발계정에서 발급받은 인증키를 `DATA_GO_KR_SERVICE_KEY`
   환경변수로 설정
3. 승인된 API 상세페이지의 "참고문서"를 보고 `datasets.py`의 해당
   `endpoint`/`operation`을 채운다 (API마다 다르고 개편으로 바뀔 수 있어서
   여기서 미리 추측해 넣지 않았다)
4. `python -m tourism_platform.data.fetch_live` 실행
