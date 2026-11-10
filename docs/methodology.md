# 방법론 요약

원본 신청서 전체 내용은 [Claude Docs 문서](https://claude.ai/artifact/CBfwnCSGjiYwrQCAYZRNJt)에
있다. 이 파일은 그중 코드로 옮긴 수식과 결정값만 모듈별로 정리한 것이다.
각 항목은 `구현 위치`와 `근거(문서 절)`를 함께 표시한다.

- 구현 위치의 경로는 `tourism_platform/src/tourism_platform/` 기준이다.
- 10주차(2026-11-05)부터 3~5절·7절의 안전도 지표(유효인구·위해지수·베이즈 축소·등급)는 서비스에서 쓰지 않는다. 방법론 기록으로만 남긴다.
- 날씨·일행 추천 규칙은 `web/src/lib/weatherRules.ts`(기준값 `web/src/config/weatherThresholds.ts`)에 있다.
- 대비 정보(가까운 응급의료기관·대피소·관광안내소)는 `data/preparedness.py`에 있다.
- 수식과 코드 대조, 검증 수치 재현 결과는 `docs/10주차_작업기록.md` 7-c에 있다.

## 1. 추천 — 연령대 방문 특화지수 (문서 4.2)

```
LQ_ig = (V_ig + k·s_g) / (V_i + k) / s_g
Score_ig = LQ_ig × log(V_i)
```

- 집단 g는 연령대 6개(10대·20대·30대·40대·50대·60대 이상)다. 2026-11-10 팀 결정으로 성별은 입력·추천에서 뺐다.
  웹 샘플 지역의 방문자 수(`web/src/data/sampleRegions.ts`)는 예전 성별·연령대 12개 값을 같은 연령대끼리 더해 6개로 합쳤다.
- 이 절과 2절의 검증 수치는 10주차 시뮬레이션(`validation/`, 성별×연령대 12개 집단) 결과이며 다시 계산하지 않았다.
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

- 2단계 관광지 단위 추천 (문서 4.3): TourAPI 연동. 사용자 기록(별점·길찾기)은 쓰지 않는다(9절).
- 여행 중 실시간 모드 (문서 4.6): 위치 기반 알림, 혼잡도 예측 연동.
- 지자체 리포트 생성 파이프라인 (문서 6.1): 4분면 분류 결과를 실제 리포트로.

## 9. 사용자 기록 기반 보정 — 넣지 않음 (11/10 팀 결정)

#11(`fbf5639`)에서 서비스 사용자의 기록(방문 후 별점, 길찾기 클릭)으로 지역 특화지수와 관광지 선호 가중치를 보정하는 기능을 만들었으나, 11/10 팀 결정으로 넣지 않기로 하고 코드를 지웠다.

- 지운 것: 파이썬 `usage/`, `tourapi/usage_events.py`(`POST /api/usage`, `GET /api/usage/summary`), 웹 동의 안내·별점 칸·길찾기 기록·기록 보정 계산
- 추천은 #11 이전(`68002da`)과 같다. 지역은 1·2절의 LQ(샘플 방문자 비중), 관광지는 연령대별 태그 선호 가중치(`web/src/lib/attractionAffinity.ts`)만 쓴다.
- 설계했던 식과 잠정값은 git 기록(`fbf5639`의 이 절)에 남아 있다.
