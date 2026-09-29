export type Gender = "M" | "F";
export type AgeGroup = "10s" | "20s" | "30s" | "40s" | "50s" | "60plus";

export const AGE_GROUPS: AgeGroup[] = ["10s", "20s", "30s", "40s", "50s", "60plus"];
export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "10s": "10대",
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s": "50대",
  "60plus": "60대 이상",
};

export interface Person {
  gender: Gender;
  ageGroup: AgeGroup;
}

export type GroupKey = `${Gender}_${AgeGroup}`;

export function groupKey(p: Person): GroupKey {
  return `${p.gender}_${p.ageGroup}`;
}

export type CompanionType = "alone" | "friends" | "family" | "with_kids";

export interface SafetySubIndicators {
  /** 보행자 교통사고율 (10만 명당) */
  pedestrianAccidentRate: number;
  /** 화재 발생률 (10만 명당) */
  fireRate: number;
  /** 가장 가까운 응급의료기관까지 평균 이동 시간(분) */
  emergencyAccessMinutes: number;
  /** 야간(22시~06시) 범죄 비중(%) */
  nightCrimeSharePct: number;
  /** 반경 내 CCTV/보안등/비상벨 밀도 점수 (0~100, 높을수록 촘촘) */
  securityFacilityDensity: number;
}

export interface SafetyIndex {
  /** 1(가장 안전)~5(주의) 등급 — 문서 4.5: 단일 순위 대신 5단계 등급 */
  grade: 1 | 2 | 3 | 4 | 5;
  /** 유효인구 10만 명당 위해지수(경험적 베이즈 축소 적용 후) */
  ratePer100k: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  sub: SafetySubIndicators;
}

export interface Region {
  code: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  type: "urban" | "nature";
  /** 지역 전체 방문자 수 (연간, 방문자·일 단위) */
  totalVisitors: number;
  /** 집단별 방문자 수 */
  groupVisitors: Record<GroupKey, number>;
  /** 4.8 탐색 추천 대상 여부 판단에 쓰는 체험 콘텐츠 다양성 점수 (0~100) */
  experienceScore: number;
  safety: SafetyIndex;
  /** 시연/데모용 한 줄 소개 */
  highlight: string;
}

export interface RecommendationItem {
  region: Region;
  score: number;
  perPersonLQ: { person: Person; lq: number }[];
  /** 근거 문장 (문서 4.7: 광고 없는 추천 원칙 — 숫자 근거를 함께 보여준다) */
  evidence: string[];
}
