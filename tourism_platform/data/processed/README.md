# 가공 데이터

`data/raw/`의 원본을 `tourism_platform.data.loaders`와
`tourism_platform.data.cleaning`으로 정제한 결과를 저장하는 곳이다.

기준 공간 키는 5자리 시군구 코드(`tourism_platform.data.region_codes`)로
통일하고, 결측·이상값 처리 규칙은 `cleaning.py`를 따른다.
