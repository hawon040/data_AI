# 방법론 요약

원본 신청서 전체 내용은 [Claude Docs 문서](https://claude.ai/artifact/CBfwnCSGjiYwrQCAYZRNJt)에
있다. 이 파일은 그중 코드로 옮긴 수식과 결정값만 모듈별로 정리한 것이다.
각 항목은 `구현 위치`와 `근거(문서 절)`를 함께 표시한다.

- 구현 위치의 경로는 `tourism_platform/src/tourism_platform/` 기준이다.
- 10주차(2026-11-05)부터 3~5절·7절의 안전도 지표(유효인구·위해지수·베이즈 축소·등급)는 서비스에서 쓰지 않는다. 방법론 기록으로만 남긴다.
- 날씨·일행 추천 규칙은 `web/src/lib/weatherRules.ts`(기준값 `web/src/config/weatherThresholds.ts`)에 있다.
- 대비 정보(가까운 응급의료기관·대피소·관광안내소)는 `data/preparedness.py`에 있다.
- 수식과 코드 대조, 검증 수치 재현 결과는 `docs/10주차_작업기록.md` 7-c에 있다.

## 1. 추천 — 성·연령 방문 특화지수 (문서 4.2)

```
LQ_ig = (V_ig + k·s_g) / (V_i + k) / s_g
Score_ig = LQ_ig × log(V_i)
```

- 구현: `indices/location_quotient.py`
- 평활 계수 `k=50` — 검증 결과(10.1) k=0(0.842)과 k=50(0.833)은 거의 차이가 없고
  k=1000(0.717)은 개인화를 심하게 흐린다.
- 검증: `validation/validate_recommendation.py` → 결합 방식이 인기도 단독보다
  정밀도 약 2.5배, 집단 간 추천 중복 44.8%→8.2%.

## 2. 동행자 교집합 추천 (문서 4.4)

```
Score_i^group = min_{g∈동행집단} LQ_ig × log(V_i)
```

- 구현: `indices/group_recommendation.py`
- 평균이 아닌 최솟값을 쓰는 이유: 가장 덜 만족하는 동행자를 기준으로 삼아
  누구도 소외시키지 않는다.
- 검증: `validation/validate_group_intersection.py` → 최솟값 방식의 동행자 전원
  만족 비율 68.3% (대표자 1인 24.5%, 인기도 14.5%, 평균 47.9%).

## 3. 안전도 — 유효인구 (문서 4.5, 9.3)

```
P_i^eff = P_i^res + (V_i^pd × h̄_i/24) / 365
```

- 구현: `indices/effective_population.py`
- **주의**: 데이터랩 방문자 수는 이미 '방문자·일' 단위이므로 체류일수를 다시
  곱하면 이중 계산 오류가 된다 (`effective_population_double_counted`는
  회귀 비교용으로만 남긴 옛 방식).
- 검증: `validation/validate_safety_index.py::validate_denominator` →
  RMSE 수정식 4.6 < 거주인구만 5.9 < 이전 이중계산식 8.9.

## 4. 안전도 — 위해지수 (문서 4.5)

```
H_i = Σ_k s_k · λ_k · C̄_ik
```

- 구현: `indices/harm_index.py`
- s_k: 양형기준 기반 심각도(Sherman et al. 2016 개념), λ_k: 여행자 노출 장소
  비중, C̄_ik: 3개년 평균 발생 건수.

## 5. 안전도 — 경험적 베이즈 축소 (문서 4.5, Clayton & Kaldor 1987)

```
R̂_i = w_i·R_i + (1-w_i)·R̄,   w_i = σ² / (σ² + R̄/P_i^eff)
```

- 구현: `indices/bayes_shrinkage.py`
- 검증: `validation/validate_safety_index.py::validate_averaging_and_shrinkage` →
  3개년 평균(전체 RMSE 4.6, 소규모 8.0) + 경험적 베이즈(전체 4.1, 소규모 6.8).

## 6. 지자체 리포트 4분면 분류 안정성 (문서 10.6)

- 구현: `validation/validate_quadrant_stability.py`
- 관측 잡음만으로 평균 17.9% 지역이 참 분면과 다르게 분류됨 → 경계 대역
  (중앙값 ± 0.25 표준편차) 표시 규칙 채택.

## 7. 안전도 순위 불확실성 (문서 10.7)

- 구현: `validation/validate_rank_uncertainty.py`
- 하위 지표 가중치를 무작위로 바꾸면 순위 90% 구간 폭 중앙값이 매우 커짐 →
  단일 순위 대신 5단계 등급 + 신뢰구간으로 표시.

## 8. 데이터 결합·정제 원칙 (문서 5.3)

- 구현: `data/region_codes.py`(5자리 시군구 코드, 동명 지역 처리),
  `data/cleaning.py`(좌표 이상값·중복 시설·등록 편향 지역 결측 처리).

## 아직 코드로 옮기지 않은 것 (실데이터 확보 후 진행)

- 2단계 관광지 단위 추천 (문서 4.3): TourAPI 연동 + 사용자 기록 누적.
- 여행 중 실시간 모드 (문서 4.6): 위치 기반 알림, 혼잡도 예측 연동.
- 지자체 리포트 생성 파이프라인 (문서 6.1): 4분면 분류 결과를 실제 리포트로.

## 9. 사용자 기록 기반 보정 (11/10 추가)

외부 성·연령 방문자 데이터를 받지 않고, 서비스를 쓴 사용자의 기록(성별·연령대, 방문 후 평가, 길찾기 클릭)을 쓴다.
구현: `usage/` (`events.py` 형식·검증, `aggregate.py` 집계, `region.py` 지역 LQ, `affinity.py` 선호 가중치 보정), 테스트 `tests/test_usage.py`.

**지역 특화지수** — 8절까지의 LQ를 그대로 쓰되 입력을 사용자 기록으로 바꾼다.
```
LQ_ig = ((V_ig + k·s_g) / (V_i + k)) / s_g        (V: 사용자 기록 건수, k = 50)
```
- 기록이 없으면 V_i = 0이라 LQ = 1(전국 평균과 같다)이다. 반영 비율은 V_i / (V_i + k).
- 건수: 방문 후 평가 1.0, 길찾기 클릭 0.5 (길찾기는 다녀온 것이 아니라 의도라서 약하게). 잠정값.
- s_g: 모든 지역의 기록으로 구한 집단별 비중에 라플라스 평활(+1)을 해, 기록 없는 집단의 비중이 0이 되지 않게 한다.
- 점수의 규모 항 log V_i에는 사용자 기록이 아니라 공공 방문자 수를 써야 한다(기록이 0이면 log가 정의되지 않는다).

**관광지 선호 가중치** — 평가를 기본 가중치 P와 섞는다.
```
weight_k = exp(-경과일수/180),  n_ag = Σ weight_k,  R̄_ag = Σ weight_k·score_k / n_ag
O_ag  = R̄_ag / R̄_g           (R̄_g: 연령대 g가 매긴 전체 가중 평균)
w_ag  = n_ag / (n_ag + m),  m = 10
A'_ag = clip(w_ag·O_ag + (1 − w_ag)·P_ag, 0.6, 1.4)     평가가 0건이면 P 그대로
```
- R̄_g로 나누는 이유: 점수를 후하게/짜게 주는 연령대의 차이를 없앤다.
- 최근 평가에 큰 비중을 두는 이유: 계절·유행 변화를 따라간다.
- 범위 제한 이유: 소수 평가가 순위를 뒤집지 못하게 한다.
- m = 10, 180일, 0.6~1.4, 길찾기 가중 0.5는 모두 잠정값이다. 기록이 쌓인 뒤 오프라인 검증(평가 20%를 떼어 두고 비교)으로 조정한다.

**개인정보** — `parse_event`는 허용한 필드(anon_id, kind, region_code, attraction, gender, age_group, occurred_at, score)만 받고 그 밖의 필드가 있으면 기록 전체를 거절한다. `anon_id`는 브라우저가 만든 임의 값이며 같은 사람의 반복 기록을 한 번만 세는 데만 쓴다.
