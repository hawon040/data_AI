import type { Attraction, RecommendationItem, Region } from "../lib/types";
import { isSafetyGrade, safetyGradeLabel } from "../lib/safetyGrades";
import { SHOW_REGION_SAFETY_SCORE } from "../config/features";
import { shortEvidence } from "../lib/evidence";

function SafetyBadge({ grade }: { grade: number }) {
  if (!isSafetyGrade(grade)) {
    return <span className="safety-badge">평가 불가</span>;
  }
  return <span className={`safety-badge grade-${grade}`}>{safetyGradeLabel(grade)}</span>;
}

function RecommendationCard({
  item,
  rank,
  onSelect,
  onSelectAttraction,
  selected,
  weatherSummary,
  attractionBadge,
}: {
  item: RecommendationItem;
  weatherSummary: string | null;
  attractionBadge: (attraction: Attraction) => string | null;
  rank?: number;
  onSelect: (r: Region) => void;
  onSelectAttraction: (a: Attraction) => void;
  selected: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`recommendation-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(item.region)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(item.region);
      }}
    >
      <div className="card-head">
        {rank != null && <span className="rank">{rank}</span>}
        <div>
          <div className="region-name">{item.region.name}</div>
          <div className="region-province">{item.region.province}</div>
        </div>
        {SHOW_REGION_SAFETY_SCORE && (
          <div className="safety-reference">
            <span>안전 참고</span>
            <SafetyBadge grade={item.region.safety.grade} />
          </div>
        )}
      </div>
      <p className="highlight">{item.region.highlight}</p>
      <p className="evidence-line">{shortEvidence(item, weatherSummary)}</p>
      {item.topAttractions.length > 0 && (
        <div className="attraction-chips">
          {item.topAttractions.map(({ attraction }) => (
            <button
              key={attraction.name}
              type="button"
              className="attraction-chip"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.region);
                onSelectAttraction(attraction);
              }}
            >
              {attraction.name}
              {attractionBadge(attraction) && <span className="attraction-badge">{attractionBadge(attraction)}</span>}
            </button>
          ))}
        </div>
      )}
      {item.indoorAlternatives && item.indoorAlternatives.length > 0 && (
        <div className="indoor-alternatives">
          <span className="indoor-alternatives-label">비 오면 실내 대안</span>
          {item.indoorAlternatives.map((attraction) => (
            <button
              key={attraction.name}
              type="button"
              className="attraction-chip is-indoor"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.region);
                onSelectAttraction(attraction);
              }}
            >
              {attraction.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecommendationList({
  items,
  exploreItems,
  onSelect,
  onSelectAttraction,
  selectedCode,
  emptyMessage,
  weatherSummaryFor = () => null,
  attractionBadge = () => null,
}: {
  items: RecommendationItem[];
  exploreItems: RecommendationItem[];
  onSelect: (r: Region) => void;
  onSelectAttraction: (a: Attraction) => void;
  selectedCode?: string;
  emptyMessage: string;
  /** 지역 코드별 날씨 규칙 요약 (lib/weatherRules.ts WeatherDecision.summary) */
  weatherSummaryFor?: (regionCode: string) => string | null;
  /** 관광지 칩 옆 배지(예: 무장애 "편의 정보"). 정보가 있을 때만 문구를 돌려준다. 순서는 바꾸지 않는다. */
  attractionBadge?: (attraction: Attraction) => string | null;
}) {
  if (items.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }
  return (
    <div className="recommendation-list">
      <h3>추천 여행지</h3>
      {items.map((item, i) => (
        <RecommendationCard
          key={item.region.code}
          item={item}
          rank={i + 1}
          onSelect={onSelect}
          onSelectAttraction={onSelectAttraction}
          selected={selectedCode === item.region.code}
          weatherSummary={weatherSummaryFor(item.region.code)}
          attractionBadge={attractionBadge}
        />
      ))}

      {exploreItems.length > 0 && (
        <>
          <h3 className="explore-heading">이런 곳은 어때요? (탐색 추천)</h3>
          {exploreItems.map((item) => (
            <RecommendationCard
              key={item.region.code}
              item={item}
              onSelect={onSelect}
              onSelectAttraction={onSelectAttraction}
              selected={selectedCode === item.region.code}
              weatherSummary={weatherSummaryFor(item.region.code)}
              attractionBadge={attractionBadge}
            />
          ))}
        </>
      )}
    </div>
  );
}
