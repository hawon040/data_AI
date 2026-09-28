# 관광지 안전 × 연령대 맞춤 추천

빅데이터와 AI (홍진근 교수님) · 2조 PBL 프로젝트

흩어진 공공 안전 데이터(범죄·교통사고·기상)와 관광 데이터(관광정보·방문자·연령 비중)를 시군구 코드와 좌표로 결합합니다. 이를 바탕으로 **사용자의 연령대·동반 유형·여행 월·시간대에 맞춘 관광지 추천**과 **요인별 안전 정보**를 제공합니다.

> 안전도는 공공 통계 기반의 상대 비교이며, 절대적인 안전을 보장하지 않습니다.

## 추천 계산 방식 한눈에 보기

```
Score = α·pct(S) + β·pct(F′) + γ·pct(P′)        (α, β, γ) = (0.5, 0.3, 0.2)

S  안전도      = 1 − Σ w̃_k(연령, 동반, 시간대) · r_k       r_k: 치안·교통·날씨 하위지표 (0~1, 클수록 위험)
F′ 연령 적합도 = 0.5 + ln(LQ) / (2·ln 4)                  LQ: 평활 입지계수 (데이터랩 연령 비중)
P′ 인기도      = 외지인·외국인 월평균 방문자의 전국 백분위
```

정규화·결측·가중치 근거·검증 방법 등 모든 세부 규칙은 [`docs/recommendation_method.md`](docs/recommendation_method.md)에 있습니다. 3주차 초안(2.2.8)에서 무엇이 왜 바뀌었는지는 문서 7절에 정리했어요.

## 폴더 구조

```
app/streamlit_app.py        대시보드 (추천 결과 · 점수 분해 · 지도 · 민감도·검증 · 계산 방식)
src/tourrec/
  config.py                 모든 상수·가중치·배수 (근거 주석 포함)
  indicators.py             1단계 원지표: 유효인구, EB 범죄율, 사고다발 EPDO, 기후 노출, LQ, 인기도
  normalize.py              2단계 정규화: 분위수 절단 min-max, 백분위, LQ 변환
  scoring.py                3~4단계: 프로필 가중치, 안전도, 결합, 게이트, 다양성, 실효 가중치
  validation.py             수렴 타당도, 가중치·파라미터 민감도, 몬테카를로 순위 구간
  collect.py                공공데이터포털 API 수집 골격 (4주차 본수집용)
  sample_data.py            가상 샘플 데이터 생성기 (실제와 같은 스키마)
tests/test_scoring.py       설계 문서에서 약속한 성질(단조성·필터 불변성·결측 중립성 등) 검사
data/sample/                가상 샘플 CSV  ·  data/raw/ 원천 응답  ·  data/processed/ 실제 정제 데이터
```

## 실행

```bash
pip install -r requirements.txt
python -m pytest -q                 # 산식 성질 테스트
streamlit run app/streamlit_app.py  # 대시보드 (http://localhost:8501)
```

- `data/processed/`에 CSV가 있으면 그 데이터를, 없으면 `data/sample/`의 **가상 샘플**을 씁니다. CSV 형식은 설계 문서 2.2절을 따릅니다.
- 샘플의 지역명은 모두 '가상시 01'처럼 실제가 아닌 이름이에요. 실제 지역에 가짜 위험 수치를 붙이지 않기 위해서입니다.
- 샘플을 다시 만들려면 `python scripts/make_sample.py`를 실행하세요.

## 실제 데이터 수집 (4주차)

1. `.env.example`을 `.env`로 복사하고 공공데이터포털 인증키(Decoding 키)를 넣습니다. `.env`는 `.gitignore`에 있어서 커밋되지 않아요.
2. `PYTHONPATH=src python -m tourrec.collect`로 관광정보를 수집하면 원본 JSON이 `data/raw/`에 저장됩니다.
3. 범죄 통계를 세로형으로 바꾸고 시군구 명칭을 코드로 매핑한 뒤(보고서 2.2.5), `data/processed/`에 저장합니다.
