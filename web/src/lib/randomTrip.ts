/**
 * 랜덤 여행 — 모든 시범 지역의 관광지 중 한 곳을 무작위로 뽑는다.
 *
 * 완전한 균등 랜덤이 아니라, 기존 추천과 같은 기준(attractionMatchScore =
 * 인기 지표 x 동행자 연령대 선호 가중치)을 뽑힐 확률의 가중치로 쓴다.
 * 즉 "아무 데나"가 아니라 인기와 동행자 선호를 반영한 관광지 중에서 운에 맡긴다.
 */
import { attractionMatchScore } from "./attractionAffinity";
import { safetyGradeLabel } from "./safetyGrades";
import type { Attraction, Person, Region } from "./types";

export interface TripCandidate {
  attraction: Attraction;
  region: Region;
  matchScore: number;
}

/** 모든 지역의 관광지 후보를 펼친다. 안전 등급과 지역으로 후보를 제한하지 않는다. */
export function buildCandidatePool(regions: Region[], people: Person[]): TripCandidate[] {
  const pool: TripCandidate[] = [];
  for (const region of regions) {
    for (const attraction of region.attractions) {
      pool.push({
        attraction,
        region,
        matchScore: attractionMatchScore(attraction.popularityScore, attraction.tags, people),
      });
    }
  }
  return pool;
}

const KOREA_MAP_BOUNDS = {
  minLat: 33,
  maxLat: 39.5,
  minLng: 124.5,
  maxLng: 132,
};

/** Coordinates as percentages within the locally bundled South Korea map image. */
export function projectToKoreaMap(lat: number, lng: number): { x: number; y: number } {
  return {
    x: 7 + ((lng - KOREA_MAP_BOUNDS.minLng) / (KOREA_MAP_BOUNDS.maxLng - KOREA_MAP_BOUNDS.minLng)) * 86,
    y: 5 + ((KOREA_MAP_BOUNDS.maxLat - lat) / (KOREA_MAP_BOUNDS.maxLat - KOREA_MAP_BOUNDS.minLat)) * 90,
  };
}

/**
 * matchScore에 비례한 확률로 하나를 뽑는다. rand를 주입할 수 있어서 테스트하기 쉽다.
 * 풀이 비어 있으면 null.
 */
export function pickWeighted(pool: TripCandidate[], rand: () => number = Math.random): TripCandidate | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((s, c) => s + c.matchScore, 0);
  if (total <= 0) return pool[Math.floor(rand() * pool.length)];
  let r = rand() * total;
  for (const c of pool) {
    r -= c.matchScore;
    if (r <= 0) return c;
  }
  return pool[pool.length - 1];
}

/**
 * 이미 뽑았던 곳은 제외하고 뽑는다. 남은 후보가 없으면(전부 한 번씩 뽑았으면)
 * 기록을 초기화한 것처럼 전체 풀에서 다시 뽑는다.
 */
export function pickFresh(
  pool: TripCandidate[],
  seen: ReadonlySet<string>,
  rand: () => number = Math.random,
): TripCandidate | null {
  const fresh = pool.filter((c) => !seen.has(candidateKey(c)));
  return pickWeighted(fresh.length > 0 ? fresh : pool, rand);
}

export function candidateKey(c: TripCandidate): string {
  return `${c.region.code}:${c.attraction.name}`;
}

/** 결과 카드에 보여줄 한 줄 근거. */
export function tripReason(c: TripCandidate, people: Person[]): string {
  const grade = `${c.region.name}은(는) ${safetyGradeLabel(c.region.safety.grade)}`;
  if (people.length === 0) return `${grade}이고, 인기 지표 ${c.attraction.popularityScore}점인 곳이에요.`;
  return `${grade}이고, 동행자 연령대를 반영한 맞춤 점수가 ${Math.round(c.matchScore)}점이에요.`;
}
