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
