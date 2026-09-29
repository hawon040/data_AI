# 원본 데이터 (수동 다운로드 필요)

이 폴더는 공공데이터 포털에서 직접 내려받은 원본 파일을 두는 곳이다. 실제
파일은 용량과 라이선스 문제로 리포지토리에 커밋하지 않는다(`.gitkeep`으로
폴더 구조만 유지).

## 받아야 할 파일과 출처

| 파일명(권장) | 출처 | 비고 |
|---|---|---|
| `visitor_by_gender_age.csv` | [한국관광공사 빅데이터 지역별 방문자수](https://www.data.go.kr/data/15101972/openapi.do) | 기초지자체 단위 제공 여부, 연령 구간 확인 필요 (문서 11.1 넷째) |
| `crime_by_region.csv` | [경찰청 범죄 발생 지역별 통계](https://www.data.go.kr/data/3074462/fileData.do) | 군 지역 개별 제공 여부 최우선 확인 (문서 11.1 첫째) |
| `crime_by_place.csv` | [경찰청 범죄 발생 장소별 통계](https://www.data.go.kr/data/3074463/fileData.do) | 관광 노출 계수(λ_k) 산출용 |
| `violent_crime_by_station.csv` | [경찰청 전국 경찰서별 강력범죄 발생 현황](https://www.data.go.kr/data/15084592/fileData.do) | 군 지역 대체용, 경찰서→시군구 매핑 필요 |
| `seoul_5_major_crimes.csv` | [서울시 5대 범죄 발생현황](https://data.seoul.go.kr/dataList/316/S/2/datasetView.do) | 구별 구분이 경찰관서 주소지 기준임에 주의 |
| `sigungu_codes.csv` | [행정표준코드관리시스템](https://www.code.go.kr) | columns: `sido,sigungu,code` — 전체 5자리 코드표 |

## 제출 전 반드시 확인할 것 (문서 11.1)

1. 경찰청 범죄 발생 지역별 통계에서 군 지역이 개별로 제공되는지 확인 — 핵심 기술의 실현 가능성이 여기 달려 있다.
2. 한국관광 데이터랩 성·연령별 방문자 분포가 기초지자체 단위로 제공되는지, 연령 구간이 어떻게 나뉘는지 확인 — 추천 해상도가 여기 달려 있다.
3. 데이터랩·경찰청 데이터의 공공누리 유형을 확인해 상업적 이용 가능 여부를 정리한다.
4. 한국관광공사의 관광지별 혼잡도 예측 정보 제공 여부와 범위 확인 — 여행 중 모드 기능이 여기 달려 있다.
