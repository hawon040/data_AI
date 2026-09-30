import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArchitectureDiagram } from "../components/ArchitectureDiagram";
import "./Landing.css";
import "./About.css";

interface DataSource {
  name: string;
  status: "live" | "sample" | "planned";
  note: string;
}

interface Solution {
  num: string;
  title: string;
  tagline: string;
  highlight: string;
  problem: string;
  sources: DataSource[];
  why: string;
  formula: string[];
  combine: string;
  result: string;
  errorFix: string;
}

const TOC_ITEMS: { id: string; label: string; color: string }[] = [
  { id: "finding", label: "문제 발견", color: "var(--blue)" },
  { id: "problems", label: "문제 정의", color: "var(--blue)" },
  { id: "architecture", label: "시스템 구조", color: "#a68eea" },
  { id: "solutions", label: "해결 방법", color: "var(--blue)" },
  { id: "stack", label: "기술 스택", color: "var(--teal)" },
  { id: "validation", label: "검증 결과", color: "var(--teal)" },
  { id: "fixes", label: "문제 해결 기록", color: "#e07a3a" },
  { id: "limits", label: "한계", color: "var(--text-muted)" },
];

const HEADLINE_STATS = [
  { value: "2.5배", label: "인기도 단독 대비 추천 정밀도" },
  { value: "82%↓", label: "서로 다른 집단 간 추천 중복률" },
  { value: "53%↓", label: "안전지수 전체 RMSE 개선" },
  { value: "3종", label: "카카오맵 실시간 연동 기능" },
];

const STATUS_LABEL: Record<DataSource["status"], string> = {
  live: "실연동",
  sample: "샘플 대체",
  planned: "연동 예정",
};

const SOLUTIONS: Solution[] = [
  {
    num: "01",
    title: "동행자 교집합 추천",
    tagline: "성별·연령이 다른 동행자 모두가 평균 이상으로 찾는 지역만 고른다",
    highlight: "정밀도 2.5배 ↑ · 중복 추천 82%↓",
    problem:
      "50대 부모와 20대 자녀, 20대 커플, 30대 부부와 60대 부모처럼 성·연령이 섞인 여행은 흔하다. 기존 추천은 한 사람 기준이라 누군가는 양보해야 했다.",
    sources: [
      {
        name: "한국관광 데이터랩 — 지역별 방문자 성·연령 분포",
        status: "sample",
        note: "공공데이터포털 오픈API(data.go.kr, 서비스ID 15101972). 지금은 이 데이터의 실제 응답 구조를 본떠 만든 10개 지역 × 12개 집단 샘플 방문자 수로 대체했다.",
      },
    ],
    why: "지역이 아니라 '지역 × 성별 × 연령대'로 쪼갠 방문자 수가 있어야, 20대 여성이 유독 많이 가는 곳과 60대 남성이 유독 많이 가는 곳을 구분할 수 있다. 다른 관광 데이터(카드사 소비, 통신 유동인구 등)에도 이런 세분류가 있지만, 데이터랩은 성·연령 교차표를 공개 API로 무료 제공하는 몇 안 되는 소스라 1순위로 골랐다.",
    formula: [
      "LQ_ig = (V_ig + k·s_g) / (V_i + k) / s_g   // 입지계수(평활 적용)",
      "Score_ig = LQ_ig × log(V_i)                // 특화지수 × 로그 규모",
      "Score_i^group = min_g(LQ_ig) × log(V_i)    // 동행자 중 최솟값",
    ],
    combine:
      "V_ig(지역i·집단g 방문자), V_i(지역i 전체 방문자), s_g(전국 집단 비중)를 위 식에 넣어 지역별 특화지수를 구한다. 평균이 아니라 최솟값을 쓰는 이유: 평균은 한 사람의 강한 선호가 다른 동행자의 불만을 가리지만, 최솟값은 '가장 덜 만족하는 동행자'를 기준으로 삼아 아무도 소외시키지 않는다. k=50은 표본이 극히 적은 지역의 LQ가 0이나 극단값으로 튀는 것을 막는 평활 계수다.",
    result:
      "정밀도(참 목록과의 일치율) 인기도 단독 0.333 → 특화지수만 0.425 → 결합 0.842. 결합 방식이 인기도 단독보다 약 2.5배 정확했다. 서로 다른 두 집단이 받는 추천 목록의 중복률도 인기도 방식 44.8%에서 결합 방식 8.2%로 줄었다 — '누구에게나 비슷한 추천'이라는 문제가 실제로 해소됐는지 수치로 확인한 값이다.",
    errorFix:
      "평활 계수 k를 0, 50, 200, 1000으로 바꿔가며 정밀도를 비교했다(0.842 → 0.833 → 0.800 → 0.717). k=0과 k=50은 거의 차이가 없지만 k=1000처럼 과하면 개인화가 사라진다. k=50을 최종값으로 택해, 극단적으로 작은 표본만 보정하고 나머지는 원래 신호를 살렸다.",
  },
  {
    num: "02",
    title: "관광지 2단계 추천",
    tagline: "지역을 고른 다음, 그 지역 '안'의 실제 관광지까지 순서를 매긴다",
    highlight: "같은 지역도 연령대별로 1위 관광지가 달라짐",
    problem:
      "공공데이터의 성·연령 분포는 지역(시군구) 단위까지만 있다. 관광지 하나하나에 '20대가 몇 명 왔는지'는 어떤 공공데이터에도 없다.",
    sources: [
      {
        name: "한국관광공사 TourAPI — 지역별 관광지 목록",
        status: "planned",
        note: "실서비스에서 지역 안 관광지 후보 목록을 가져올 소스. 지금은 각 지역의 실제 랜드마크(예: 강릉시 → 경포해변·안목해변 카페거리·강릉중앙시장) 10곳 × 3~4개를 직접 큐레이션해 대체했다.",
      },
      {
        name: "데이터랩 목적지 검색량 등 관광지 단위 인기 지표",
        status: "planned",
        note: "제공 범위(관광지 단위로 실제 나오는지)를 원자료로 확인해야 하는 항목 — 확인 전까지는 0~100 사이 기저 인기 점수를 수동으로 부여했다.",
      },
    ],
    why: "1단계(지역)만으로 끝내면 '강릉시'까지만 알려주고 정작 강릉의 어디로 가야 하는지는 사용자가 직접 찾아야 한다. 2단계가 있어야 지도에 찍을 수 있는 실제 목적지가 나온다.",
    formula: [
      "personAffinity(p, tags) = mean( ageTagWeight[p.ageGroup][t] for t in tags )",
      "matchScore = popularityScore × min_p( personAffinity(p, tags) )",
    ],
    combine:
      "관광지마다 태그(역사·자연·액티비티·맛집·카페·쇼핑·문화·테마파크·리조트·전망)를 붙이고, 연령대별로 그 태그를 얼마나 선호하는지 가중치(1.0이 전국 평균)를 매겼다. 예: 60대는 역사 1.3배·액티비티 0.65배, 10대는 카페 1.2배·역사 0.7배. 동행자가 여럿이면 1단계와 같은 최솟값 원칙을 그대로 적용해, 한 명만 좋아하는 곳이 위로 튀지 않게 했다.",
    result:
      "같은 천안시를 추천받아도 60대 이상 여성에게는 독립기념관(90×1.3=117점)이 1위로, 10대 남성에게는 병천순대거리(72×1.1=79.2점)가 1위로 바뀐다. 실제 화면에서 두 연령대로 각각 추천받아 순서가 달라지는 것을 확인했다.",
    errorFix:
      "이 가중치 표는 실측 데이터가 아니라 상식적 가정(고령층은 역사·문화, 청소년은 카페·액티비티 선호)에 근거한 근사치다. 앱 사용자의 실제 방문·저장 기록이 쌓이면 이 표를 실측 가중치로 교체해야 한다는 한계를 코드 주석과 이 페이지에 명시해 뒀다 — 근거 없는 정밀도를 주장하지 않기 위해서다.",
  },
  {
    num: "03",
    title: "여행자 관점 안전지수",
    tagline: "거주 인구가 아니라 관광객 체류를 반영해 안전도를 다시 계산한다",
    highlight: "RMSE 8.8 → 4.1 (소규모 지역 14.7 → 6.8)",
    problem:
      "행정안전부 지역안전지수 같은 기존 지표는 거주민 관점이다. 거주 인구를 분모로 쓰면 관광객이 몰리는 지역은 실제 체류 인구보다 훨씬 적은 수로 나눠져 위험이 부풀려진다.",
    sources: [
      {
        name: "경찰청 범죄 발생 지역별/장소별 통계",
        status: "planned",
        note: "공공데이터포털(범죄 발생 지역별 통계, 범죄 발생 장소별 통계). 군 지역이 개별 제공되는지가 최우선 확인 대상 — 안 되면 전국 경찰서별 강력범죄 발생 현황으로 대체해야 한다. 지금은 지역별 위해지수 값을 합성 데이터로 대체했다.",
      },
      {
        name: "도로교통공단 보행자 사고 통계 / 소방청 화재 통계 / 국립중앙의료원 응급의료기관 위치",
        status: "planned",
        note: "보행자 사고율·화재율·응급 접근성 하위 지표의 소스. 지금은 지역별로 그럴듯한 범위의 샘플 수치를 부여했다.",
      },
      {
        name: "한국관광 데이터랩 방문자 수 + 체류시간",
        status: "sample",
        note: "유효인구 계산의 분자(V_i^pd)와 체류시간(h̄) 항에 쓰인다 — 01번 항목과 같은 소스.",
      },
    ],
    why: "안전 지표 자체는 여러 기관에 흩어져 있지만 이미 신뢰할 수 있는 국가 통계다. 문제는 이걸 '관광객 관점'으로 바꿀 방법이 없었다는 것 — 그래서 분모(유효인구)를 다시 설계하는 쪽을 해결 방법으로 택했다.",
    formula: [
      "P_i^eff = P_i^res + (V_i^pd × h̄_i / 24) / 365      // 유효인구",
      "H_i = Σ_k s_k · λ_k · C̄_ik                          // 위해지수",
      "R̂_i = w_i·R_i + (1-w_i)·R̄,  w_i = σ²/(σ²+R̄/P_i^eff)  // 경험적 베이즈 축소",
    ],
    combine:
      "데이터랩 방문자 수는 이미 '방문자·일' 단위로 집계돼 있어서, 하루 중 체류시간 비율(h̄/24)만 곱해 거주 인구에 더한다. 범죄는 건수를 그냥 더하지 않고, 양형기준 기반 심각도(s_k)와 그 범죄가 노상·유원지·숙박업소 등 여행자가 머무는 장소에서 발생한 비중(λ_k)을 곱해 합산한다. 마지막으로 3개년 평균을 낸 값에 경험적 베이즈 축소를 적용해, 표본이 적은 소규모 지역의 통계적 요동을 전국 평균 쪽으로 당긴다.",
    result:
      "분모 비교: 거주 인구만 RMSE 5.9(순위상관 0.930) → 이전 이중계산 방식 RMSE 8.9(0.834, 보정 안 한 것보다 나쁨) → 수정한 유효인구 RMSE 4.6(0.941, 가장 정확). 3개년 평균+베이즈 축소까지 더하면 전체 RMSE 8.8→4.1, 인구 3만 명 미만 소규모 지역은 14.7→6.8로 개선됐다.",
    errorFix:
      "이전 방법론은 이미 '방문자·일' 단위인 방문자 수에 평균 체류일수를 또 곱해 이중 계산하는 오류가 있었다. 이 오류는 발견 즉시 수정했고, '보정을 아예 안 하는 것(거주 인구만, RMSE 5.9)'보다도 이전 오류 버전(RMSE 8.9)이 더 나쁘다는 것을 시뮬레이션으로 확인한 뒤에야 수정이 실제로 개선인지 확신할 수 있었다. 소규모 지역은 3개년 평균(46%↓)과 경험적 베이즈 축소(추가 15%↓)를 겹쳐 적용해 표본 부족에서 오는 요동을 줄였다.",
  },
  {
    num: "04",
    title: "실제 장소 연동 & 길찾기",
    tagline: "추천 관광지를 실제 지도 위 좌표·주소·길안내로 바로 연결한다",
    highlight: "카카오맵 SDK·로컬 API·길찾기 링크 3종 실연동",
    problem:
      "관광지 이름과 대략적인 좌표만 있으면 추천은 되지만, 사용자가 실제로 거기에 '찾아갈' 수는 없다.",
    sources: [
      {
        name: "카카오맵 JavaScript SDK",
        status: "live",
        note: "지도 렌더링과 마커. VITE_KAKAO_MAP_KEY(JavaScript 키)로 동작하며, 키가 없거나 로드에 실패하면 실제 관광지 이름을 텍스트 목록으로 보여주는 폴백으로 전환한다.",
      },
      {
        name: "카카오 로컬 API (키워드 검색)",
        status: "live",
        note: "dapi.kakao.com/v2/local/search/keyword.json. VITE_KAKAO_REST_API_KEY(REST 키, JS 키와 별개)가 있을 때만 호출되며, 실제 도로명주소·전화번호·카카오맵 상세페이지 링크를 가져온다.",
      },
      {
        name: "카카오맵 웹 링크 (길찾기/검색)",
        status: "live",
        note: "map.kakao.com/link/to/{이름},{위도},{경도} 형태의 URL. API 키가 전혀 필요 없어 좌표만 있으면 항상 동작한다.",
      },
    ],
    why: "국내 서비스 중 지도·로컬 검색·길찾기를 하나의 생태계로 묶을 수 있는 게 카카오맵이고, 신청서 5.1에서 이미 이 스택(React+TS+카카오맵)을 쓰기로 정해 뒀다. API 키가 없어도 최소한의 길찾기 기능은 살아있어야 한다고 판단해, '키 불필요 링크'와 'REST 키로 보강되는 상세 정보'를 분리해서 설계했다.",
    formula: [
      "keyword.json?query={관광지명}&x={경도}&y={위도}&radius=3000&size=1",
      "directionsUrl = map.kakao.com/link/to/{이름},{위도},{경도}",
    ],
    combine:
      "관광지 이름 그대로를 키워드로, 우리가 갖고 있는 좌표 반경 3km 안에서 검색해 첫 결과를 채택한다 — 샘플 좌표가 실제 건물 위치와 정확히 일치하지 않을 수 있어서 반경을 넉넉히 뒀다. 검색이 실패하거나 REST 키가 없으면 place_url 대신 이름 검색 링크로, 대신 길찾기 링크는 좌표만으로 별도로 항상 생성한다.",
    result:
      "관광지 이름을 클릭하면(지도 마커, 추천 카드의 칩, 지도 폴백 목록 어디서든) 상세 패널이 열리고 '길찾기'·'카카오맵에서 보기' 버튼이 뜬다. 길찾기 링크는 Playwright로 좌표가 정확히 인코딩되는지 끝까지 검증했다.",
    errorFix:
      "이 리포지토리가 올라간 클라우드 환경은 카카오 서버로 나가는 네트워크 자체가 막혀 있어, 카카오 로컬 API의 실제 응답은 이 환경에서 검증하지 못했다 — API 문서 스펙대로 구현은 했지만 사용자의 로컬 환경에서 REST 키로 실제 호출까지 확인하는 절차가 남아 있다. 이 한계를 숨기지 않고 README와 이 페이지에 명시했다.",
  },
  {
    num: "05",
    title: "필터 버블 방지 탐색 추천",
    tagline: "같은 집단에게 항상 같은 곳만 추천되는 것을 막는다",
    highlight: "메인 추천과 겹치지 않는 '숨은 명소' 자동 발굴",
    problem:
      "특화지수 상위 지역만 계속 보여주면, 그 집단이 원래 자주 가던 곳만 강화되고 새로운 선택지가 드러나지 않는다.",
    sources: [
      {
        name: "01·02번과 동일한 방문자·경험지수 데이터",
        status: "sample",
        note: "별도의 외부 데이터를 추가로 쓰지 않고, 이미 계산한 LQ와 자체 정의한 experienceScore(체험 콘텐츠 다양성, 0~100)만 재사용한다.",
      },
    ],
    why: "새 데이터를 더 모으기보다, 이미 가진 지표를 다른 기준으로 한 번 더 필터링하는 쪽이 실서비스 초기 단계에서 더 현실적이다.",
    formula: [
      "near_average = |avgLQ - 1| < 0.3 인 지역 중 experienceScore 최댓값",
      "hidden_gem   = safety.grade ≤ 2 & experienceScore ≥ 60 인 지역 중 totalVisitors 최솟값",
    ],
    combine:
      "메인 추천 목록에서 이미 뽑힌 지역은 제외한 뒤, ①특화지수는 평균(1.0) 근처지만 체험지수가 높은 지역 하나, ②방문객은 적지만 안전 등급이 높고 체험지수도 높은 '숨은 명소' 하나를 골라 '이런 곳은 어때요?' 섹션에 별도로 보여준다.",
    result:
      "20대 남녀 조합으로 테스트하면 메인 추천은 강릉·청주·춘천처럼 20대 밀집 지역이 나오고, 탐색 추천에는 평창군·정선군처럼 특화지수는 낮지만(0.5~0.7배) 안전·체험 점수가 높은 지역이 함께 뜬다 — 실제 화면에서 확인했다.",
    errorFix:
      "메인 추천과 탐색 추천이 겹치지 않도록 exclude 목록으로 명시적으로 걸러내고, 두 후보(near_average, hidden_gem)가 같은 지역으로 겹치는 경우도 중복 제거하도록 처리했다.",
  },
  {
    num: "06",
    title: "지도 자동 반영",
    tagline: "클릭하지 않아도 1위 추천지가 지도에 바로 뜬다",
    highlight: "추천 즉시 지도가 스스로 반응",
    problem:
      "추천 목록만 텍스트로 나열하면 지도는 장식이 되고, 사용자가 매번 카드를 눌러야 지도가 움직인다 — 지도를 쓸 이유가 줄어든다.",
    sources: [
      { name: "위 01~04번 결과를 그대로 재사용", status: "live", note: "추가 데이터·API 없이, 이미 계산된 추천 결과와 관광지 좌표를 화면 상태(state)로 연결하는 프론트엔드 로직이다." },
    ],
    why: "지도가 추천 결과를 '보여주는 도구'가 아니라 '추천의 일부'가 되려면, 사용자의 동작을 기다리지 않고 먼저 반응해야 한다고 판단했다.",
    formula: ["useEffect: recommendations.length > 0 && selectedRegion == null → selectedRegion = recommendations[0].region"],
    combine:
      "추천이 새로 계산되면 선택 상태를 한 번 초기화하고, 1위 지역을 자동으로 선택 상태로 세팅한다. 사용자가 다른 카드를 직접 클릭하면 그 이후로는 자동 선택이 덮어쓰지 않도록, '선택된 게 없을 때만' 자동 선택이 개입하게 만들었다.",
    result:
      "동행자 정보를 입력하고 추천받기를 누르는 즉시 지도에 1위 지역의 실제 관광지 이름표와 안전 정보 패널이 함께 뜬다 — 클릭 한 번을 줄인 것 같지만, 지도를 '보게 만드는' 효과가 크다.",
    errorFix:
      "자동 선택과 사용자 선택이 충돌하지 않도록 상태를 하나로 통일하고, 새 검색(폼 재제출) 시에는 이전 선택을 명시적으로 초기화해 오래된 관광지 상세 패널이 새 지역 위에 남아있는 버그를 막았다.",
  },
];

const STACK = [
  ["화면", "React 19 + TypeScript", "컴포넌트로 화면을 나누고 타입으로 실수를 줄인다", "web/src/"],
  ["라우팅", "React Router", "랜딩 · 추천 도구 · 구현 방식을 별도 URL로 분리", "web/src/App.tsx"],
  ["빌드 도구", "Vite", "개발 서버와 배포용 정적 파일을 만든다", "web/"],
  ["지도", "카카오맵 JavaScript SDK", "지도 렌더링, 지역·관광지 마커와 이름표", "components/MapView.tsx"],
  ["실제 장소 조회", "카카오 로컬 API (REST)", "실제 주소·전화번호·상세페이지 링크 조회", "lib/kakaoLocal.ts"],
  ["추천 · 안전지수 로직", "TypeScript (브라우저 내 계산)", "LQ·그룹점수·관광지 매치·안전지수를 클라이언트에서 직접 계산", "lib/indices.ts, lib/recommend.ts"],
  ["검증 패키지", "Python + NumPy + SciPy", "같은 수식을 독립적으로 재현해 몬테카를로로 검증", "tourism_platform/"],
  ["테스트", "pytest", "23개 단위 테스트로 수식의 경계 조건을 확인", "tourism_platform/tests/"],
  ["프론트 배포", "Vercel", "GitHub push 시 자동 빌드·배포", "web-tawny-nine-15.vercel.app"],
  ["버전 관리", "Git + GitHub", "웹앱과 파이썬 패키지를 한 저장소에서 관리", "hawon040/data_AI"],
];

const FIXLOG = [
  [
    "경험적 베이즈 축소가 전혀 효과 없음",
    "안전지수 계산에서 인구를 '10만 명 단위'로 맞추지 않고 원래 규모(수만~수백만)를 그대로 넘겨, 축소 가중치가 항상 1에 가까워짐",
    "rate 계산에 쓴 것과 같은 단위(유효인구/100,000)로 맞춰 전달하도록 수정",
  ],
  [
    "3개년 평균+베이즈 축소가 단순 3개년 평균보다도 나쁨",
    "3개년 평균의 표집분산을 단년 분산 그대로 써서 지역 간 참분산(σ²)이 과소 추정됨",
    "표집분산을 연도 수(3)로 나눠 3개년 평균에 맞는 분산으로 스케일 조정",
  ],
  [
    "수정한 유효인구 방식이 거주 인구만 쓴 것보다 처음엔 더 나쁨",
    "데이터랩 방문자 수가 이미 '방문자·일' 단위인데 체류일수를 또 곱해 이중 계산",
    "체류시간 비율(h̄/24)만 곱하도록 수식을 고치고 몬테카를로로 개선을 재확인",
  ],
  [
    "카카오 로컬 API 실제 응답을 이 환경에서 검증 불가",
    "개발 환경의 네트워크 정책이 카카오 서버로 나가는 요청 자체를 차단",
    "API 문서 스펙대로 구현하고, README에 로컬 환경에서 REST 키로 재확인이 필요하다는 한계를 명시",
  ],
  [
    "git push가 거절됨 (fetch first)",
    "같은 브랜치에 다른 세션에서 이미 커밋이 올라가 있었음",
    "git fetch로 원격 변경 내용을 먼저 확인한 뒤 충돌 없이 merge하고 다시 push",
  ],
  [
    "기본 Vite 템플릿 CSS가 새 레이아웃과 충돌",
    "index.css가 가운데 정렬·고정 폭(1126px)·큰 제목 크기를 기본값으로 깔고 있었음",
    "index.css를 최소 리셋으로 교체하고 모든 페이지 스타일을 새로 작성",
  ],
];

const VALIDATION_SUMMARY = [
  { metric: "추천 정밀도", values: "인기도 0.333 → 특화지수 0.425 → 결합 0.842", note: "결합 방식이 약 2.5배 정확" },
  { metric: "추천 개인화(중복도)", values: "인기도 44.8% → 결합 8.2%", note: "낮을수록 집단별 추천이 서로 다르다는 뜻" },
  { metric: "동행자 전원 만족 비율", values: "인기도 14.5% · 대표자 24.5% · 평균 47.9% · 최솟값 68.3%", note: "최솟값 방식이 가장 높음" },
  { metric: "안전지수 분모 RMSE", values: "거주인구만 5.9 · 이전 이중계산 8.9 · 수정 유효인구 4.6", note: "이중계산 오류가 무보정보다도 나빴음" },
  { metric: "3개년평균+베이즈 RMSE", values: "단년 8.8 → 3개년평균 4.6(46%↓) → +베이즈 4.1(추가15%↓)", note: "소규모 지역(인구 3만 미만)은 14.7→6.8" },
  { metric: "4분면 분류 안정성", values: "관측잡음만으로 평균 17.9% 오분류, 39.2%는 반복시 20%+ 변동", note: "그래서 경계대역(중앙값±0.25SD) 표시 채택" },
  { metric: "안전도 순위 불확실성", values: "가중치 2,000회 무작위 변경 시 90%구간 폭 중앙값 77.5위(250곳 중)", note: "단일 순위 대신 5단계 등급 채택 근거" },
];

function SolutionCard({ s }: { s: Solution }) {
  return (
    <div className="solution-card">
      <div className="solution-head">
        <span className="solution-num">{s.num}</span>
        <div>
          <h3>{s.title}</h3>
          <p className="solution-tagline">{s.tagline}</p>
        </div>
        <span className="solution-highlight">{s.highlight}</span>
      </div>

      <p className="solution-problem">
        <strong>발견한 문제 — </strong>
        {s.problem}
      </p>

      <div className="solution-block">
        <div className="solution-label">사용한 데이터 · API</div>
        <ul className="source-list">
          {s.sources.map((src) => (
            <li key={src.name}>
              <span className={`source-status status-${src.status}`}>{STATUS_LABEL[src.status]}</span>
              <div>
                <strong>{src.name}</strong>
                <p>{src.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="solution-block">
        <div className="solution-label">왜 이 데이터인가</div>
        <p>{s.why}</p>
      </div>

      <div className="solution-block">
        <div className="solution-label">어떻게 조합했나</div>
        <pre className="formula-block">{s.formula.join("\n")}</pre>
        <p>{s.combine}</p>
      </div>

      <div className="solution-block">
        <div className="solution-label">결과</div>
        <p>{s.result}</p>
      </div>

      <div className="solution-block">
        <div className="solution-label">오차를 줄인 방법</div>
        <p>{s.errorFix}</p>
      </div>
    </div>
  );
}

export function About() {
  const [activeId, setActiveId] = useState<string>(TOC_ITEMS[0].id);

  useEffect(() => {
    const sections = TOC_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveId(top.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing about-page">
      <nav className="landing-nav">
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="brand-mark">T</div>
          <span className="brand-name">TrueTrip</span>
        </Link>
        <div className="nav-links">
          <Link to="/">홈</Link>
          <Link to="/app">추천 도구</Link>
        </div>
        <Link to="/app" className="pill-button primary compact">
          추천받으러 가기
        </Link>
      </nav>

      <header className="about-hero">
        <div className="hero-eyebrow">IDEA · PROBLEM · SOLUTION</div>
        <h1>
          같이 가는 모두가 만족할 여행지를,
          <br />
          <span className="gradient-text">진짜 이동 데이터</span>로 찾는다
        </h1>
        <p className="hero-sub">
          아이디어명부터 문제 발견, 각 기능이 실제로 어떤 데이터·API를 어떤 방식으로 조합해
          결과를 냈고 그 오차를 어떻게 줄였는지까지 — 숨기지 않고 전부 정리했다.
        </p>
        <div className="headline-stats" aria-label="핵심 검증 결과 요약">
          {HEADLINE_STATS.map((stat) => (
            <div className="headline-stat" key={stat.label}>
              <div className="headline-stat-value">{stat.value}</div>
              <div className="headline-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="about-layout">
        <aside className="about-toc">
          <nav aria-label="구현 방식 목차">
            {TOC_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={activeId === item.id ? "active" : undefined}
              >
                <span className="toc-dot" style={{ background: item.color }} />
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="about-main">
          <section className="about-section" id="finding">
            <div className="section-head">
              <div className="eyebrow">01 · 문제 발견</div>
              <h2>왜 이 서비스가 필요한가</h2>
            </div>
            <div className="finding-grid">
              <div className="finding-card">
                <div className="finding-value">3억 90만 회</div>
                <div className="finding-label">2025년 국내여행 횟수 (전년比 +3.1%)</div>
              </div>
              <div className="finding-card">
                <div className="finding-value">39조 5000억 원</div>
                <div className="finding-label">2025년 국내여행 지출액 (전년比 +7.3%)</div>
              </div>
              <div className="finding-card">
                <div className="finding-value">1,894만 명</div>
                <div className="finding-label">2025년 방한 외래관광객 (전년比 +15.7%)</div>
              </div>
            </div>
            <p className="finding-text">
              수치 출처: 2025년 국민여행조사, 한국관광공사 방한관광객 통계. 여행 수요는 커지고
              있지만, 빅데이터학과 수업에서 관광 공공데이터를 분석하며 두 가지 간극을 발견했다.
              첫째, 한국관광 데이터랩은 지역별 성·연령 방문 분포를 보여주지만 이 정보는 통계
              화면에만 머물 뿐 여행자의 실제 목적지 선택에는 쓰이지 않는다 — 그래서 기존 서비스는
              20대 여성과 60대 남성에게 똑같은 추천 목록을 준다. 둘째, 여행자가 참고할 안전
              정보는 경찰청·도로교통공단·소방청·국립중앙의료원·지자체에 흩어져 있어 추천 결과와
              나란히 비교할 방법이 없다.
            </p>
          </section>

          <section className="about-section problems" id="problems">
            <div className="section-head">
              <div className="eyebrow">02 · 문제 정의</div>
              <h2>구체적으로 누구의 어떤 문제인가</h2>
            </div>
            <div className="problem-list">
              <div className="problem-row">
                <span className="problem-num">1</span>
                <p>
                  <strong>동행자 간 취향 충돌</strong> — 50대 부모와 20대 자녀처럼 성·연령이 섞인
                  여행에서, 한 사람 기준 추천은 누군가의 양보를 전제한다.
                </p>
              </div>
              <div className="problem-row">
                <span className="problem-num">2</span>
                <p>
                  <strong>획일적 추천</strong> — 전체 인기도로 정렬하면 대형 관광지가 모든 집단에게
                  똑같이 상위에 오르고, 특정 집단이 유독 즐겨 찾는 곳은 드러나지 않는다.
                </p>
              </div>
              <div className="problem-row">
                <span className="problem-num">3</span>
                <p>
                  <strong>추천 근거에 대한 불신</strong> — 리뷰·블로그는 체험단과 광고로 왜곡될 수
                  있어 여행자가 무엇을 믿어야 할지 판단하기 어렵다.
                </p>
              </div>
              <div className="problem-row">
                <span className="problem-num">4</span>
                <p>
                  <strong>안전 정보의 분리</strong> — 여행지를 고르는 화면과 안전 정보를 확인하는
                  곳이 따로 있어, 추천받은 뒤 안전을 별도로 찾아봐야 한다.
                </p>
              </div>
              <div className="problem-row">
                <span className="problem-num">5</span>
                <p>
                  <strong>계획 후 끝나는 사용</strong> — 여행 앱은 대부분 계획할 때 한 번 쓰고
                  끝난다. 여행 중 '지금 근처 어디로 갈지'를 알려주는 정보는 없다.
                </p>
              </div>
            </div>
          </section>

          <section className="about-section" id="architecture">
            <div className="section-head">
              <div className="eyebrow">03 · 시스템 구조</div>
              <h2>요청이 화면에서 실제 API까지 가는 길</h2>
            </div>
          </section>
          <div className="diagram-wrap">
            <div className="diagram-card">
              <ArchitectureDiagram />
              <div className="diagram-legend">
                <span><i style={{ borderColor: "var(--blue)" }} />실시간 연동</span>
                <span><i style={{ borderColor: "var(--text-muted)", borderTopStyle: "dashed" }} />연동 예정 · 참고용</span>
              </div>
            </div>
            <p className="finding-text" style={{ marginTop: 16 }}>
              추천·안전지수 계산은 서버 없이 <strong style={{ color: "var(--text-primary)" }}>브라우저 안에서</strong>{" "}
              바로 실행된다 — 별도 백엔드 API를 두지 않고, React 앱이 코드에 내장된 샘플 데이터를 읽어
              그 자리에서 수식을 계산한다. 지도·실제 위치 조회만 카카오 서버와 실시간으로 통신한다.
              tourism_platform(파이썬)은 이 웹앱과 별개로 GitHub에서 실행되는 검증 전용 패키지로,
              같은 수식을 독립적으로 재현해 몬테카를로 시뮬레이션으로 맞는지 확인하는 역할만 한다.
            </p>
          </div>

          <section className="about-section" id="solutions">
            <div className="section-head">
              <div className="eyebrow">04 · 해결 방법</div>
              <h2>기능마다 — 데이터, 이유, 조합, 결과, 오차 감소</h2>
            </div>
            <div className="solution-list">
              {SOLUTIONS.map((s) => (
                <SolutionCard key={s.num} s={s} />
              ))}
            </div>
          </section>

          <section className="about-section" id="stack">
            <div className="section-head">
              <div className="eyebrow">05 · 기술 스택</div>
              <h2>무엇으로 만들었나</h2>
            </div>
          </section>
          <div className="validation-table-wrap">
            <table className="validation-table">
              <thead>
                <tr>
                  <th>층</th>
                  <th>기술</th>
                  <th>맡은 역할</th>
                  <th>위치</th>
                </tr>
              </thead>
              <tbody>
                {STACK.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="methodology" id="validation">
            <div className="methodology-glow" />
            <div className="methodology-inner">
              <div className="eyebrow teal">06 · 검증 결과 총정리</div>
              <h2>
                숫자로 다시 확인한
                <br />
                방법론의 효과
              </h2>
              <p>
                모두 참값을 아는 가상 지역·가상 동행자로 측정한 몬테카를로 시뮬레이션 결과다.
                실제 지역의 결과가 아니라 &ldquo;이 계산 방식이 대안보다 낫다&rdquo;는 방법론
                검증이며, tourism_platform 파이썬 패키지에서 재현해 동일한 방향의 결론을 다시
                확인했다.
              </p>
            </div>
          </section>

          <div className="validation-table-wrap">
            <table className="validation-table">
              <thead>
                <tr>
                  <th>지표</th>
                  <th>비교값</th>
                  <th>의미</th>
                </tr>
              </thead>
              <tbody>
                {VALIDATION_SUMMARY.map((row) => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.values}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="about-section" id="fixes">
            <div className="section-head">
              <div className="eyebrow">07 · 문제 해결 기록</div>
              <h2>개발하면서 실제로 겪은 문제와 해결</h2>
            </div>
          </section>
          <div className="validation-table-wrap">
            <table className="validation-table">
              <thead>
                <tr>
                  <th>증상</th>
                  <th>원인</th>
                  <th>해결</th>
                </tr>
              </thead>
              <tbody>
                {FIXLOG.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="about-section" id="limits">
            <div className="section-head">
              <div className="eyebrow">08 · 한계와 다음 단계</div>
              <h2>지금 이 데모가 못 하는 것</h2>
            </div>
            <div className="problem-list">
              <div className="problem-row">
                <span className="problem-num">·</span>
                <p>
                  위 표의 &ldquo;연동 예정&rdquo; 데이터(데이터랩 실데이터, 경찰청 통계, TourAPI)는
                  아직 샘플로 대체돼 있다 — 공간 단위·연령 구간 제공 범위를 원자료로 확인하는 절차가
                  남아 있다.
                </p>
              </div>
              <div className="problem-row">
                <span className="problem-num">·</span>
                <p>
                  카카오 로컬 API 실제 호출은 이 개발 환경의 네트워크 제한으로 라이브 검증을 못
                  했다 — 로컬 환경에서 REST 키로 한 번 더 확인이 필요하다.
                </p>
              </div>
              <div className="problem-row">
                <span className="problem-num">·</span>
                <p>
                  관광지 연령대 선호 가중치는 실측이 아닌 가정이다 — 실사용자 데이터가 쌓이면
                  교체해야 한다.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="cta-band">
        <div className="cta-glow" />
        <div>
          <h2>
            궁금한 계산이 있다면
            <br />
            코드에서 직접 확인할 수 있다
          </h2>
          <p>추천·안전지수 수식은 웹앱과 파이썬 검증 패키지에 같은 로직으로 들어 있다.</p>
        </div>
        <Link to="/app" className="pill-button primary">
          추천 도구로 가기
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="footer-bottom">
          <span>샘플 데이터 기반 데모입니다. 실제 서비스가 아닙니다.</span>
          <span>DATA-DRIVEN · NO ADS</span>
        </div>
      </footer>
    </div>
  );
}
