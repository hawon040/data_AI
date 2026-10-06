/**
 * 랜덤 여행 — 안전 등급 조건을 통과한 지역의 관광지 중에서 한 곳을 무작위로 뽑는다.
 *
 * 완전한 균등 랜덤이 아니라, 기존 추천과 같은 기준(attractionMatchScore =
 * 인기 지표 x 동행자 연령대 선호 가중치)을 뽑힐 확률의 가중치로 쓴다.
 * 즉 "아무 데나"가 아니라 "안전하고, 우리 일행에게 어느 정도 맞는 곳 중에서
 * 운에 맡기는" 방식이다.
 */
import { attractionMatchScore } from "./attractionAffinity";
import type { Attraction, Person, Region } from "./types";

export const GRADE_LABEL: Record<number, string> = {
  1: "매우 안전",
  2: "안전",
  3: "보통",
  4: "주의",
  5: "각별한 주의",
};

export interface TripCandidate {
  attraction: Attraction;
  region: Region;
  matchScore: number;
}

export interface PoolOptions {
  /** 이 등급 이하(숫자가 작을수록 안전)인 지역만 후보에 넣는다. */
  maxGrade: number;
  /** "all"이면 전체, 아니면 해당 시·도(province)만. */
  province: string;
}

/** 조건을 통과한 모든 (지역, 관광지) 조합을 매치 점수와 함께 펼친다. */
export function buildCandidatePool(regions: Region[], people: Person[], opts: PoolOptions): TripCandidate[] {
  const pool: TripCandidate[] = [];
  for (const region of regions) {
    if (region.safety.grade > opts.maxGrade) continue;
    if (opts.province !== "all" && region.province !== opts.province) continue;
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
  const grade = `${c.region.name}은(는) 안전 등급 ${c.region.safety.grade}(${GRADE_LABEL[c.region.safety.grade]})`;
  if (people.length === 0) return `${grade}이고, 인기 지표 ${c.attraction.popularityScore}점인 곳이에요.`;
  return `${grade}이고, 동행자 연령대를 반영한 맞춤 점수가 ${Math.round(c.matchScore)}점이에요.`;
}

/**
 * 보드(퍼센트 좌표)에 핀을 찍기 위해 위경도를 단순 투영한다.
 * 후보 전체가 보드 안에 들어오도록 최소/최대 범위로 정규화한다.
 */
export function projectToBoard(pool: TripCandidate[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (pool.length === 0) return out;
  const lats = pool.map((c) => c.attraction.lat);
  const lngs = pool.map((c) => c.attraction.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  for (const c of pool) {
    out.set(candidateKey(c), {
      x: 8 + ((c.attraction.lng - minLng) / spanLng) * 84,
      y: 10 + ((maxLat - c.attraction.lat) / spanLat) * 80, // 북쪽이 위
    });
  }
  return out;
}
