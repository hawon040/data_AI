import { describe, expect, it } from "vitest";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { SIGUNGU } from "../data/sigungu";
import { addressInDistrict, areaLabel, inDistrict, mapAreaForRegion, mapLayers, mapProvinces, NATIONWIDE, nearestDistrict, regionInArea, selectionForAttraction } from "./mapArea";
import type { NationalShelter, NationalSpot } from "./nationalData";
import { DEFAULT_TRIP_PREFERENCES } from "./tripPreferences";

const spot = (name: string, province: string, district: string) =>
  ({ name, province, district, kind: "", address: "", lat: 0, lng: 0, capacity: null, parking: null, phone: "", facilities: "", intro: "", referenceDate: "" }) as NationalSpot;
const shelter = (name: string, province: string, district: string) =>
  ({ name, province, district, address: "", lat: 0, lng: 0, capacity: null, shelterType: "", altitude: "", operating: "", contact: "" }) as NationalShelter;

const data = {
  spots: [spot("상당산성", "강원특별자치도", "강릉시"), spot("경포대", "강원특별자치도", "강릉시"), spot("설악산", "강원특별자치도", "속초시")],
  shelters: [shelter("안목 대피소", "강원특별자치도", "강릉시"), shelter("속초항 대피소", "강원특별자치도", "속초시")],
  demand: null,
};

describe("추천 입력에서 도·시군구를 뺐다", () => {
  it("여행 조건에 province·regionCode가 없다 — 지도 지역을 바꿔도 추천 입력은 그대로다", () => {
    expect("province" in DEFAULT_TRIP_PREFERENCES).toBe(false);
    expect("regionCode" in DEFAULT_TRIP_PREFERENCES).toBe(false);
  });
});

describe("mapAreaForRegion (추천 카드 → 지도 지역)", () => {
  it.each(SAMPLE_REGIONS.map((r) => [r.name, r] as const))("%s를 누르면 그 도·시군구로 바뀐다", (_name, region) => {
    const area = mapAreaForRegion(region);
    expect(area.province).toBe(region.province);
    expect(area.district).not.toBe("all");
    expect(SIGUNGU[region.province].some(([name]) => name === area.district)).toBe(true);
  });
  it("구까지 있는 이름은 시 단위로 맞춘다 (청주시 상당구 → 청주시)", () => {
    expect(mapAreaForRegion({ province: "충청북도", name: "청주시 상당구" })).toEqual({ province: "충청북도", district: "청주시" });
  });
  it("좌표표에 없으면 도만 바꾸고 시군구는 전체", () => {
    expect(mapAreaForRegion({ province: "충청북도", name: "없는군" })).toEqual({ province: "충청북도", district: "all" });
  });
});

describe("mapLayers (지도에 그릴 것)", () => {
  it("전국이면 관광지만, 대피소·관광 수요는 보이지 않는다", () => {
    const layers = mapLayers({ ...data, demand: { baseYm: "", areaName: "", indicatorName: "", areaTotal: null, rows: [] } }, NATIONWIDE);
    expect(layers.spots).toHaveLength(3);
    expect(layers.shelters).toEqual([]);
    expect(layers.showDemand).toBe(false);
  });
  it("도를 고르면 대피소가 보인다", () => {
    const layers = mapLayers(data, { province: "강원특별자치도", district: "all" });
    expect(layers.shelters.map((s) => s.name)).toEqual(["안목 대피소", "속초항 대피소"]);
  });
  it("시·군·구까지 고르면 관광지·대피소를 그 시군구로 좁힌다", () => {
    const layers = mapLayers(data, { province: "강원특별자치도", district: "강릉시" });
    expect(layers.spots.map((s) => s.name)).toEqual(["상당산성", "경포대"]);
    expect(layers.shelters.map((s) => s.name)).toEqual(["안목 대피소"]);
  });
  it("관광 수요 순위는 도를 골랐고 자료가 있을 때만", () => {
    const demand = { baseYm: "202609", areaName: "강원", indicatorName: "", areaTotal: 1, rows: [] };
    expect(mapLayers({ ...data, demand }, { province: "강원특별자치도", district: "all" }).showDemand).toBe(true);
    expect(mapLayers(data, { province: "강원특별자치도", district: "all" }).showDemand).toBe(false);
  });
  it("시군구 이름 맞추기: 빈 값은 제외, 구까지 있는 이름도 같은 시로 본다", () => {
    expect(inDistrict("청주시", "all")).toBe(true);
    expect(inDistrict("", "청주시")).toBe(false);
    expect(inDistrict("청주시", "청주시")).toBe(true);
    expect(inDistrict("청주시 상당구", "청주시")).toBe(true);
    expect(inDistrict("충주시", "청주시")).toBe(false);
  });
  it("시·도 목록: 지도 데이터의 시·도와 시군구 좌표표의 시·도를 합친다(17개)", () => {
    expect(mapProvinces(["충청북도"])).toHaveLength(17);
  });
});

describe("selectionForAttraction (관광지 버튼 → 지도 이동)", () => {
  it("관광지 버튼을 누르면 그 관광지가 속한 지역과 도·시군구로 지도 지역이 바뀐다", () => {
    const cafe = SAMPLE_REGIONS.flatMap((r) => r.attractions).find((a) => a.name === "안목해변 카페거리")!;
    const selection = selectionForAttraction(cafe, SAMPLE_REGIONS);
    expect(selection?.region.name).toBe("강릉시");
    expect(selection?.area).toEqual({ province: "강원특별자치도", district: "강릉시" });
  });
  it("청주시 상당구 관광지는 충청북도·청주시로", () => {
    const fortress = SAMPLE_REGIONS.flatMap((r) => r.attractions).find((a) => a.name === "상당산성")!;
    expect(selectionForAttraction(fortress, SAMPLE_REGIONS)?.area).toEqual({ province: "충청북도", district: "청주시" });
  });
  it("시범 지역에 없는 관광지(카카오 주변 장소 등)는 지도 지역을 바꾸지 않는다", () => {
    expect(selectionForAttraction({ name: "어딘가 카페" }, SAMPLE_REGIONS)).toBeNull();
  });
});

describe("지도에서 볼 지역과 지도 목록 범위", () => {
  const cheongjuArea = { province: "충청북도", district: "청주시" };
  const jeongseon = SAMPLE_REGIONS.find((r) => r.name === "정선군")!;
  const cheongjuRegion = SAMPLE_REGIONS.find((r) => r.name === "청주시 상당구")!;

  it("지도 지역(충청북도·청주시) 밖의 추천 지역(정선군)은 맨 위 추천 줄에서 숨긴다", () => {
    expect(regionInArea(jeongseon, cheongjuArea)).toBe(false);
    expect(regionInArea(cheongjuRegion, cheongjuArea)).toBe(true);
    expect(regionInArea(jeongseon, NATIONWIDE)).toBe(true);
    expect(regionInArea(jeongseon, { province: "강원특별자치도", district: "all" })).toBe(true);
    expect(regionInArea(jeongseon, { province: "강원특별자치도", district: "강릉시" })).toBe(false);
  });

  it("청주시·천안시를 고르면 그 시의 관광지가 잡힌다(시 단위 이름, 구까지 있는 이름 모두)", () => {
    const spots = [
      spot("청남대", "충청북도", "청주시"),
      spot("상당산성", "충청북도", "청주시 상당구"),
      spot("충주호", "충청북도", "충주시"),
      spot("태조산관광지", "충청남도", "천안시"),
      spot("천안종합휴양관광지", "충청남도", "천안시 동남구"),
    ];
    const layers = (province: string, district: string) => mapLayers({ spots, shelters: [], demand: null }, { province, district }).spots.map((s) => s.name);
    expect(layers("충청북도", "청주시")).toEqual(["청남대", "상당산성"]);
    expect(layers("충청남도", "천안시")).toEqual(["태조산관광지", "천안종합휴양관광지"]);
  });

  it("반려동물 동반은 주소의 시군구로 거른다(청주시를 고르면 충주·괴산·제천은 빠진다)", () => {
    const pet = (name: string, address: string) => ({ name, address, kind: "", lat: 0, lng: 0, image: "", phone: "", contentId: name, contentTypeId: "" });
    const pets = [
      pet("상당 카페", "충청북도 청주시 상당구 상당로 1"),
      pet("흥덕 숙소", "충청북도 청주시 흥덕구 2순환로 2"),
      pet("충주 공원", "충청북도 충주시 탄금대안길 105"),
      pet("괴산 식당", "충청북도 괴산군 괴산읍 자연식품길 31"),
    ];
    const layers = mapLayers({ spots: [], shelters: [], demand: null, pets, medical: [] }, cheongjuArea);
    expect(layers.pets.map((p) => p.name)).toEqual(["상당 카페", "흥덕 숙소"]);
    expect(mapLayers({ spots: [], shelters: [], demand: null, pets, medical: [] }, { province: "충청북도", district: "all" }).pets).toHaveLength(4);
    expect(addressInDistrict("충청북도 청주시 상당구 상당로 1", "청주시")).toBe(true);
    expect(addressInDistrict("충청북도 충주시 탄금대안길 105", "청주시")).toBe(false);
  });

  it("의료관광은 주소가 영어라 좌표가 가장 가까운 시군구로 거른다", () => {
    const medical = [
      { name: "청주 병원", address: "Cheongju-si", lat: 36.64, lng: 127.49, phone: "", contentId: "1" },
      { name: "충주 병원", address: "Chungju-si", lat: 36.99, lng: 127.93, phone: "", contentId: "2" },
    ];
    expect(nearestDistrict("충청북도", medical[0])).toBe("청주시");
    expect(nearestDistrict("충청북도", medical[1])).toBe("충주시");
    const layers = mapLayers({ spots: [], shelters: [], demand: null, pets: [], medical }, cheongjuArea);
    expect(layers.medical.map((m) => m.name)).toEqual(["청주 병원"]);
  });

  it("목록 제목의 범위 이름: 시군구 > 도 > 전국", () => {
    expect(areaLabel(cheongjuArea)).toBe("청주시");
    expect(areaLabel({ province: "충청북도", district: "all" })).toBe("충청북도");
    expect(areaLabel(NATIONWIDE)).toBe("전국");
  });
});
