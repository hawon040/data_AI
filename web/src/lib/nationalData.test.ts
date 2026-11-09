import { describe, expect, it } from "vitest";
import { splitRecommendedSpots, type NationalSpot } from "./nationalData";

function spot(name: string, province: string, district: string, capacity: number | null): NationalSpot {
  return {
    name,
    kind: "",
    province,
    district,
    address: "",
    lat: 0,
    lng: 0,
    capacity,
    parking: null,
    phone: "",
    facilities: "",
    intro: "",
    referenceDate: "",
  };
}

const names = (list: NationalSpot[]) => list.map((item) => item.name);
const busan = spot("을숙도", "부산광역시", "사하구", 4500000);
const gangneung = spot("경포대", "강원특별자치도", "강릉시", 1000);
const gangneung2 = spot("오죽헌", "강원특별자치도", "강릉시", 5000);
const goseongGw = spot("통일전망대", "강원특별자치도", "고성군", 2000);
const goseongGn = spot("당항포", "경상남도", "고성군", 9000);
const cheongju = spot("상당산성", "충청북도", "청주시", null);
const noDistrict = spot("시군구 없음", "강원특별자치도", "", 8000);

describe("splitRecommendedSpots (지도 대신 나오는 목록 순서)", () => {
  it("추천 지역 관광지를 앞에, 각각 수용인원 많은 순으로 둔다", () => {
    const { recommended, others } = splitRecommendedSpots([busan, gangneung, gangneung2, goseongGw], [
      { province: "강원특별자치도", name: "강릉시" },
    ]);
    expect(names(recommended)).toEqual(["오죽헌", "경포대"]);
    expect(names(others)).toEqual(["을숙도", "통일전망대"]);
  });
  it("같은 이름의 시·군이라도 도가 다르면 추천 지역이 아니다", () => {
    const { recommended } = splitRecommendedSpots([goseongGw, goseongGn], [
      { province: "강원특별자치도", name: "고성군" },
    ]);
    expect(names(recommended)).toEqual(["통일전망대"]);
  });
  it("지역 이름에 구까지 있어도 관광지의 시와 맞춘다", () => {
    const { recommended } = splitRecommendedSpots([cheongju], [{ province: "충청북도", name: "청주시 상당구" }]);
    expect(names(recommended)).toEqual(["상당산성"]);
  });
  it("시·군·구가 비어 있는 관광지는 추천 지역으로 치지 않는다", () => {
    const { recommended } = splitRecommendedSpots([noDistrict], [{ province: "강원특별자치도", name: "강릉시" }]);
    expect(recommended).toEqual([]);
  });
  it("추천 지역이 없으면 전체가 수용인원 많은 순이다", () => {
    const { recommended, others } = splitRecommendedSpots([gangneung, busan], []);
    expect(recommended).toEqual([]);
    expect(names(others)).toEqual(["을숙도", "경포대"]);
  });
});
