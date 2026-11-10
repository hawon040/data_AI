/**
 * 날씨 × 일행 추천 규칙에 쓰는 기준값 모음.
 *
 * ※ 팀 기준(안) — 기상청·환경부 공식 기준이 아니라 우리 팀이 정한 잠정값이다.
 *   값을 바꿀 때는 이 파일만 고치면 되고, 바꾼 이유를 작업기록에 남긴다.
 *
 * normal: 일반 일행 / strict: 어르신(60대 이상)이나 아이(10세 미만)가 있는 일행
 */

export interface ThresholdPair {
  normal: number;
  strict: number;
}

/** 팀 기준(안): 강수확률(%)이 이 값 이상이면 "비·눈 예보"로 보고 실내만 추천한다. */
export const RAIN_INDOOR_POP: ThresholdPair = { normal: 60, strict: 40 };

/** 팀 기준(안): 날씨가 좋아도 강수확률(%)이 이 값 이상이면 "비 소식"으로 보고 실내 대안을 함께 보여 준다. */
export const RAIN_NOTICE_POP: ThresholdPair = { normal: 30, strict: 20 };

/** 팀 기준(안): 최저기온(℃)이 이 값 이하이면 "추운 날"로 보고 실내만 추천한다. */
export const COLD_MAX_TEMP_C: ThresholdPair = { normal: -5, strict: 0 };

/** 팀 기준(안): 최고기온(℃)이 이 값 이상이면 "더운 날"로 보고 실내만 추천한다.
 * 참고: 기상청 폭염주의보는 일 최고 체감온도 33℃ 이상이 2일 이상 이어질 때 발표된다. */
export const HOT_MIN_TEMP_C: ThresholdPair = { normal: 33, strict: 30 };

/** 팀 기준(안): PM10·PM2.5 중 하나라도 이 등급 이상이면 실내만 추천한다(1 좋음, 2 보통, 3 나쁨, 4 매우나쁨).
 * strict도 3이다. 환경부 행동요령은 민감군도 "나쁨"부터 실외활동을 줄이라고 안내한다. */
export const DUST_INDOOR_GRADE: ThresholdPair = { normal: 3, strict: 3 };

/** 팀 기준(안): 이 특보가 발효 중이면 바다·산·계곡을 추천에서 뺀다. */
export const TERRAIN_EXCLUDE_WARNINGS = {
  normal: ["호우", "태풍", "풍랑"],
  strict: ["호우", "태풍", "풍랑", "강풍", "대설"],
} as const;

/** 팀 기준(안): 방문일이 오늘부터 이 일수보다 멀면 예보가 바뀔 수 있다고 보고 "출발 2~3일 전에 다시 확인"을 안내한다. */
export const FORECAST_RECHECK_DAYS = 3;
