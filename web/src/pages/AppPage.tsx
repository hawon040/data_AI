import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AttractionDetail } from "../components/AttractionDetail";
import { CompanionForm } from "../components/CompanionForm";
import { MapView } from "../components/MapView";
import { RecommendationList } from "../components/RecommendationList";
import { SafetyPanel } from "../components/SafetyPanel";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { getExploreRecommendations, getRecommendations, topAttractionsOf } from "../lib/recommend";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import type { Attraction, Person, RecommendationItem, Region } from "../lib/types";
import "./AppPage.css";

export function AppPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [safetyFilters, setSafetyFilters] = useState<SafetyDisplayFilters>({
    withChildren: false,
    withElderly: false,
    nightPlan: false,
  });
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedAttraction, setSelectedAttraction] = useState<Attraction | null>(null);

  const recommendations: RecommendationItem[] = useMemo(() => {
    if (people == null) return [];
    if (people.length === 0) {
      // 성별·연령대 미입력 — 전체 인기도(방문자 수)만으로 정렬한다.
      return SAMPLE_REGIONS.slice()
        .sort((a, b) => b.totalVisitors - a.totalVisitors)
        .slice(0, 5)
        .map((region) => ({
          region,
          score: Math.log(region.totalVisitors),
          perPersonLQ: [],
          evidence: [`전체 방문자 수 ${region.totalVisitors.toLocaleString()}명`],
          topAttractions: topAttractionsOf(region, []),
        }));
    }
    return getRecommendations(people, SAMPLE_REGIONS, 5);
  }, [people]);

  const exploreRecommendations = useMemo(() => {
    if (people == null || people.length === 0) return [];
    const excludeCodes = new Set(recommendations.map((r) => r.region.code));
    return getExploreRecommendations(people, SAMPLE_REGIONS, excludeCodes);
  }, [people, recommendations]);

  const highlightedCodes = useMemo(
    () => new Set([...recommendations, ...exploreRecommendations].map((r) => r.region.code)),
    [recommendations, exploreRecommendations],
  );

  // 추천이 나오면 1위 지역을 자동으로 선택해 지도에 관광지 핀과 안전 정보를
  // 바로 보여준다 — 카드를 눌러야만 지도가 움직이면 지도를 안 쓰게 된다.
  useEffect(() => {
    if (recommendations.length > 0 && selectedRegion == null) {
      setSelectedRegion(recommendations[0].region);
    }
  }, [recommendations, selectedRegion]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="back-link">
          ← TrueTrip
        </Link>
        <p className="sample-notice">
          시범 권역(충청권·강원권 일부) 샘플 데이터입니다. 실제 방문자·안전 데이터는{" "}
          <code>tourism_platform</code> 파이썬 패키지의 계산 결과로 교체합니다.
        </p>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <CompanionForm
            onSubmit={(p, filters) => {
              setPeople(p);
              setSafetyFilters(filters);
              setSelectedRegion(null);
              setSelectedAttraction(null);
            }}
          />
          <RecommendationList
            items={recommendations}
            exploreItems={exploreRecommendations}
            onSelect={(region) => {
              setSelectedRegion(region);
              setSelectedAttraction(null);
            }}
            onSelectAttraction={setSelectedAttraction}
            selectedCode={selectedRegion?.code}
          />
        </aside>

        <section className="content">
          <MapView
            regions={SAMPLE_REGIONS}
            highlightedCodes={highlightedCodes}
            selectedCode={selectedRegion?.code}
            onSelectRegion={(region) => {
              setSelectedRegion(region);
              setSelectedAttraction(null);
            }}
            onSelectAttraction={setSelectedAttraction}
            people={people ?? []}
          />
          {selectedAttraction && <AttractionDetail attraction={selectedAttraction} />}
          {selectedRegion && <SafetyPanel region={selectedRegion} filters={safetyFilters} />}
        </section>
      </main>
    </div>
  );
}
