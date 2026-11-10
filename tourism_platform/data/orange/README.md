# Orange로 실내/야외 분류하기

날씨 규칙(비·더위·미세먼지 → 실내만)은 관광지가 실내인지 야외인지에 따라 결과가 달라진다.
지금은 이름·분류의 키워드 규칙(`web/src/lib/attractionSetting.ts`)으로 판단한다. 이 규칙이 얼마나 맞는지, 데이터로 학습한 분류 모델(Orange)과 비교한다.

## 순서

1. **정답 적기** — `attractions.csv`의 `label` 칸에 팀이 아는 대로 `indoor` 또는 `outdoor`를 적는다. 여러 명이 나눠 적은 뒤 맞춰 보면 좋다.
   - 규칙 판정(`rule_setting`)을 보고 적으면 규칙이 맞는 것처럼 보이므로, 이 칸을 가리고 적는 것이 좋다.
2. **규칙 정확도 보기** — `tourism_platform` 폴더에서 `python -m tourism_platform.validation.setting_compare`
3. **Orange에서 모델 만들기**
   - `File` 위젯으로 `attractions.csv` 열기 → `label`을 Target, `name`·`category`·`tags`를 Feature(text)로 지정
   - `Preprocess Text` → `Bag of Words` → `Logistic Regression` (비교용으로 `Tree`도 가능)
   - `Test and Score`에서 **교차검증**(Cross validation) 결과를 확인한다. 관광지가 적으므로 Leave-one-out이나 10-fold를 쓴다.
   - `Confusion Matrix`로 어떤 곳을 틀리는지 본다.
   - `Predictions`의 결과를 `Save Data`로 `orange_predictions.csv`에 저장한다(`region`, `name` 열이 있어야 한다).
4. **비교** — `python -m tourism_platform.validation.setting_compare --orange data/orange/orange_predictions.csv --orange-col "Logistic Regression"`

## 알아둘 점
- 관광지가 58곳뿐이라 모델 정확도는 불안정하다. 숫자 하나로 규칙과 모델의 우열을 가리기보다, **어떤 곳을 틀리는지**를 보는 것이 더 쓸모 있다.
- 학습에 쓴 데이터로 정확도를 재면 부풀려진다. 반드시 교차검증 값을 쓴다.
- `attractions.csv`는 `web/scripts/attraction_setting_cli.ts`로 다시 만들 수 있다(관광지 목록이 바뀌었을 때). 다시 만들면 `label`이 지워지니 먼저 백업한다.
