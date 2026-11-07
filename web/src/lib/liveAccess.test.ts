import { describe, expect, it } from "vitest";
import { cleanAccessText, partyNeeds } from "./liveAccess";

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
