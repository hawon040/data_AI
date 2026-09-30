/**
 * TrueTrip 시스템 구조도 — 빅딩 아틀라스 문서의 다이어그램 문법(역할별 색상의
 * 둥근 사각형 노드 + 라벨 붙은 화살표 + 점선=연동 예정)을 우리 다크 테마로
 * 옮겨 손으로 그렸다. 실제 데이터가 10개뿐이라 자동 배치 대신 고정 좌표를 썼다.
 */
export function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 980 320"
      role="img"
      aria-label="TrueTrip 시스템 구조: 사용자 브라우저가 Vercel에 배포된 React 앱에 접속하고, 앱은 카카오맵 SDK와 카카오 로컬 API를 실시간으로 호출한다. 지금은 코드에 내장한 샘플 데이터를 쓰고, 데이터랩·경찰청·TourAPI 같은 공공데이터 연동은 예정 상태다. 파이썬 tourism_platform 패키지는 같은 계산식을 독립적으로 재현해 검증한다."
      className="arch-svg"
    >
      <defs>
        <marker id="archArrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="arch-arrow-blue" />
        </marker>
        <marker id="archArrowMuted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="arch-arrow-muted" />
        </marker>
      </defs>

      {/* 프론트엔드 zone */}
      <rect x={180} y={16} width={300} height={260} rx={14} className="arch-zone" strokeDasharray="5 4" />
      <text x={196} y={38} className="arch-zone-label">프론트엔드 — Vercel 배포</text>

      {/* edges (zone 밑에, 노드보다 먼저 그려서 노드가 위로 오게) */}
      <line x1={146} y1={170} x2={198} y2={90} className="arch-edge-live" markerEnd="url(#archArrowBlue)" />
      <text x={176} y={119} className="arch-edge-label" textAnchor="middle">접속</text>

      <line x1={460} y1={72} x2={514} y2={46} className="arch-edge-live" markerEnd="url(#archArrowBlue)" />
      <text x={472} y={52} className="arch-edge-label" textAnchor="end">지도 렌더링</text>

      <line x1={460} y1={100} x2={514} y2={120} className="arch-edge-live" markerEnd="url(#archArrowBlue)" />
      <text x={474} y={122} className="arch-edge-label" textAnchor="end">실제 위치 조회</text>

      <line x1={460} y1={216} x2={514} y2={202} className="arch-edge-planned" strokeDasharray="5 4" markerEnd="url(#archArrowMuted)" />
      <text x={487} y={196} className="arch-edge-label muted" textAnchor="middle">연동 예정</text>

      <path d="M852,190 Q 650,264 462,222" fill="none" className="arch-edge-planned" strokeDasharray="5 4" markerEnd="url(#archArrowMuted)" />
      <text x={650} y={280} className="arch-edge-label muted" textAnchor="middle">같은 공식 재현·검증</text>

      {/* 사용자 */}
      <rect x={16} y={138} width={130} height={64} rx={10} className="arch-node arch-client" />
      <text x={81} y={166} textAnchor="middle" className="arch-node-title">사용자</text>
      <text x={81} y={184} textAnchor="middle" className="arch-node-sub">브라우저</text>

      {/* React 앱 */}
      <rect x={200} y={52} width={260} height={64} rx={9} className="arch-node arch-data" />
      <text x={330} y={76} textAnchor="middle" className="arch-node-title">React + TypeScript 앱</text>
      <text x={330} y={94} textAnchor="middle" className="arch-node-sub">추천·안전지수 계산은 브라우저에서 실행</text>

      {/* 화면들 */}
      <rect x={200} y={128} width={260} height={52} rx={9} className="arch-node arch-client" />
      <text x={330} y={150} textAnchor="middle" className="arch-node-title">화면 3개</text>
      <text x={330} y={167} textAnchor="middle" className="arch-node-sub">랜딩 · 추천 도구 · 구현 방식</text>

      {/* 샘플 데이터 */}
      <rect x={200} y={192} width={260} height={48} rx={9} className="arch-node arch-data" />
      <text x={330} y={212} textAnchor="middle" className="arch-node-title">샘플 데이터 (지금)</text>
      <text x={330} y={229} textAnchor="middle" className="arch-node-sub">10개 지역·관광지가 코드에 내장</text>

      {/* 카카오맵 SDK */}
      <rect x={516} y={16} width={200} height={60} rx={9} className="arch-node arch-store" />
      <text x={616} y={40} textAnchor="middle" className="arch-node-title">카카오맵 JS SDK</text>
      <text x={616} y={58} textAnchor="middle" className="arch-node-sub">지도 렌더링</text>

      {/* 카카오 로컬 API */}
      <rect x={516} y={90} width={200} height={60} rx={9} className="arch-node arch-store" />
      <text x={616} y={114} textAnchor="middle" className="arch-node-title">카카오 로컬 API</text>
      <text x={616} y={132} textAnchor="middle" className="arch-node-sub">실제 주소·전화번호 조회</text>

      {/* 공공데이터 (연동 예정) */}
      <rect x={516} y={164} width={200} height={76} rx={9} className="arch-node arch-planned" strokeDasharray="4 3" />
      <text x={616} y={188} textAnchor="middle" className="arch-node-title">공공데이터 API</text>
      <text x={616} y={205} textAnchor="middle" className="arch-node-sub">데이터랩 · 경찰청</text>
      <text x={616} y={220} textAnchor="middle" className="arch-node-sub">TourAPI (연동 예정)</text>

      {/* tourism_platform */}
      <rect x={752} y={110} width={200} height={80} rx={9} className="arch-node arch-ctl" />
      <text x={852} y={136} textAnchor="middle" className="arch-node-title">tourism_platform</text>
      <text x={852} y={154} textAnchor="middle" className="arch-node-sub">Python · 같은 수식 검증 전용</text>
      <text x={852} y={169} textAnchor="middle" className="arch-node-sub">GitHub (별도 실행)</text>
    </svg>
  );
}
