import type { TransportMode } from "../lib/tripPreferences";

/**
 * 예상 편도 이동 시간을 어림하는 속도(직선거리 기준 km/h). 도로·노선을 따라가는 실제 시간이 아니라 어림값이다.
 * 환산 속도와 아래 2시간 기준은 사업용 차량의 "2시간 운전 후 15분 휴식" 규정을 참고해 팀이 정한 값이다(11/14).
 */
export const TRAVEL_SPEED_KMH: Record<TransportMode, number> = {
  car: 60,
  "tour-bus": 60,
  "public-transit": 45,
  bicycle: 15,
  walking: 4,
};

/** 당일치기로는 먼 곳 표시, 휴식 안내, 어르신·아이 권장 기준(편도 시간) */
export const LONG_TRIP_HOURS = 2;

/** '최대 이동 시간' 선택지. null은 '상관없음'(거르지 않음, 기본값) */
export const MAX_TRAVEL_HOURS_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "상관없음" },
  { value: 1, label: "1시간" },
  { value: 2, label: "2시간" },
  { value: 3, label: "3시간" },
];
