import { describe, expect, it } from "vitest";
import { cleanAccessText, partyNeeds, toAccessSummary, type AttractionAccess } from "./liveAccess";

const matched = (overrides: Partial<Extract<AttractionAccess, { matched: true }>> = {}): AttractionAccess => ({
  matched: true,
  name: "독립기념관",
  matchedBy: "같은 이름",
  title: "독립기념관",
  address: "",
  available: { stroller: "대여 가능", lactationroom: "있음", restroom: "있음" },
  labels: { stroller: "유아차 대여·이용", lactationroom: "수유실", restroom: "장애인 화장실" },
  fitScore: 75,
  fitHave: ["수유실", "장애인 화장실", "유아차 대여·이용"],
  fitMissing: ["유아용 의자"],
  needs: ["아이"],
  note: "",
  ...overrides,
});

describe("toAccessSummary (/api/access/match 응답 → 화면 요약)", () => {
  it("필요한 시설을 '있음'과 '등록 정보 없음'으로 나누고 배지·체크리스트 한 줄을 만든다", () => {
    expect(toAccessSummary("독립기념관", matched())).toEqual({
      hasInfo: true,
      have: ["수유실", "장애인 화장실", "유아차 대여·이용"],
      noInfo: ["유아용 의자"],
      prepTip: "독립기념관: 수유실·장애인 화장실·유아차 대여·이용 정보 있음 (한국관광공사 무장애 여행정보)",
    });
  });
  it("일행 조건이 없으면 배지만 있고 체크리스트 한 줄은 없다", () => {
    const summary = toAccessSummary("독립기념관", matched({ needs: [], fitHave: [], fitMissing: [], fitScore: null }));
    expect(summary.hasInfo).toBe(true);
    expect(summary.prepTip).toBeNull();
  });
  it("등록되지 않았거나 아직 못 불러왔으면 배지도 없다", () => {
    expect(toAccessSummary("아라리오갤러리 천안", { matched: false, name: "아라리오갤러리 천안", note: "" }).hasInfo).toBe(false);
    expect(toAccessSummary("x", undefined).hasInfo).toBe(false);
  });
});

describe("partyNeeds", () => {
  it("어르신·아이 동반을 barrierfree.py 일행 이름으로 바꾼다", () => {
    expect(partyNeeds({ withElderly: true, withChildren: true })).toBe("senior,child");
    expect(partyNeeds({ withElderly: false, withChildren: true })).toBe("child");
    expect(partyNeeds({ withElderly: false, withChildren: false })).toBe("");
  });
});

describe("cleanAccessText", () => {
  it("관광공사 응답의 <br>·태그를 글자로 정리한다", () => {
    expect(cleanAccessText("장애인 주차장 있음<br>(10대)<br/> <b>무료</b>")).toBe("장애인 주차장 있음 (10대) 무료");
  });
});
