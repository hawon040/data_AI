# notebooks

정제 과정을 눈으로 확인하는 Jupyter 노트북. 정제 규칙은 `lake/pipeline.py`에 있고, 노트북은 그 결과를 보여 주는 용도다.

- `01_clean_tourspots.ipynb`: 관광지 raw → 정제 → 규칙별 건수·결측·이상치·시도별 집계

실행하려면 raw가 있어야 한다(`DATA_GO_KR_SERVICE_KEY` 설정 후 `python -m tourism_platform.lake.run`).
저장된 출력은 없다 — 이 노트북은 실데이터로 아직 실행하지 않았다.
