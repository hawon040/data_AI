# notebooks

정제 과정을 눈으로 확인하는 Jupyter 노트북. 정제 규칙은 `lake/pipeline.py`에 있고, 노트북은 그 결과를 보여 주는 용도다.

- `01_clean_tourspots.ipynb`: 관광지 raw → 정제 → 규칙별 건수·빈 칸·이상치·시도별 집계

## 실행

```bash
cd tourism_platform
python -m pip install -e ".[dev,lake,notebook]"   # 패키지를 설치해야 노트북 커널이 tourism_platform을 찾는다
DATA_GO_KR_SERVICE_KEY=<키> python -m tourism_platform.lake.run   # raw를 받는다
jupyter notebook notebooks/01_clean_tourspots.ipynb
```

PYTHONPATH로 `src`를 가리킬 때는 **절대 경로**를 쓴다. 노트북은 자기 폴더에서 실행돼서 상대 경로 `src`는 찾지 못한다.

## 확인 상태
- 합성 데이터(관광지 132건: 중복 8건, 좌표 없음 3건 포함)로 처음부터 끝까지 오류 없이 실행되고, 규칙별 건수가 입력 132 → 좌표 3 → 중복 8 → 결과 121로 맞는 것을 확인했다.
- 실데이터로는 아직 실행하지 않았다(이 환경에서 공공데이터 호출이 막혀 있다). 저장된 출력은 없다.
