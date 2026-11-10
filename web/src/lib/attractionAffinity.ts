/**
 * 연령대별 관광지 태그 선호 가중치 (문서 4.3, 9.3 보조 가정).
 *
 * 한국관광 데이터랩·경찰청 데이터에는 관광지 단위 성·연령 분포가 없다.
 * 그래서 지역 선택에 쓴 것과 같은 동행자 연령대 정보를, 지역 안 관광지
 * 순위에도 "이 유형을 이 연령대가 얼마나 선호하는가"라는 가중치로 다시
 * 반영한다. 1.0이 전국 평균이고, 실제 서비스에서는 앱 내 사용자의 방문·저장
 * 기록이 쌓이는 대로 이 표를 실측 가중치로 교체해야 한다(문서 4.3 2단계 추천
 * 참고 — 공공데이터가 초기 추천을 맡고 사용자 기록이 정교화한다는 것과 같은 원리).
 */
import type { AgeGroup, AttractionTag, Person } from "./types";

const AGE_TAG_AFFINITY: Record<AgeGroup, Partial<Record<AttractionTag, number>>> = {
  "10s": { cafe: 1.2, activity: 1.2, theme_park: 1.3, food: 1.1, history: 0.7, resort: 0.8 },
  "20s": { cafe: 1.3, activity: 1.2, view: 1.2, food: 1.15, shopping: 1.1, history: 0.75 },
  "30s": { nature: 1.15, activity: 1.15, food: 1.1, view: 1.1, theme_park: 1.05, history: 0.9 },
  "40s": { nature: 1.2, theme_park: 1.15, activity: 1.05, food: 1.05, history: 1.0, culture: 1.05 },
  "50s": { history: 1.25, nature: 1.15, culture: 1.2, shopping: 1.05, activity: 0.8, cafe: 0.85 },
  "60plus": { history: 1.3, culture: 1.25, nature: 1.1, shopping: 1.0, activity: 0.65, cafe: 0.7 },
};

/** 한 사람이 이 관광지 태그들을 얼마나 선호하는지 (태그 평균 가중치). */
function personAffinity(person: Person, tags: AttractionTag[]): number {
  if (tags.length === 0) return 1.0;
  const weights = AGE_TAG_AFFINITY[person.ageGroup];
  const sum = tags.reduce((s, tag) => s + (weights[tag] ?? 1.0), 0);
  return sum / tags.length;
}

/**
 * 동행자 전원의 선호도 중 최솟값을 쓴다 — 지역 선택의 최솟값 방식(문서 4.4)과
 * 같은 원리로, 한 사람만 좋아하는 관광지가 상위로 올라오는 것을 막는다.
 */
export function attractionMatchScore(basePopularity: number, tags: AttractionTag[], people: Person[]): number {
  if (people.length === 0) return basePopularity;
  const affinities = people.map((p) => personAffinity(p, tags));
  return basePopularity * Math.min(...affinities);
}
