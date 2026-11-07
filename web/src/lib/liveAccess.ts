/**
 * 추천 관광지의 무장애 편의 정보를 tourapi 서버(/tourapi/api/access/match, tourapi/barrierfree.py)에서 불러온다.
 * 웹앱 관광지에는 관광공사 콘텐츠 ID가 없어서 서버가 이름으로 찾아 맞춘다. 추천 순위에는 쓰지 않는다.
 */
import type { Attraction } from "./types";

const TOURAPI_BASE = "/tourapi";

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
    request = fetch(`${TOURAPI_BASE}/api/access/match?${params}`).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || body === null) {
        console.warn(`무장애 정보 요청 실패 (${attraction.name})`, response.status, body?.error ?? "");
        throw new Error("무장애 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      return body as AttractionAccess;
    });
    request.catch(() => requests.delete(key));
    requests.set(key, request);
  }
  return request;
}
