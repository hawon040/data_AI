# 실시간 연동 데이터 (자동 생성, 수동 다운로드 아님)

`python -m tourism_platform.data.fetch_live` 실행 결과가 여기 저장된다
(`data/raw/`는 사람이 직접 내려받는 파일용, 이 폴더는 Open API를 코드로 호출한
원본 JSON 응답용 — 둘을 구분했다). 실제 응답 JSON은 용량·갱신 빈도 문제로
리포지토리에 커밋하지 않는다(`.gitkeep`으로 폴더 구조만 유지).

## 실제로 연결하는 절차

1. [data.go.kr](https://www.data.go.kr)에서 `tourism_platform/src/tourism_platform/data/datasets.py`에
   나열된 데이터셋을 하나씩 활용신청 → 승인
2. 마이페이지 > 개발계정에서 일반 인증키(Encoding) 발급
3. 환경변수로 설정: `export DATA_GO_KR_SERVICE_KEY=발급받은키`
4. 신청한 API 상세페이지의 "참고문서"를 보고 `datasets.py`의 해당
   `DatasetConfig.endpoint` / `operation`을 채운다 (여기서 추측하지 않는다 —
   API마다 다르고 개편으로 바뀔 수 있어서, 신청 후 문서를 직접 보는 게
   유일하게 확실한 방법이다)
5. `python -m tourism_platform.data.fetch_live` 실행

키를 일부만 발급받았어도 괜찮다 — 설정 안 된 데이터셋은 건너뛰고 "미설정"으로
표시될 뿐, 나머지는 정상 진행된다.
