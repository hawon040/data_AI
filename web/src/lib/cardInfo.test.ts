import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { attractionMeta, categoryChips, exclusionLabel, weatherCause } from "./cardInfo";
import { EMPTY_WEATHER } from "./liveWeather";
import { decideWeather } from "./weatherRules";

const attraction = (name: string, category: string) => ({ name, category });
const nobody = { withElderly: false, withChildren: false };
const decide = (over: Partial<typeof EMPTY_WEATHER>) => decideWeather({ ...EMPTY_WEATHER, ...over }, nobody, "2026-11-14", "2026-11-14");

describe("categoryChips (카드 카테고리 칩)", () => {
  it("'역사·문화'처럼 묶인 값은 나눠서 세고, 많은 순 최대 3개", () => {
    const chips = categoryChips([
      attraction("a", "역사"),
      attraction("b", "역사·문화"),
      attraction("c", "문화예술"),
      attraction("d", "자연"),
      attraction("e", "역사·자연"),
      attraction("f", "맛집"),
    ]);
    expect(chips).toEqual(["역사", "자연", "문화"]);
  });
  it("같은 수면 먼저 나온 순서, 3개보다 적으면 있는 만큼", () => {
    expect(categoryChips([attraction("a", "카페·맛집"), attraction("b", "맛집·쇼핑")])).toEqual(["맛집", "카페", "쇼핑"]);
    expect(categoryChips([attraction("a", "자연")])).toEqual(["자연"]);
    expect(categoryChips([])).toEqual([]);
  });
  it("강릉시 관광지: 자연 3·맛집 3(먼저 나온 자연이 앞), 그다음 해변", () => {
    const gangneung = SAMPLE_REGIONS.find((r) => r.name === "강릉시")!;
    expect(categoryChips(gangneung.attractions)).toEqual(["자연", "맛집", "해변"]);
  });
});

describe("attractionMeta (관광지 버튼 옆 작은 글씨)", () => {
  it("카테고리와 실내/야외", () => {
    expect(attractionMeta(attraction("안목해변 카페거리", "카페·맛집"))).toBe("카페·맛집 · 실내");
    expect(attractionMeta(attraction("경포해변", "자연·해변"))).toBe("자연·해변 · 야외");
  });
});

describe("exclusionLabel (날씨로 빠진 관광지 사유)", () => {
  it("비 예보·강수확률이면 '비 예보로 제외'", () => {
    expect(exclusionLabel(attraction("경포해변", "자연·해변"), decide({ pop: 80, precipitation: "rain" }))).toBe("비 예보로 제외");
    expect(exclusionLabel(attraction("경포해변", "자연·해변"), decide({ pop: 70, precipitation: "none" }))).toBe("비 예보로 제외");
  });
  it("눈·추위·더위·미세먼지", () => {
    expect(exclusionLabel(attraction("오죽헌", "역사"), decide({ pop: 70, precipitation: "snow" }))).toBe("눈 예보로 제외");
    expect(exclusionLabel(attraction("오죽헌", "역사"), decide({ minTempC: -10, maxTempC: -3 }))).toBe("추위로 제외");
    expect(exclusionLabel(attraction("오죽헌", "역사"), decide({ minTempC: 25, maxTempC: 35 }))).toBe("더위로 제외");
    expect(exclusionLabel(attraction("오죽헌", "역사"), decide({ pm10Grade: 3 }))).toBe("미세먼지로 제외");
  });
  it("특보로 바다·산이 빠지면 특보 이름", () => {
    const decision = decide({ warnings: ["호우"] });
    expect(exclusionLabel(attraction("경포해변", "자연·해변"), decision)).toBe("호우특보로 제외");
    expect(weatherCause(decide({ pop: 80, precipitation: "rain" }))).toBe("비 예보");
  });
});

describe("샘플 소개 문구 삭제", () => {
  it("시범 지역 데이터에 지어낸 소개 문구(highlight)가 없다", () => {
    expect(SAMPLE_REGIONS.every((region) => !("highlight" in region))).toBe(true);
  });
});
