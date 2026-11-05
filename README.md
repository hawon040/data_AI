# TourLink

「빅데이터와 AI」 2조 프로젝트. 일행 구성과 방문일 날씨에 맞춰 관광지를 추천하고(날씨가 나쁘면 실내 위주),
가까운 응급의료기관·대피소·관광안내소 같은 대비 정보를 함께 보여 주는 서비스다.

10주차(2026-11-05)에 방향을 바꿨다. 범죄율·사고율 기반 지역 안전도 점수는 서비스에서 뺐다.

## 폴더 구조

```
data_AI/
├── web/                 # React + TypeScript 웹앱 (추천·지도, Vercel 배포)
│   ├── src/config/      #   날씨 기준값(팀 기준(안)), 화면 기능 스위치
│   ├── src/lib/         #   추천 수식·날씨 규칙·근거 문구
│   └── scripts/         #   파이썬 테스트가 TS 계산을 부를 때 쓰는 CLI
├── tourism_platform/    # 파이썬: 공공데이터 API, 날씨·대비 정보 계산, 데이터 레이크·MongoDB
├── tools/api.py         # 공공데이터 조회 웹 (python tools/api.py local → 127.0.0.1:8000)
└── docs/
    ├── 10주차_작업기록.md  # 작업마다 한 일 / 실행 명령 / 결과 수치 / 오류와 해결
    ├── 근거자료.md         # 보고서용 출처 (열어서 확인한 주소만)
    └── methodology.md     # 수식 ↔ 코드 대응표
```

각 폴더의 자세한 실행 방법은 [`web/README.md`](web/README.md)와 [`tourism_platform/README.md`](tourism_platform/README.md)에 있다.

## 빠른 실행

```bash
# 웹앱
cd web && npm install && npm run dev
npm test                      # 날씨 규칙·근거 문구 테스트

# 파이썬
cd tourism_platform
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev,lake]"
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m tourism_platform.data.fetch_live   # API 연결 상태 확인
```

## 서비스키

공공데이터포털 키는 저장소 루트 `.env`의 환경변수로만 쓴다. 코드와 커밋에는 절대 넣지 않는다(`.env`는 `.gitignore`에 있음).

| 환경변수 | 쓰는 곳 |
|---|---|
| `DATA_GO_KR_SERVICE_KEY` | tourism_platform (일반 인증키 **Decoding**) |
| `API_KEY`, `KCISA_API_KEY` | tools/api.py |
| `TOUR_API_SERVICE_KEY` | web/api (Vercel 서버리스) |
| `VITE_KAKAO_MAP_KEY`, `VITE_KAKAO_REST_API_KEY` | web (`web/.env.local`) |
