/**
 * 기상특보 배너(기상청 기상특보 조회서비스, 오늘·내일만).
 *  - 고른 지역(시군구)에 발효 중이면 추천 목록 위에 눈에 띄게
 *  - 같은 시도의 다른 시군에만 있으면 "인근 시군 특보 있음"으로 약하게
 * 지형 제외는 weatherRules의 기존 규칙이 하고, 빠진 곳은 "날씨 때문에 제외된 곳"에 이유와 함께 남는다.
 */
export function WarningBanner({
  regionName,
  here,
  nearby,
  terrainExcluded,
}: {
  regionName: string;
  here: string[];
  nearby: string[];
  terrainExcluded: boolean;
}) {
  if (here.length > 0) {
    return (
      <div className="warning-banner" role="alert">
        <strong>{regionName}에 {here.join(", ")} 발효 중</strong>
        <span>
          {terrainExcluded
            ? "바다·산·계곡 관광지는 추천에서 뺐어요. 빠진 곳은 아래 '날씨 때문에 제외된 곳'에서 볼 수 있어요."
            : "외출 전 기상청 특보를 다시 확인해 주세요."}
        </span>
        <span className="warning-banner-source">출처: 기상청 기상특보</span>
      </div>
    );
  }
  if (nearby.length > 0) {
    return (
      <p className="warning-banner is-nearby" role="status">
        인근 시군 특보 있음 · {nearby.join(", ")}
      </p>
    );
  }
  return null;
}
