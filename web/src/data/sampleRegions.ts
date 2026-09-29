/**
 * 시범 권역 샘플 데이터 (문서 5.2: 충청권(천안 포함) + 강원권 일부).
 *
 * 전부 데모용 합성 데이터다. 실제 방문자 수는 한국관광 데이터랩,
 * 안전 지표는 tourism_platform 파이썬 패키지의 계산 결과로 교체해야 한다
 * (연동 방법은 tourism_platform/data/loaders.py 참고).
 */
import type { GroupKey, Region } from "../lib/types";

const GROUP_ORDER: GroupKey[] = [
  "M_10s", "F_10s",
  "M_20s", "F_20s",
  "M_30s", "F_30s",
  "M_40s", "F_40s",
  "M_50s", "F_50s",
  "M_60plus", "F_60plus",
];

function groups(values: number[]): Record<GroupKey, number> {
  if (values.length !== GROUP_ORDER.length) {
    throw new Error("groups() expects exactly 12 values (2 genders x 6 age groups)");
  }
  return Object.fromEntries(GROUP_ORDER.map((k, i) => [k, values[i]])) as Record<GroupKey, number>;
}

function totalOf(g: Record<GroupKey, number>): number {
  return Object.values(g).reduce((a, b) => a + b, 0);
}

interface RawRegion extends Omit<Region, "totalVisitors"> {}

const raw: RawRegion[] = [
  {
    code: "44130",
    name: "천안시",
    province: "충청남도",
    lat: 36.8151,
    lng: 127.1139,
    type: "urban",
    groupVisitors: groups([80, 80, 150, 160, 170, 165, 160, 150, 140, 135, 110, 120]),
    experienceScore: 62,
    highlight: "수도권과 가까운 교통 요지 — 모든 연령대가 고르게 찾는다",
    attractions: [
      { name: "독립기념관", category: "역사", tags: ["history"], lat: 36.7965, lng: 127.2258, popularityScore: 90 },
      { name: "병천순대거리", category: "맛집", tags: ["food"], lat: 36.7583, lng: 127.2399, popularityScore: 72 },
      { name: "아라리오갤러리 천안", category: "문화예술", tags: ["culture"], lat: 36.8163, lng: 127.1483, popularityScore: 65 },
      { name: "광덕산 자연휴양림", category: "자연", tags: ["nature"], lat: 36.7302, lng: 127.0562, popularityScore: 58 },
    ],
    safety: {
      grade: 2,
      ratePer100k: 24.3,
      confidenceIntervalLow: 19.1,
      confidenceIntervalHigh: 30.5,
      sub: {
        pedestrianAccidentRate: 18.2,
        fireRate: 6.1,
        emergencyAccessMinutes: 9,
        nightCrimeSharePct: 21,
        securityFacilityDensity: 78,
      },
    },
  },
  {
    code: "43111",
    name: "청주시 상당구",
    province: "충청북도",
    lat: 36.6424,
    lng: 127.4890,
    type: "urban",
    groupVisitors: groups([70, 75, 190, 195, 150, 140, 120, 115, 100, 95, 80, 85]),
    experienceScore: 58,
    highlight: "대학가 상권과 맛집이 많아 20대 방문 비중이 높다",
    attractions: [
      { name: "성안길", category: "쇼핑·맛집", tags: ["shopping", "food"], lat: 36.6350, lng: 127.4880, popularityScore: 82 },
      { name: "청남대", category: "역사", tags: ["history"], lat: 36.5386, lng: 127.4650, popularityScore: 80 },
      { name: "상당산성", category: "역사·자연", tags: ["history", "nature"], lat: 36.6531, lng: 127.5122, popularityScore: 68 },
      { name: "국립청주박물관", category: "문화", tags: ["culture"], lat: 36.6089, lng: 127.4590, popularityScore: 55 },
    ],
    safety: {
      grade: 2,
      ratePer100k: 26.8,
      confidenceIntervalLow: 20.4,
      confidenceIntervalHigh: 34.0,
      sub: {
        pedestrianAccidentRate: 19.5,
        fireRate: 5.8,
        emergencyAccessMinutes: 11,
        nightCrimeSharePct: 26,
        securityFacilityDensity: 70,
      },
    },
  },
  {
    code: "44150",
    name: "공주시",
    province: "충청남도",
    lat: 36.4465,
    lng: 127.1189,
    type: "nature",
    groupVisitors: groups([40, 42, 55, 58, 60, 62, 95, 98, 130, 128, 150, 155]),
    experienceScore: 71,
    highlight: "백제 역사 유적 — 50대 이상 방문 비중이 특히 높다",
    attractions: [
      { name: "공산성", category: "역사", tags: ["history"], lat: 36.4600, lng: 127.1225, popularityScore: 92 },
      { name: "무령왕릉과 왕릉원", category: "역사", tags: ["history"], lat: 36.4580, lng: 127.1290, popularityScore: 85 },
      { name: "제민천 카페거리", category: "맛집·카페", tags: ["cafe", "food"], lat: 36.4470, lng: 127.1210, popularityScore: 60 },
    ],
    safety: {
      grade: 1,
      ratePer100k: 14.2,
      confidenceIntervalLow: 9.8,
      confidenceIntervalHigh: 19.9,
      sub: {
        pedestrianAccidentRate: 9.4,
        fireRate: 4.0,
        emergencyAccessMinutes: 15,
        nightCrimeSharePct: 12,
        securityFacilityDensity: 55,
      },
    },
  },
  {
    code: "44760",
    name: "부여군",
    province: "충청남도",
    lat: 36.2757,
    lng: 126.9099,
    type: "nature",
    groupVisitors: groups([35, 36, 40, 41, 45, 46, 78, 80, 120, 118, 140, 142]),
    experienceScore: 68,
    highlight: "고즈넉한 유적지 — 학생 단체·중장년층 방문이 많다",
    attractions: [
      { name: "부소산성", category: "역사", tags: ["history"], lat: 36.2820, lng: 126.9110, popularityScore: 90 },
      { name: "궁남지", category: "역사·자연", tags: ["history", "nature"], lat: 36.2718, lng: 126.9209, popularityScore: 84 },
      { name: "백제문화단지", category: "테마파크", tags: ["theme_park", "history"], lat: 36.2493, lng: 126.9569, popularityScore: 76 },
    ],
    safety: {
      grade: 1,
      ratePer100k: 12.9,
      confidenceIntervalLow: 8.1,
      confidenceIntervalHigh: 18.6,
      sub: {
        pedestrianAccidentRate: 8.1,
        fireRate: 3.6,
        emergencyAccessMinutes: 18,
        nightCrimeSharePct: 10,
        securityFacilityDensity: 48,
      },
    },
  },
  {
    code: "43800",
    name: "단양군",
    province: "충청북도",
    lat: 36.9845,
    lng: 128.3656,
    type: "nature",
    groupVisitors: groups([30, 28, 60, 58, 90, 88, 100, 95, 110, 105, 95, 98]),
    experienceScore: 74,
    highlight: "패러글라이딩·짚와이어 등 액티비티로 30~40대가 즐겨 찾는다",
    attractions: [
      { name: "만천하스카이워크", category: "액티비티·전망", tags: ["activity", "view"], lat: 36.9808, lng: 128.3467, popularityScore: 90 },
      { name: "도담삼봉", category: "자연", tags: ["nature", "view"], lat: 36.9987, lng: 128.3654, popularityScore: 88 },
      { name: "단양 패러글라이딩 활공장", category: "액티비티", tags: ["activity"], lat: 36.9722, lng: 128.3585, popularityScore: 82 },
      { name: "고수동굴", category: "자연", tags: ["nature"], lat: 36.9755, lng: 128.3743, popularityScore: 65 },
    ],
    safety: {
      grade: 2,
      ratePer100k: 17.5,
      confidenceIntervalLow: 11.2,
      confidenceIntervalHigh: 25.8,
      sub: {
        pedestrianAccidentRate: 11.0,
        fireRate: 5.2,
        emergencyAccessMinutes: 22,
        nightCrimeSharePct: 14,
        securityFacilityDensity: 40,
      },
    },
  },
  {
    code: "51110",
    name: "춘천시",
    province: "강원특별자치도",
    lat: 37.8813,
    lng: 127.7298,
    type: "urban",
    groupVisitors: groups([55, 58, 140, 150, 120, 118, 100, 98, 90, 88, 70, 72]),
    experienceScore: 65,
    highlight: "닭갈비 거리와 호숫가 산책로 — 20대 커플·친구 방문이 많다",
    attractions: [
      { name: "남이섬", category: "자연·테마", tags: ["nature", "theme_park"], lat: 37.7904, lng: 127.5253, popularityScore: 95 },
      { name: "명동 닭갈비골목", category: "맛집", tags: ["food"], lat: 37.8759, lng: 127.7327, popularityScore: 85 },
      { name: "소양강 스카이워크", category: "액티비티·전망", tags: ["activity", "view"], lat: 37.8927, lng: 127.7325, popularityScore: 78 },
      { name: "김유정문학촌", category: "문화", tags: ["culture"], lat: 37.8302, lng: 127.5885, popularityScore: 55 },
    ],
    safety: {
      grade: 2,
      ratePer100k: 22.1,
      confidenceIntervalLow: 16.5,
      confidenceIntervalHigh: 29.3,
      sub: {
        pedestrianAccidentRate: 15.8,
        fireRate: 5.5,
        emergencyAccessMinutes: 13,
        nightCrimeSharePct: 19,
        securityFacilityDensity: 65,
      },
    },
  },
  {
    code: "51150",
    name: "강릉시",
    province: "강원특별자치도",
    lat: 37.7519,
    lng: 128.8761,
    type: "urban",
    groupVisitors: groups([65, 70, 200, 210, 160, 158, 130, 128, 110, 108, 85, 90]),
    experienceScore: 80,
    highlight: "해변 카페거리 — 전 연령대가 찾지만 특히 20대 비중이 압도적",
    attractions: [
      { name: "경포해변", category: "자연·해변", tags: ["nature"], lat: 37.8055, lng: 128.9059, popularityScore: 93 },
      { name: "안목해변 카페거리", category: "카페·맛집", tags: ["cafe", "food"], lat: 37.7723, lng: 128.9464, popularityScore: 89 },
      { name: "강릉중앙시장", category: "맛집·쇼핑", tags: ["food", "shopping"], lat: 37.7563, lng: 128.8977, popularityScore: 70 },
      { name: "오죽헌", category: "역사", tags: ["history"], lat: 37.7799, lng: 128.8767, popularityScore: 62 },
    ],
    safety: {
      grade: 3,
      ratePer100k: 29.4,
      confidenceIntervalLow: 22.0,
      confidenceIntervalHigh: 38.1,
      sub: {
        pedestrianAccidentRate: 20.6,
        fireRate: 6.8,
        emergencyAccessMinutes: 14,
        nightCrimeSharePct: 24,
        securityFacilityDensity: 72,
      },
    },
  },
  {
    code: "51230",
    name: "속초시",
    province: "강원특별자치도",
    lat: 38.2070,
    lng: 128.5918,
    type: "urban",
    groupVisitors: groups([50, 52, 130, 140, 150, 148, 120, 118, 95, 92, 75, 78]),
    experienceScore: 76,
    highlight: "설악산과 항구 — 가족 단위 30~40대 방문이 두드러진다",
    attractions: [
      { name: "설악산 국립공원", category: "자연", tags: ["nature"], lat: 38.1670, lng: 128.4657, popularityScore: 94 },
      { name: "속초 중앙시장", category: "맛집·쇼핑", tags: ["food", "shopping"], lat: 38.2044, lng: 128.5919, popularityScore: 88 },
      { name: "대포항", category: "맛집·자연", tags: ["food", "nature"], lat: 38.1834, lng: 128.6122, popularityScore: 80 },
      { name: "아바이마을", category: "문화·맛집", tags: ["culture", "food"], lat: 38.1961, lng: 128.6042, popularityScore: 75 },
    ],
    safety: {
      grade: 2,
      ratePer100k: 20.7,
      confidenceIntervalLow: 14.9,
      confidenceIntervalHigh: 28.0,
      sub: {
        pedestrianAccidentRate: 13.9,
        fireRate: 5.0,
        emergencyAccessMinutes: 16,
        nightCrimeSharePct: 17,
        securityFacilityDensity: 68,
      },
    },
  },
  {
    code: "51830",
    name: "평창군",
    province: "강원특별자치도",
    lat: 37.3705,
    lng: 128.3900,
    type: "nature",
    groupVisitors: groups([45, 40, 70, 65, 130, 128, 140, 135, 90, 85, 60, 58]),
    experienceScore: 83,
    highlight: "스키·캠핑 등 아웃도어 콘텐츠 — 자녀 동반 30~40대 가족이 많다",
    attractions: [
      { name: "대관령 양떼목장", category: "자연·체험", tags: ["nature", "activity"], lat: 37.6883, lng: 128.7325, popularityScore: 87 },
      { name: "오대산 국립공원(월정사)", category: "자연·역사", tags: ["nature", "history"], lat: 37.7867, lng: 128.5967, popularityScore: 78 },
      { name: "알펜시아리조트", category: "액티비티", tags: ["activity", "resort"], lat: 37.6597, lng: 128.6764, popularityScore: 70 },
      { name: "휘닉스파크", category: "액티비티", tags: ["activity", "resort"], lat: 37.5872, lng: 128.3403, popularityScore: 68 },
    ],
    safety: {
      grade: 1,
      ratePer100k: 11.6,
      confidenceIntervalLow: 6.9,
      confidenceIntervalHigh: 18.2,
      sub: {
        pedestrianAccidentRate: 7.5,
        fireRate: 4.4,
        emergencyAccessMinutes: 24,
        nightCrimeSharePct: 9,
        securityFacilityDensity: 44,
      },
    },
  },
  {
    code: "51770",
    name: "정선군",
    province: "강원특별자치도",
    lat: 37.3806,
    lng: 128.6608,
    type: "nature",
    groupVisitors: groups([25, 22, 45, 40, 60, 55, 70, 68, 100, 98, 120, 118]),
    experienceScore: 66,
    highlight: "레일바이크와 카지노 — 50대 이상 방문 비중이 특화되어 있다",
    attractions: [
      { name: "정선 레일바이크", category: "액티비티", tags: ["activity"], lat: 37.3765, lng: 128.8271, popularityScore: 90 },
      { name: "강원랜드", category: "리조트", tags: ["resort"], lat: 37.2036, lng: 128.8132, popularityScore: 85 },
      { name: "정선아리랑시장", category: "맛집·쇼핑", tags: ["food", "shopping"], lat: 37.3803, lng: 128.6606, popularityScore: 72 },
      { name: "화암동굴", category: "자연", tags: ["nature"], lat: 37.3612, lng: 128.9391, popularityScore: 60 },
    ],
    safety: {
      grade: 2,
      ratePer100k: 19.8,
      confidenceIntervalLow: 12.4,
      confidenceIntervalHigh: 29.6,
      sub: {
        pedestrianAccidentRate: 10.2,
        fireRate: 5.9,
        emergencyAccessMinutes: 27,
        nightCrimeSharePct: 22,
        securityFacilityDensity: 38,
      },
    },
  },
];

export const SAMPLE_REGIONS: Region[] = raw.map((r) => ({
  ...r,
  totalVisitors: totalOf(r.groupVisitors),
}));
