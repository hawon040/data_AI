import type { Attraction, RecommendationItem, Region } from "../lib/types";
import { isSafetyGrade, safetyGradeLabel } from "../lib/safetyGrades";
import { SHOW_REGION_SAFETY_SCORE } from "../config/features";
import { shortEvidence } from "../lib/evidence";
import { attractionMeta, categoryChips } from "../lib/cardInfo";

/** 날씨 때문에 카드에서 빠진 관광지와 짧은 사유(예: "비 예보로 제외") */
export interface ExcludedAttraction {
  attraction: Attraction;
  label: string;
}

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
  distanceLabel,
  excluded,
}: {
  item: RecommendationItem;
  excluded: ExcludedAttraction[];
  weatherSummary: string | null;
  distanceLabel: string | null;
  attractionBadge: (attraction: Attraction) => string | null;
  rank?: number;
  onSelect: (r: Region) => void;
  onSelectAttraction: (a: Attraction) => void;
  selected: boolean;
}) {
  const chips = categoryChips([...item.topAttractions.map(({ attraction }) => attraction), ...excluded.map(({ attraction }) => attraction)]);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`recommendation-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(item.region)}
      onKeyDown={(e) => {
        // 안의 관광지 버튼에서 누른 Enter·Space는 카드 선택으로 올라오지 않게 한다.
        if (e.target !== e.currentTarget) return;
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
      {/* 그 지역 추천 후보 관광지(날씨로 빠진 곳 포함)의 카테고리 — 많은 순 최대 3개 */}
      {chips.length > 0 && (
        <div className="category-chips" aria-label="관광지 카테고리">
          {chips.map((chip) => <span key={chip} className="category-chip">{chip}</span>)}
        </div>
      )}
      {item.emptyNote ? (
        <p className="empty-note">{item.emptyNote}</p>
      ) : (
        <p className="evidence-line">{shortEvidence(item, weatherSummary)}</p>
      )}
      {distanceLabel && <p className="distance-line">{distanceLabel}</p>}
      {item.topAttractions.length > 0 && (
        <div className="attraction-chips">
          {item.topAttractions.map(({ attraction }) => (
            <button
              key={attraction.name}
              type="button"
              className="attraction-chip"
              onClick={(e) => {
                // 관광지 버튼은 관광지만 고른다 — 지역 카드 클릭(지도 지역·지역 체크리스트)으로 같이 처리하지 않는다.
                e.stopPropagation();
                onSelectAttraction(attraction);
              }}
            >
              {attraction.name}
              <span className="attraction-meta">{attractionMeta(attraction)}</span>
              {attractionBadge(attraction) && <span className="attraction-badge">{attractionBadge(attraction)}</span>}
            </button>
          ))}
        </div>
      )}
      {excluded.length > 0 && (
        <div className="attraction-chips is-excluded-list">
          {excluded.map(({ attraction, label }) => (
            <button
              key={attraction.name}
              type="button"
              className="attraction-chip is-excluded"
              title={label}
              onClick={(e) => {
                // 날씨로 빠진 곳도 누르면 상세는 열린다(카드 클릭으로 같이 처리하지 않는다).
                e.stopPropagation();
                onSelectAttraction(attraction);
              }}
            >
              {attraction.name}
              <span className="attraction-meta">{label}</span>
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
                // 관광지 버튼은 관광지만 고른다 — 지역 카드 클릭(지도 지역·지역 체크리스트)으로 같이 처리하지 않는다.
                e.stopPropagation();
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
  distanceLabelFor = () => null,
  excludedFor = () => [],
  bottomItems = [],
}: {
  items: RecommendationItem[];
  /** 순위 맨 아래에 둘 안내 카드(날씨 때문에 목적에 맞는 관광지가 모두 빠진 지역) */
  bottomItems?: RecommendationItem[];
  exploreItems: RecommendationItem[];
  onSelect: (r: Region) => void;
  onSelectAttraction: (a: Attraction) => void;
  selectedCode?: string;
  emptyMessage: string;
  /** 지역 코드별 날씨 규칙 요약 (lib/weatherRules.ts WeatherDecision.summary) */
  weatherSummaryFor?: (regionCode: string) => string | null;
  /** 관광지 칩 옆 배지(예: 무장애 "편의 정보"). 정보가 있을 때만 문구를 돌려준다. 순서는 바꾸지 않는다. */
  attractionBadge?: (attraction: Attraction) => string | null;
  /** 출발지가 있으면 "출발지에서 약 12km" (지역 중심까지 직선거리) */
  distanceLabelFor?: (region: Region) => string | null;
  /** 날씨 때문에 그 지역 카드에서 빠진 관광지 (흐리게 "비 예보로 제외"로 함께 보여 준다) */
  excludedFor?: (region: Region) => ExcludedAttraction[];
}) {
  if (items.length === 0 && bottomItems.length === 0) {
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
          distanceLabel={distanceLabelFor(item.region)}
          excluded={excludedFor(item.region)}
        />
      ))}

      {items.length === 0 && <p className="empty-state">{emptyMessage}</p>}
      {bottomItems.map((item) => (
        <RecommendationCard
          key={`empty-${item.region.code}`}
          item={item}
          onSelect={onSelect}
          onSelectAttraction={onSelectAttraction}
          selected={selectedCode === item.region.code}
          weatherSummary={null}
          attractionBadge={attractionBadge}
          distanceLabel={distanceLabelFor(item.region)}
          excluded={excludedFor(item.region)}
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
              distanceLabel={distanceLabelFor(item.region)}
              excluded={excludedFor(item.region)}
            />
          ))}
        </>
      )}
    </div>
  );
}
