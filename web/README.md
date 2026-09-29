# 관광 추천 웹앱 (MVP)

창업 도전신청서 5.1~5.2에서 정한 스택(React + TypeScript + 카카오맵 API)으로
만든 3단계 MVP 범위의 웹앱이다: 지도 기반 웹앱, 동행자 교집합 추천, 사용자
조건 필터.

## 지금 상태

시범 권역(충청권 천안 포함 + 강원권 일부) 10개 지역의 **샘플 데이터**로
동작한다. 추천·안전도 계산 로직은 `tourism_platform`(파이썬) 패키지와 같은
수식을 `src/lib/`에 TypeScript로 옮겨 쓴 것이라 실제 데이터로 교체해도 로직은
그대로 쓸 수 있다.

## 실행

```bash
npm install
npm run dev
```

카카오맵을 보려면 [카카오 개발자센터](https://developers.kakao.com)에서
JavaScript 키를 발급받아 `.env.local`에 설정한다 (`.env.example` 참고):

```
VITE_KAKAO_MAP_KEY=발급받은_키
```

키가 없으면 지도 대신 지역 좌표 목록이 표시된다(폴백).

## 화면 구성

- `/` — 랜딩 페이지 (`src/pages/Landing.tsx`). 서비스 소개, 검증된 수치, 4대
  기능 카드, 방법론 요약. 실제 도구는 여기서 "추천받으러 가기" 버튼으로 넘어간다.
- `/app` — 실제 추천 도구 (`src/pages/AppPage.tsx`). 동행자 입력 → 추천 목록 →
  지도·안전 패널. 상단 "← TrueTrip"으로 랜딩 페이지로 돌아간다.

추천은 2단계로 이루어진다 (문서 4.3): 1단계는 지역을 동행자 교집합 점수로
고르고, 2단계는 그 지역 안의 실제 관광지를 골라 보여준다. 관광지 순위도
인기 지표 하나가 아니라 **동행자 연령대 선호도**(`lib/attractionAffinity.ts`)를
곱해서 계산한다 — 같은 지역이라도 60대 여성과 10대 남성이 입력하면 위에
뜨는 관광지 순서가 달라진다(예: 천안시 — 60대는 독립기념관이 위로, 10대는
병천순대거리가 위로). 추천이 나오면 1위 지역이 자동으로 선택돼 지도에
그 지역의 실제 관광지 이름표가 바로 뜨고(클릭 없이도), 지도가 없는 환경에서는
목록 폴백에도 지역명이 아니라 그 지역의 실제 관광지 이름이 표시된다.

디자인은 다크 배경 + 블루(`#4f7fff`)/틸(`#00e5c3`) 그라데이션 액센트를 쓰는
단일 테마로 통일했다 (`src/theme.css`에 토큰 정의).

## 구조

```
src/
├── theme.css               # 다크 테마 공통 토큰 (색상, 필 버튼)
├── App.tsx                  # 라우터 (/ → Landing, /app → AppPage)
├── pages/
│   ├── Landing.tsx + .css   # 마케팅 랜딩 페이지
│   └── AppPage.tsx + .css   # 실제 추천 도구 화면
├── lib/
│   ├── types.ts               # Person, Region, Attraction, SafetyIndex 등 도메인 타입
│   ├── indices.ts             # LQ·특화점수·그룹점수 (문서 4.2, 4.4)
│   ├── attractionAffinity.ts  # 연령대별 관광지 태그 선호 가중치 (문서 4.3 2단계 추천)
│   ├── recommend.ts           # 동행자 교집합 추천 + 관광지 매치 점수 + 탐색 추천(4.8)
│   └── safetyPriority.ts      # 동행 구성별 안전 지표 표시 순서 (문서 4.5)
├── data/sampleRegions.ts  # 시범 권역 샘플 데이터
└── components/
    ├── CompanionForm.tsx      # 성별·연령대·동행자·필터 입력
    ├── RecommendationList.tsx # 추천 + 탐색 추천 카드
    ├── SafetyPanel.tsx        # 선택 지역의 안전 등급·지표
    └── MapView.tsx            # 카카오맵 (키 없으면 목록 폴백)
```

## 실데이터 연동 시 해야 할 일

1. `tourism_platform` 파이썬 패키지로 계산한 지역별 `groupVisitors`,
   `totalVisitors`, `safety` 값을 API나 정적 JSON으로 내보낸다.
2. `src/data/sampleRegions.ts`를 그 응답을 fetch하는 코드로 교체한다
   (`Region[]` 타입만 맞추면 나머지 컴포넌트는 그대로 동작한다).
3. 시범 권역 10곳 외 지역까지 넓힌다.
