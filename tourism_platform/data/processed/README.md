# 가공 데이터 (데이터 레이크 processed 단계)

`python -m tourism_platform.lake.run`이 `data/raw/api/`의 원본 응답을 정제해
`data/processed/<데이터셋>/<YYYY-MM-DD>.jsonl`로 저장한다(좌표 범위 검사, 시도명 표준화,
숫자 변환, 중복 제거 — `lake/pipeline.py`). 지표는 `data/gold/*.parquet`에 저장한다.

산출물은 `.gitignore`로 커밋하지 않는다.
