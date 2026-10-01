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

/** 관광지 성격 태그 — 연령대별 선호도 계산에 쓰는 분류 (문서 4.3, 9.3).
 * 공공데이터는 관광지 단위 성·연령 분포를 제공하지 않으므로, 실제 서비스에서도
 * "이 유형을 이 연령대가 얼마나 선호하는가"라는 보조 가중치로 태그를 쓴다 —
 * 이후 앱 내 사용자 기록이 쌓이면 이 가중치를 실측치로 교체한다(문서 4.3).
 */
export type AttractionTag =
  | "history"
  | "nature"
  | "activity"
  | "food"
  | "cafe"
  | "shopping"
  | "culture"
  | "theme_park"
  | "resort"
  | "view";

/** 관광지 단위 데이터 (문서 4.3: 지역 다음 2단계로 관광지를 정렬한다). */
export interface Attraction {
  name: string;
  category: string;
  tags: AttractionTag[];
  lat: number;
  lng: number;
  /** 관광지 단위 기저 인기 지표 (0~100). TourAPI·목적지 검색량 등을 정규화한 값.
   * 최종 추천 순위는 이 값에 동행자 연령대별 태그 선호도를 곱해서 정한다
   * (아래 RecommendationItem.topAttractions 참고) — 인기도 하나만으로 매기지 않는다.
   */
  popularityScore: number;
  /** 큐레이션한 관광지("curated")인지 카카오 카테고리 검색으로 실시간으로 찾은
   * 주변 장소("kakao")인지 — 화면에서 둘을 구분해 보여주기 위한 출처 표시. */
  source?: "curated" | "kakao";
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
  /** 지역 안의 관광지 목록 (문서 4.3 2단계 추천) */
  attractions: Attraction[];
}

export interface RecommendationItem {
  region: Region;
  score: number;
  perPersonLQ: { person: Person; lq: number }[];
  /** 근거 문장 (문서 4.7: 광고 없는 추천 원칙 — 숫자 근거를 함께 보여준다) */
  evidence: string[];
  /** 이 지역 안에서 동행자 연령대 선호도까지 반영해 정렬한 상위 관광지
   * (문서 4.3 2단계 추천). matchScore는 popularityScore x 연령대 선호 가중치.
   */
  topAttractions: { attraction: Attraction; matchScore: number }[];
}
