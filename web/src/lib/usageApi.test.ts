import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnonId, getUsageConsent, loadUsageSummary, sendUsageEvent, setUsageConsent, toUsageEvent } from "./usageApi";
import { EMPTY_USAGE } from "./usageAdjust";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  } as unknown as Storage;
}

const draft = {
  kind: "rating" as const, regionCode: "44130", attraction: "독립기념관",
  person: { gender: "F" as const, ageGroup: "60plus" as const }, personIndex: 1, score: 5,
};

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("동의 상태", () => {
  it("묻기 전에는 null이고, 선택은 저장된다", () => {
    expect(getUsageConsent()).toBeNull();
    setUsageConsent(true);
    expect(getUsageConsent()).toBe("agreed");
    setUsageConsent(false);
    expect(getUsageConsent()).toBe("declined");
  });

  it("브라우저 저장소를 못 쓰면 동의하지 않은 것으로 본다", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getUsageConsent()).toBeNull();
  });
});

describe("기록 보내기", () => {
  it("동의하지 않았으면 서버로 아무것도 보내지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendUsageEvent(draft)).toBe("skipped");
    setUsageConsent(false);
    expect(await sendUsageEvent(draft)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("보내는 내용에는 성별·연령대·지역·관광지·행동·점수·임의 번호뿐이다", async () => {
    setUsageConsent(true);
    const fetchMock = vi.fn().mockResolvedValue({ status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendUsageEvent(draft)).toBe("saved");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/tourapi/api/usage");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(
      ["age_group", "anon_id", "attraction", "gender", "kind", "occurred_at", "region_code", "score"],
    );
    expect(body.anon_id).toBe(`${getAnonId()}-1`);
    expect(body).toMatchObject({ gender: "F", age_group: "60plus", region_code: "44130", score: 5 });
  });

  it("길찾기 기록에는 score를 넣지 않는다", () => {
    const event = toUsageEvent({ ...draft, kind: "directions", score: undefined }, "abc");
    expect("score" in event).toBe(false);
  });

  it.each([
    [200, "duplicate"], [429, "limited"], [503, "unavailable"], [400, "unavailable"],
  ])("서버 응답 %i → %s", async (status, expected) => {
    setUsageConsent(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status }));
    expect(await sendUsageEvent(draft)).toBe(expected);
  });

  it("서버에 닿지 않아도 예외를 던지지 않는다", async () => {
    setUsageConsent(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await sendUsageEvent(draft)).toBe("unavailable");
  });

  it("같은 브라우저는 같은 임의 번호를 쓴다", () => {
    expect(getAnonId()).toBe(getAnonId());
    expect(getAnonId().length).toBeGreaterThanOrEqual(16);
  });
});

describe("요약 불러오기", () => {
  it("저장소가 없다는 응답(available:false)이나 오류는 빈 요약이 된다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: false }) }));
    expect(await loadUsageSummary()).toBe(EMPTY_USAGE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await loadUsageSummary()).toBe(EMPTY_USAGE);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")));
    expect(await loadUsageSummary()).toBe(EMPTY_USAGE);
  });
});
