/**
 * 동행 구성·시간대에 따른 안전 지표 표시 순서 (문서 4.5).
 * 등급 자체는 바뀌지 않는다 — 바뀌는 것은 어떤 지표를 먼저 보여주느냐뿐이다.
 */
import type { SafetyIndex, SafetySubIndicators } from "./types";

export interface SafetyDisplayFilters {
  withChildren: boolean;
  withElderly: boolean;
  nightPlan: boolean;
}

export interface SafetyIndicatorRow {
  key: keyof SafetySubIndicators;
  label: string;
  value: string;
}

function allIndicatorRows(sub: SafetySubIndicators): Record<keyof SafetySubIndicators, SafetyIndicatorRow> {
  return {
    pedestrianAccidentRate: {
      key: "pedestrianAccidentRate",
      label: "보행자 사고율 (10만 명당)",
      value: sub.pedestrianAccidentRate.toFixed(1),
    },
    emergencyAccessMinutes: {
      key: "emergencyAccessMinutes",
      label: "가장 가까운 응급실까지",
      value: `${sub.emergencyAccessMinutes.toFixed(0)}분`,
    },
    securityFacilityDensity: {
      key: "securityFacilityDensity",
      label: "보안등·비상벨 밀도",
      value: `${sub.securityFacilityDensity.toFixed(0)}/100`,
    },
    nightCrimeSharePct: {
      key: "nightCrimeSharePct",
      label: "야간(22시~06시) 범죄 비중",
      value: `${sub.nightCrimeSharePct.toFixed(0)}%`,
    },
    fireRate: {
      key: "fireRate",
      label: "화재 발생률 (10만 명당)",
      value: sub.fireRate.toFixed(1),
    },
  };
}

export function orderedSafetyIndicators(
  safety: SafetyIndex,
  filters: SafetyDisplayFilters,
): SafetyIndicatorRow[] {
  const rows = allIndicatorRows(safety.sub);
  let priorityKeys: (keyof SafetySubIndicators)[] = [];

  if (filters.withChildren) {
    priorityKeys = ["pedestrianAccidentRate", "emergencyAccessMinutes"];
  } else if (filters.withElderly) {
    priorityKeys = ["emergencyAccessMinutes", "pedestrianAccidentRate"];
  }
  if (filters.nightPlan) {
    priorityKeys = [...priorityKeys, "securityFacilityDensity", "nightCrimeSharePct"];
  }

  const seen = new Set(priorityKeys);
  const rest = (Object.keys(rows) as (keyof SafetySubIndicators)[]).filter((k) => !seen.has(k));
  return [...priorityKeys, ...rest].map((k) => rows[k]);
}
