# 원본 데이터

| 위치 | 내용 | 만드는 방법 |
|---|---|---|
| `data/raw/api/<데이터셋>/<YYYY-MM-DD>/page-0001.json` | Open API 응답 원본 | `python -m tourism_platform.data.fetch_live` 또는 `python -m tourism_platform.lake.run` (자동) |
| `data/raw/<파일>.csv` | 포털에서 직접 내려받은 파일 | 아래 표 (수동) |

실제 파일은 용량·라이선스 문제로 리포지토리에 커밋하지 않는다(`.gitignore`, 이 README만 커밋).

## 직접 내려받는 파일

| 파일명(권장) | 출처 | 쓰는 곳 |
|---|---|---|
| `tourist_info_centers.csv` | [전국관광안내소표준데이터](https://www.data.go.kr/data/15013112/standard.do) | `preparedness.load_info_centers()` — Open API(`tourist_info_centers`) 활용신청 전까지 대신 쓴다 |
| `sigungu_codes.csv` | [행정표준코드관리시스템](https://www.code.go.kr) | `region_codes.load_code_table()` — columns: `sido,sigungu,code` |

## 확인할 것

1. 한국관광 데이터랩은 연령대별 방문자 분포를 제공하지 않는다(`apis/tourism.py` `visitor_by_age`). LQ 특화지수(연령대 6개 그룹)에 쓸 대안 데이터를 찾아야 한다. 성별·연령대로 나뉜 자료라면 같은 연령대의 남녀 값을 더해 쓴다(2026-11-10 성별 제외).
2. 사용하는 데이터의 공공누리 유형(상업적 이용 가능 여부)을 정리한다.
3. 한국관광공사의 관광지별 혼잡도 예측 정보 제공 여부와 범위를 확인한다.

경찰청 범죄 통계는 10주차 방향 전환으로 쓰지 않는다(2026-11-06 설정 삭제).
