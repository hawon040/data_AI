import type { IncomingMessage, ServerResponse } from "node:http";

import type { SeasonalPhoto } from "../src/lib/seasonalPhotos";
import type { Season } from "../src/lib/tripPreferences";

interface TourItem {
  addr1?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  contentid?: string;
  contenttypeid?: string;
  firstimage?: string;
  mapy?: string;
  mapx?: string;
  title?: string;
}

interface TourImage {
  cpyrhtDivCd?: string;
  originimgurl?: string;
  smallimageurl?: string;
}

interface TourApiResponse<T> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: T | T[] };
    };
  };
}

type ApiRequest = IncomingMessage;
type ApiResponse = ServerResponse;

const TOUR_API_BASE = "https://apis.data.go.kr/B551011/KorService2";
const KOGL_TYPE_1_URL = "https://www.kogl.or.kr/info/licenseType1.do";
const PHOTO_LIMIT = 8;
const CANDIDATE_LIMIT = 16;

function asArray<T>(items: T | T[] | undefined): T[] {
  if (items === undefined) return [];
  return Array.isArray(items) ? items : [items];
}

function classifySeason(title: string, cat3: string | undefined): Season {
  const text = `${title} ${cat3 ?? ""}`;
  if (/벚꽃|매화|진달래|유채|산수유/.test(text)) return "spring";
  if (/해수욕장|해변|바다|계곡|폭포/.test(text)) return "summer";
  if (/단풍|억새|갈대/.test(text)) return "autumn";
  if (/설경|눈꽃|눈|상고대/.test(text)) return "winter";
  return "spring";
}

function isSafeImageUrl(url: string | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://");
}

async function fetchTourApi<T>(
  endpoint: string,
  serviceKey: string,
  params: Record<string, string>,
): Promise<TourApiResponse<T>> {
  const url = new URL(`${TOUR_API_BASE}/${endpoint}`);
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TrueTrip",
    _type: "json",
    ...params,
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`TourAPI returned HTTP ${response.status}`);

  const body = (await response.json()) as TourApiResponse<T>;
  const header = body.response?.header;
  if (header?.resultCode && header.resultCode !== "0000") {
    throw new Error(`TourAPI returned ${header.resultCode}`);
  }
  return body;
}

async function fetchLandscapePhotos(serviceKey: string): Promise<SeasonalPhoto[]> {
  const listResponse = await fetchTourApi<TourItem>("areaBasedList2", serviceKey, {
    numOfRows: String(CANDIDATE_LIMIT),
    pageNo: "1",
    arrange: "Q",
    contentTypeId: "12",
    cat1: "A01",
    cat2: "A0101",
  });
  const candidates = asArray(listResponse.response?.body?.items?.item).filter(
    (item) =>
      item.contenttypeid === "12" &&
      item.cat1 === "A01" &&
      item.cat2 === "A0101" &&
      item.contentid &&
      item.title &&
      item.firstimage &&
      isSafeImageUrl(item.firstimage),
  );

  const photos = await Promise.all(
    candidates.slice(0, CANDIDATE_LIMIT).map(async (item): Promise<SeasonalPhoto | null> => {
      const imageResponse = await fetchTourApi<TourImage>("detailImage2", serviceKey, {
        contentId: item.contentid!,
        imageYN: "Y",
        subImageYN: "N",
      });
      const image = asArray(imageResponse.response?.body?.items?.item).find(
        (candidate) =>
          candidate.cpyrhtDivCd === "Type1" && isSafeImageUrl(candidate.originimgurl),
      );
      if (!image?.originimgurl || !item.title || !item.contentid) return null;

      return {
        id: `tourapi-${item.contentid}`,
        season: classifySeason(item.title, item.cat3),
        location: item.addr1 ?? "대한민국",
        title: item.title,
        image: image.originimgurl,
        imageAlt: `${item.title} 자연 관광지 풍경`,
        creator: "한국관광공사",
        license: "공공누리 제1유형",
        licenseUrl: KOGL_TYPE_1_URL,
        sourceUrl: `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${encodeURIComponent(item.contentid)}`,
      };
    }),
  );

  return photos.filter((photo): photo is SeasonalPhoto => photo !== null).slice(0, PHOTO_LIMIT);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");

  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "TourAPI service key is not configured" }));
    return;
  }

  try {
    const photos = await fetchLandscapePhotos(serviceKey);
    res.statusCode = 200;
    res.end(JSON.stringify({ photos }));
  } catch (error) {
    console.error("Failed to load licensed TourAPI landscape photos", error);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "TourAPI landscape photos are temporarily unavailable" }));
  }
}
