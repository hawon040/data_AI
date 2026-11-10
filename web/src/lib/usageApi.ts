/**
 * 사용자 기록 보내기·불러오기와 동의 상태.
 *
 * 기록은 사용자가 동의했을 때만 보낸다. 보내는 것은 성별·연령대·지역·관광지·행동뿐이고
 * 이름·연락처·위치는 보내지 않는다. 서버(tourapi)가 꺼져 있거나 저장소가 없어도 화면은 그대로 동작한다.
 */
import { EMPTY_USAGE, type UsageSummary } from "./usageAdjust";
import type { Person } from "./types";

const TOURAPI_BASE = "/tourapi";
const CONSENT_KEY = "tourlink.usageConsent";
const ANON_KEY = "tourlink.anonId";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // 개인정보 보호 모드 등에서 접근이 막힌 경우
  }
}

/** "agreed" | "declined" | null(아직 묻지 않음) */
export function getUsageConsent(): "agreed" | "declined" | null {
  const value = storage()?.getItem(CONSENT_KEY);
  return value === "agreed" || value === "declined" ? value : null;
}

export function setUsageConsent(agreed: boolean) {
  try {
    storage()?.setItem(CONSENT_KEY, agreed ? "agreed" : "declined");
  } catch {
    /* 저장하지 못해도 이번 방문에서는 선택이 유지된다 */
  }
}

/** 브라우저마다 한 번 만드는 임의 값. 사람을 알아내는 데 쓰지 않고 같은 사람의 반복 기록을 한 번만 세는 데만 쓴다. */
export function getAnonId(): string {
  const store = storage();
  let id = store?.getItem(ANON_KEY);
  if (!id) {
    id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, "");
    try {
      store?.setItem(ANON_KEY, id);
    } catch {
      /* 저장하지 못하면 이번 방문 동안만 같은 값을 쓰지 못한다 */
    }
  }
  return id;
}

export type UsageKind = "rating" | "directions";

export interface UsageDraft {
  kind: UsageKind;
  regionCode: string;
  attraction: string;
  person: Person;
  /** 같은 일행 안에서 사람을 구분하는 번호(같은 날 같은 기록이 하나로 합쳐지지 않게) */
  personIndex: number;
  score?: number;
}

/** 서버 응답에 맞춘 결과: saved 저장됨 / duplicate 이미 기록됨 / skipped 동의 없음 / unavailable 저장 못 함 */
export type UsageResult = "saved" | "duplicate" | "skipped" | "unavailable" | "limited";

export function toUsageEvent(draft: UsageDraft, anonId: string, now = new Date()) {
  return {
    anon_id: `${anonId}-${draft.personIndex}`,
    kind: draft.kind,
    region_code: draft.regionCode,
    attraction: draft.attraction,
    gender: draft.person.gender,
    age_group: draft.person.ageGroup,
    occurred_at: now.toISOString(),
    ...(draft.kind === "rating" ? { score: draft.score } : {}),
  };
}

export async function sendUsageEvent(draft: UsageDraft): Promise<UsageResult> {
  if (getUsageConsent() !== "agreed") return "skipped";
  try {
    const res = await fetch(`${TOURAPI_BASE}/api/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toUsageEvent(draft, getAnonId())),
      keepalive: true,
    });
    if (res.status === 201) return "saved";
    if (res.status === 200) return "duplicate";
    if (res.status === 429) return "limited";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function loadUsageSummary(): Promise<UsageSummary> {
  try {
    const res = await fetch(`${TOURAPI_BASE}/api/usage/summary`);
    if (!res.ok) return EMPTY_USAGE;
    const data = (await res.json()) as UsageSummary;
    return data?.available ? data : EMPTY_USAGE;
  } catch {
    return EMPTY_USAGE;
  }
}
