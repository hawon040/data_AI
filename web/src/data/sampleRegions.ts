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
