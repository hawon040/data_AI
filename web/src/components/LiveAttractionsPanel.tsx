import type { Attraction } from "../lib/types";

/**
 * 큐레이션한 관광지 10곳 안팎만으로는 다양성이 부족하다는 피드백에 따라,
 * 선택한 지역 주변에서 카카오 카테고리 검색으로 실시간으로 더 찾은 장소를
 * 보여준다. 인기 점수가 검색 순위 기반 근사치라는 한계를 "실시간 · 참고용"
 * 배지로 그대로 드러낸다 — 큐레이션 목록과 섞지 않고 분리해서 보여준다.
 */
export function LiveAttractionsPanel({
  loading,
  items,
  onSelectAttraction,
}: {
  loading: boolean;
  items: { attraction: Attraction; matchScore: number }[];
  onSelectAttraction: (a: Attraction) => void;
}) {
  if (!loading && items.length === 0) return null;

  return (
    <div className="live-attractions-panel">
      <h3>
        주변에서 더 찾은 곳 <span className="live-badge">실시간 · 참고용</span>
      </h3>
      <p className="live-note">
        카카오 로컬 API로 지금 바로 검색한 결과입니다. 인기 점수는 방문자 수가 아니라 검색
        순위를 근사치로 쓴 값입니다.
      </p>
      {loading ? (
        <p className="live-loading">주변 장소를 찾는 중…</p>
      ) : (
        <div className="attraction-chips">
          {items.map(({ attraction, matchScore }) => (
            <button
              key={`${attraction.name}-${attraction.lat}`}
              type="button"
              className="attraction-chip"
              onClick={() => onSelectAttraction(attraction)}
            >
              {attraction.name}
              <span className="attraction-score">{Math.round(matchScore)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
