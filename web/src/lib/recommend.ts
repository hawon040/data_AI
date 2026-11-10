/**
 * 동행자 교집합 추천 (문서 4.4) + 필터 버블을 막는 탐색 추천 (문서 4.8).
 */
import { attractionMatchScore } from "./attractionAffinity";
import { groupScore, locationQuotient, nationalShares, specializationScore } from "./indices";
import { AGE_GROUP_LABELS, groupKey, type Attraction, type Person, type Region, type RecommendationItem } from "./types";

function personLabel(p: Person): string {
  const gender = p.gender === "F" ? "여성" : "남성";
  return `${AGE_GROUP_LABELS[p.ageGroup]} ${gender}`;
}

function evidenceSentence(person: Person, lq: number): string {
  return `${personLabel(person)} 방문 비중이 전국 평균의 ${lq.toFixed(1)}배`;
}

/**
 * 관광지 목록을 동행자 연령대 선호도까지 반영한 매치 점수로 정렬해 상위 n개를
 * 뽑는다. 큐레이션한 지역 소속 관광지뿐 아니라, 카카오 카테고리 검색으로 찾은
 * 주변 실제 장소(lib/kakaoLocal.ts의 findNearbyAttractions) 순위에도 그대로
 * 재사용한다 — 출처가 달라도 같은 한 가지 기준(인기 지표 x 선호 가중치)으로
 * 매긴다.
 */
export function rankAttractions(attractions: Attraction[], people: Person[], n = 4) {
  return attractions
    .map((attraction) => ({
      attraction,
      matchScore: attractionMatchScore(attraction.popularityScore, attraction.tags, people),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, n);
}

/**
 * 지역 안에서 큐레이션한 관광지를 매치 점수로 정렬해 상위 n개를 뽑는다
 * (문서 4.3의 2단계 추천: 1단계는 지역을, 2단계는 그 지역 안의 관광지를
 * 고른다). people이 비어 있으면 기저 인기 지표만으로 정렬한다.
 */
export function topAttractionsOf(region: Region, people: Person[], n = 4) {
  return rankAttractions(region.attractions, people, n);
}

/**
 * people이 1명이면 개인 추천(specializationScore), 2명 이상이면 동행자 교집합
 * 추천(groupScore, 최솟값 방식)을 쓴다.
 */
export function getRecommendations(
  people: Person[],
  regions: Region[],
  topN = 5,
): RecommendationItem[] {
  if (people.length === 0) {
    throw new Error("최소 1명의 성별·연령대가 필요합니다");
  }
  const shares = nationalShares(regions);

  const items: RecommendationItem[] = regions.map((region) => {
    const perPersonLQ = people.map((person) => {
      const key = groupKey(person);
      const sG = shares[key];
      const vIg = region.groupVisitors[key] ?? 0;
      const lq = locationQuotient(vIg, region.totalVisitors, sG);
      return { person, lq };
    });

    const lqValues = perPersonLQ.map((x) => x.lq);
    const score =
      people.length === 1
        ? specializationScore(lqValues[0], region.totalVisitors)
        : groupScore(lqValues, region.totalVisitors);

    const evidence = perPersonLQ
      .slice()
      .sort((a, b) => a.lq - b.lq) // 가장 덜 만족하는 동행자부터 보여준다
      .map(({ person, lq }) => evidenceSentence(person, lq));

    return { region, score, perPersonLQ, evidence, topAttractions: topAttractionsOf(region, people) };
  });

  return items.sort((a, b) => b.score - a.score).slice(0, topN);
}

/**
 * 탐색 추천 (문서 4.8): 이미 추천된 지역을 제외하고
 *  1) 특화지수는 평균 근처지만 체험지수가 높은 지역
 *  2) 방문객이 적지만 안전도가 높고 체험 콘텐츠가 다양한 지역
 * 을 하나씩 골라온다.
 */
export function getExploreRecommendations(
  people: Person[],
  regions: Region[],
  excludeCodes: Set<string>,
): RecommendationItem[] {
  const shares = nationalShares(regions);
  const candidates = regions.filter((r) => !excludeCodes.has(r.code));
  if (candidates.length === 0) return [];

  const withScores = candidates.map((region) => {
    const perPersonLQ = people.map((person) => {
      const key = groupKey(person);
      const lq = locationQuotient(region.groupVisitors[key] ?? 0, region.totalVisitors, shares[key]);
      return { person, lq };
    });
    const avgLq = perPersonLQ.reduce((s, x) => s + x.lq, 0) / perPersonLQ.length;
    return { region, perPersonLQ, avgLq };
  });

  const nearAverage = withScores
    .filter((x) => Math.abs(x.avgLq - 1) < 0.3)
    .sort((a, b) => b.region.experienceScore - a.region.experienceScore)[0];

  const hiddenGem = withScores
    .filter((x) => x.region.safety.grade <= 2 && x.region.experienceScore >= 60)
    .sort((a, b) => a.region.totalVisitors - b.region.totalVisitors)[0];

  const picks = [nearAverage, hiddenGem].filter(
    (x, i, arr): x is NonNullable<typeof x> => x != null && arr.findIndex((y) => y?.region.code === x.region.code) === i,
  );

  return picks.map(({ region, perPersonLQ }) => ({
    region,
    score: groupScore(perPersonLQ.map((x) => x.lq), region.totalVisitors),
    perPersonLQ,
    evidence: perPersonLQ.map(({ person, lq }) => evidenceSentence(person, lq)),
    topAttractions: topAttractionsOf(region, people),
  }));
}
