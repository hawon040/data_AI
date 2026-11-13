import type { TransportMode } from "../lib/tripPreferences";

/**
 * 도보·자전거일 때 출발지에서 이 거리(직선, km)보다 먼 관광지는 추천에서 뺀다.
 * 대중교통·관광버스·자가용은 거리를 표시만 하고 거르지 않는다. 팀 기준(11/14), 잠정값.
 */
export const MAX_DISTANCE_KM: Partial<Record<TransportMode, number>> = {
  walking: 5,
  bicycle: 15,
};
