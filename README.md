# data_AI

데이터 시각화 프로젝트.

## 폴더 구조

- `data/` — 시각화에 사용하는 데이터 파일 (CSV)
  - `sample_sales.csv` — 월별 매출 샘플 데이터 (2024 vs 2025)
  - `sample_category_region.csv` — 카테고리/지역별 샘플 데이터
- `dashboards/` — 시각화 대시보드
  - `dashboard.html` — 브라우저에서 바로 여는 데이터 시각화 대시보드 (샘플 데이터 기준)

## 사용법

`dashboards/dashboard.html` 파일을 브라우저로 열면 대시보드를 바로 확인할 수 있습니다.
실제 데이터로 교체하려면 `data/` 폴더의 CSV 값을 수정하거나, `dashboard.html` 안의
`months`, `revenue2025`, `revenue2024`, `categories`, `regions` 값을 실제 데이터로
바꾸면 됩니다.

## 공개 링크

GitHub Pages 배포가 완료되면 다음 링크에서 대시보드를 확인하고 공유할 수 있습니다.

https://hawon040.github.io/data_AI/dashboard.html
