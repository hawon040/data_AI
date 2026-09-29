import { Link } from "react-router-dom";
import "./Landing.css";
import "./About.css";

const FEATURES = [
  {
    title: "동행자 교집합 추천",
    how: "동행자 각각의 성·연령 특화지수(LQ) 중 최솟값에 로그 규모를 곱해 지역을 정렬한다. 평균이 아니라 최솟값을 쓰는 이유는, 평균은 한 사람이 매우 좋아하는 곳이 다른 사람의 불만을 가리기 때문이다 — 가장 덜 만족하는 동행자를 기준으로 삼아야 아무도 소외되지 않는다.",
  },
  {
    title: "관광지 2단계 추천",
    how: "1단계로 지역을 고른 뒤, 그 지역 안의 관광지는 기저 인기 지표에 동행자 연령대별 태그 선호 가중치(역사·자연·액티비티·카페 등)를 곱해 다시 정렬한다. 같은 천안시라도 60대에게는 독립기념관이, 10대에게는 맛집 거리가 먼저 뜬다.",
  },
  {
    title: "여행자 관점 안전지수",
    how: "거주 인구가 아니라 관광객 체류를 반영한 유효인구로 위해지수를 나눈다. 범죄는 건수가 아니라 심각도 × 관광 노출 장소 비중으로 계산하고, 3개년 평균과 경험적 베이즈 축소로 소규모 지역의 통계적 요동을 줄인다.",
  },
  {
    title: "실제 장소 연동 & 길찾기",
    how: "추천된 관광지를 클릭하면 카카오 로컬 API로 실제 주소·전화번호를 조회하고, 좌표만으로 만들어지는 카카오맵 길찾기·장소 링크를 함께 보여준다. API 키가 없어도 길찾기 링크는 항상 동작한다.",
  },
  {
    title: "필터 버블 방지 탐색 추천",
    how: "같은 집단이 많이 가는 곳만 계속 추천하면 선택지가 좁아진다. 특화지수는 평균 근처지만 체험지수가 높은 지역, 방문객은 적지만 안전하고 콘텐츠가 다양한 지역을 하나씩 섞어 넣는다.",
  },
  {
    title: "지도 자동 반영",
    how: "추천이 나오면 1위 지역이 자동 선택되어, 클릭하지 않아도 지도에 실제 관광지 이름표가 바로 뜬다. 지도를 쓸 수 없는 환경에서는 좌표 대신 실제 관광지 이름이 목록으로 대체된다.",
  },
];

const CAVEATS = [
  {
    title: "유효인구 이중 계산 오류를 발견해 수정했다",
    detail:
      "이전 방법론은 방문자 수에 체류일수를 또 곱해 이중 계산했다. 수정 전 RMSE 8.9는 거주 인구만 쓴 5.9보다도 나빴다 — 보정을 안 하느니만 못한 결과였다. 체류시간 비율만 곱하는 방식으로 고친 뒤 RMSE 4.6으로 개선을 확인했다.",
  },
  {
    title: "소규모 지역은 3개년 평균 + 경험적 베이즈로 축소한다",
    detail:
      "단년 데이터만 쓰면 인구 3만 명 미만 지역의 오차가 특히 컸다(RMSE 14.7). 3개년 평균으로 46%, 경험적 베이즈 축소를 더해 추가로 15% 줄였다 — 표본이 적은 지역일수록 전국 평균 쪽으로 더 당긴다.",
  },
  {
    title: "안전도는 단일 순위로 보여주지 않는다",
    detail:
      "안전 지표 가중치를 2,000번 무작위로 바꿔보니 순위 변동폭이 매우 컸다. 단일 순위를 공개하면 그 흔들림을 실제 차이처럼 오해하게 된다. 그래서 5단계 등급과 신뢰구간으로만 표시한다.",
  },
  {
    title: "안전도는 추천 순위에 영향을 주지 않는다",
    detail:
      "낮은 등급 지역이 추천에서 사라지면 그 지역 관광객이 줄고 지역 경제가 위축될 수 있다. 두 축을 분리해, 안전도는 참고 정보로만 나란히 보여준다.",
  },
  {
    title: "지역 평균을 개인의 위험으로 해석하지 않도록 명시한다",
    detail:
      "시군구 안전도는 그 지역의 평균일 뿐, 특정 장소나 특정 사람의 위험이 아니다. 지역 통계를 개인 위험으로 잘못 해석하는 것을 생태학적 오류라고 부른다 — 안전 패널에 항상 이 문구를 함께 표시한다.",
  },
  {
    title: "관광지 인기 지표는 근사치임을 밝힌다",
    detail:
      "공공데이터에는 관광지 단위 성·연령 방문 분포가 없다. 그래서 태그별 연령대 선호 가중치라는 보조 가정으로 근사한다 — 실제 서비스에서는 앱 사용자의 방문·저장 기록이 쌓이는 대로 이 가중치를 실측치로 교체해야 한다.",
  },
  {
    title: "모든 검증 수치는 방법론 성능이지 실제 결과가 아니다",
    detail:
      "정밀도 0.842, 동행자 만족 68.3% 같은 숫자는 참값을 아는 가상 지역·가상 동행자로 측정한 몬테카를로 시뮬레이션 결과다. 실제 지역의 결과라고 오인하지 않도록 이 페이지와 랜딩 페이지 모두에 같은 문구를 반복해서 붙인다.",
  },
  {
    title: "지금 화면은 샘플 데이터로 동작한다",
    detail:
      "시범 권역 10개 지역의 방문자·안전 데이터는 전부 합성 데이터다. 실제 서비스로 넘어가려면 tourism_platform 파이썬 패키지가 한국관광 데이터랩·경찰청 등 공공데이터로 계산한 값으로 교체해야 한다.",
  },
];

export function About() {
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
        <div className="hero-eyebrow">HOW IT'S BUILT</div>
        <h1>
          어떤 기능을 <span className="gradient-text">어떻게 만들었고</span>,
          <br />
          무엇을 조심했는지
        </h1>
        <p className="hero-sub">
          이 페이지는 TrueTrip이 실제로 계산하는 방식과, 데이터를 믿을 수 있게 만들기 위해
          처리한 한계들을 숨기지 않고 정리한 것이다.
        </p>
      </header>

      <section className="features">
        <div className="section-head">
          <div className="eyebrow">구현한 기능</div>
          <h2>무엇을, 어떤 방식으로</h2>
        </div>
        <div className="about-feature-list">
          {FEATURES.map((f) => (
            <div key={f.title} className="about-feature-row">
              <h3>{f.title}</h3>
              <p>{f.how}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="methodology">
        <div className="methodology-glow" />
        <div className="methodology-inner">
          <div className="eyebrow teal">DATA RELIABILITY</div>
          <h2>
            데이터 신뢰성을 위해
            <br />
            처리한 것들
          </h2>
          <p>
            숫자를 그럴듯하게 보여주는 것과, 그 숫자가 믿을 만한지 검증하는 것은 다른 일이다.
            아래는 실제로 검증 과정에서 찾아낸 문제와 그 대응이다.
          </p>
        </div>
      </section>

      <section className="caveats">
        {CAVEATS.map((c, i) => (
          <div key={c.title} className="caveat-row">
            <span className="caveat-num">0{i + 1}</span>
            <div>
              <h3>{c.title}</h3>
              <p>{c.detail}</p>
            </div>
          </div>
        ))}
      </section>

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
