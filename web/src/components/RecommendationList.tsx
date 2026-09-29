import type { RecommendationItem, Region } from "../lib/types";

const GRADE_LABEL: Record<number, string> = {
  1: "매우 안전",
  2: "안전",
  3: "보통",
  4: "주의",
  5: "각별한 주의",
};

function SafetyBadge({ grade }: { grade: number }) {
  return <span className={`safety-badge grade-${grade}`}>{GRADE_LABEL[grade] ?? "평가 불가"}</span>;
}

function RecommendationCard({
  item,
  rank,
  onSelect,
  selected,
}: {
  item: RecommendationItem;
  rank?: number;
  onSelect: (r: Region) => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      className={`recommendation-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(item.region)}
    >
      <div className="card-head">
        {rank != null && <span className="rank">{rank}</span>}
        <div>
          <div className="region-name">{item.region.name}</div>
          <div className="region-province">{item.region.province}</div>
        </div>
        <SafetyBadge grade={item.region.safety.grade} />
      </div>
      <p className="highlight">{item.region.highlight}</p>
      <ul className="evidence-list">
        {item.evidence.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </button>
  );
}

export function RecommendationList({
  items,
  exploreItems,
  onSelect,
  selectedCode,
}: {
  items: RecommendationItem[];
  exploreItems: RecommendationItem[];
  onSelect: (r: Region) => void;
  selectedCode?: string;
}) {
  if (items.length === 0) {
    return <p className="empty-state">동행자 정보를 입력하고 추천받기를 눌러보세요.</p>;
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
          selected={selectedCode === item.region.code}
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
              selected={selectedCode === item.region.code}
            />
          ))}
        </>
      )}
    </div>
  );
}
