# 방법론 요약

원본 신청서 전체 내용은 [Claude Docs 문서](https://claude.ai/artifact/CBfwnCSGjiYwrQCAYZRNJt)에
있다. 이 파일은 그중 코드로 옮긴 수식과 결정값만 모듈별로 정리한 것이다.
각 항목은 `구현 위치`와 `근거(문서 절)`를 함께 표시한다.

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
