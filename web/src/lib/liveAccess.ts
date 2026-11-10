/**
 * 추천 관광지의 무장애 편의 정보를 tourapi 서버(/tourapi/api/access/match, tourapi/barrierfree.py)에서 불러온다.
 * 웹앱 관광지에는 관광공사 콘텐츠 ID가 없어서 서버가 이름으로 찾아 맞춘다. 추천 순위에는 쓰지 않는다.
 */
import { useEffect, useState } from "react";
import type { Attraction } from "./types";

const TOURAPI_BASE = "/tourapi";
export const ACCESS_FAILED_MESSAGE = "정보를 불러오지 못했습니다";

export interface AccessParty {
  withElderly: boolean;
  withChildren: boolean;
}

export type AttractionAccess =
  | { matched: false; name: string; note: string }
  | {
      matched: true;
      name: string;
      /** "같은 이름" 또는 "이름 일부" */
      matchedBy: string;
      /** 관광공사에 등록된 이름 */
      title: string;
      address: string;
      /** 항목 키 → 내용 (값이 있는 항목만) */
      available: Record<string, string>;
      /** 항목 키 → 화면 이름 */
      labels: Record<string, string>;
      /** 일행 조건이 있을 때만: 필요한 시설 중 정보가 있는 비율(%) */
      fitScore: number | null;
      fitHave: string[];
      fitMissing: string[];
      needs: string[];
      note: string;
    };

export function partyNeeds(party: AccessParty): string {
  return [party.withElderly && "senior", party.withChildren && "child"].filter(Boolean).join(",");
}

/** 관광공사 응답의 <br> 등 태그를 글자로 정리한다. */
export function cleanAccessText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const requests = new Map<string, Promise<AttractionAccess>>();

/** 관광지 하나의 무장애 정보. 같은 관광지·일행 조건은 한 번만 부른다(실패하면 다음에 다시 부른다). */
export function loadAttractionAccess(attraction: Attraction, party: AccessParty): Promise<AttractionAccess> {
  const needs = partyNeeds(party);
  const key = `${attraction.name}|${attraction.lat}|${attraction.lng}|${needs}`;
  let request = requests.get(key);
  if (!request) {
    const params = new URLSearchParams({
      lat: String(attraction.lat),
      lon: String(attraction.lng),
      name: attraction.name,
      with: needs,
    });
    request = fetch(`${TOURAPI_BASE}/api/access/match?${params}`)
      .catch((error: unknown) => {
        console.warn(`무장애 정보 요청 실패 (${attraction.name})`, error);
        throw new Error(ACCESS_FAILED_MESSAGE);
      })
      .then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || body === null) {
        console.warn(`무장애 정보 요청 실패 (${attraction.name})`, response.status, body?.error ?? "");
        throw new Error(ACCESS_FAILED_MESSAGE);
      }
      return body as AttractionAccess;
    });
    request.catch(() => requests.delete(key));
    requests.set(key, request);
  }
  return request;
}

/** 화면용 요약: 일행에게 필요한 시설을 "있음"과 "등록 정보 없음"으로 나누고, 배지·준비물 한 줄을 만든다. */
export interface AccessSummary {
  /** 관광공사에 등록된 편의 정보가 하나라도 있는지 (추천 카드 배지) */
  hasInfo: boolean;
  /** 일행에게 필요한 시설 중 정보가 있는 것 */
  have: string[];
  /** 일행에게 필요한 시설 중 등록 정보가 없는 것 (시설이 없다는 뜻이 아님) */
  noInfo: string[];
  /** 어르신·아이 동반일 때 체크리스트에 넣을 한 줄. 없으면 null */
  prepTip: string | null;
}

export function toAccessSummary(attractionName: string, data: AttractionAccess | undefined): AccessSummary {
  if (!data || !data.matched) return { hasInfo: false, have: [], noInfo: [], prepTip: null };
  const hasInfo = Object.keys(data.available).length > 0;
  const have = data.needs.length > 0 ? data.fitHave : [];
  const noInfo = data.needs.length > 0 ? data.fitMissing : [];
  return {
    hasInfo,
    have,
    noInfo,
    prepTip: have.length > 0 ? `${attractionName}: ${have.join("·")} 정보 있음 (한국관광공사 무장애 여행정보)` : null,
  };
}

/** 관광지 여러 곳의 무장애 정보를 불러온다. 이름 → 결과(실패한 곳은 빠진다). */
export function useAttractionAccessMap(attractions: Attraction[], party: AccessParty) {
  const needs = partyNeeds(party);
  const key = `${needs}|${attractions.map((a) => `${a.name}@${a.lat},${a.lng}`).join(";")}`;
  const [state, setState] = useState<{ key: string; map: Record<string, AttractionAccess> }>({ key: "", map: {} });
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(attractions.map((attraction) => loadAttractionAccess(attraction, party))).then((results) => {
      if (cancelled) return;
      const map: Record<string, AttractionAccess> = {};
      results.forEach((result, i) => {
        if (result.status === "fulfilled") map[attractions[i].name] = result.value;
      });
      setState({ key, map });
    });
    return () => {
      cancelled = true;
    };
    // attractions·party는 key에 담겨 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.map : {};
}
