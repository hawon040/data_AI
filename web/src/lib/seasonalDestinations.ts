import type { Attraction } from "./types";
import type { Season } from "./tripPreferences";

export interface SeasonalDestination {
  id: string;
  season: Season;
  timing: string;
  location: string;
  title: string;
  summary: string;
  attraction: Attraction;
  image: string;
  imageAlt: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

function attraction(
  name: string,
  category: string,
  tags: Attraction["tags"],
  lat: number,
  lng: number,
): Attraction {
  return { name, category, tags, lat, lng, popularityScore: 0 };
}

export const SEASONAL_DESTINATIONS: Record<Season, SeasonalDestination[]> = {
  spring: [
    {
      id: "jinhae-cherry-blossom",
      season: "spring",
      timing: "진해 · 벚꽃철",
      location: "경상남도 창원시 진해구",
      title: "진해 벚꽃길",
      summary: "여좌천을 따라 이어지는 진해의 봄 벚꽃 산책 명소예요.",
      attraction: attraction("여좌천 로망스다리", "벚꽃·산책", ["nature", "view"], 35.156883, 128.659637),
      image: "/seasonal/jinhae-cherry-blossom.jpg",
      imageAlt: "벚꽃이 핀 진해의 거리",
      creator: "Alexey Komarov",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cherry_Blossom_in_Jinhae-2016-04-02-3.jpg",
    },
    {
      id: "jinhae-festival",
      season: "spring",
      timing: "진해 · 봄 축제",
      location: "경상남도 창원시 진해구",
      title: "진해 군항제",
      summary: "매년 봄 벚꽃 시기에 열리는 대표적인 진해 지역 축제예요. 올해 일정은 공식 안내를 확인해 주세요.",
      attraction: attraction("진해 군항제", "벚꽃·축제", ["culture", "nature"], 35.1521, 128.6598),
      image: "/seasonal/jinhae-festival.jpg",
      imageAlt: "2015년 진해 군항제 야외 공연",
      creator: "Wendy Wyman / U.S. Navy",
      license: "Public domain",
      licenseUrl: "https://commons.wikimedia.org/wiki/Commons:Licensing",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:53rd_annual_Jinhae_Cherry_Blossom_Festival_150402-N-JN652-406.jpg",
    },
  ],
  summer: [
    {
      id: "haeundae-beach",
      season: "summer",
      timing: "부산 · 여름 바다",
      location: "부산광역시 해운대구",
      title: "해운대해수욕장",
      summary: "부산을 대표하는 도심 해변이에요. 해수욕장 개장 기간과 안전 수칙은 부산시 공지를 확인하세요.",
      attraction: attraction("해운대해수욕장", "바다·해변", ["nature", "view"], 35.157781, 129.158132),
      image: "/seasonal/haeundae-beach.jpg",
      imageAlt: "부산 해운대해수욕장 전경",
      creator: "부산광역시",
      license: "공공누리 제1유형",
      licenseUrl: "http://www.kogl.or.kr/info/licenseType1.do",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Busan_City_Haeundae_Beach_KOGL_(01).jpg",
    },
    {
      id: "jeju-iho-beach",
      season: "summer",
      timing: "제주 · 여름 해안",
      location: "제주특별자치도 제주시",
      title: "제주 이호동 해안",
      summary: "제주시 가까이에서 바다 풍경을 즐길 수 있는 해안 지역이에요. 해변 시설·운영 정보는 방문 전 확인하세요.",
      attraction: attraction("이호테우해변", "바다·해변", ["nature", "view"], 33.497664, 126.452772),
      image: "/seasonal/jeju-iho-beach.jpg",
      imageAlt: "제주 제주시 이호동 해안",
      creator: "song songroov",
      license: "CC BY 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ihoil-dong,_Jeju-si,_Jeju-do,_South_Korea_-_panoramio_(1).jpg",
    },
  ],
  autumn: [
    {
      id: "naejangsan-cable-car",
      season: "autumn",
      timing: "정읍 · 단풍철",
      location: "전북특별자치도 정읍시",
      title: "내장산 단풍 케이블카",
      summary: "가을 단풍으로 유명한 내장산을 케이블카와 산책로에서 감상할 수 있어요. 운행 여부를 확인하고 방문하세요.",
      attraction: attraction("내장산 케이블카", "단풍·전망", ["nature", "view"], 35.5081, 126.8898),
      image: "/seasonal/naejangsan-autumn.jpg",
      imageAlt: "가을 단풍 사이를 지나는 내장산 케이블카",
      creator: "Jeongtaeyoung",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Naejangsan_Mountain_cable_car.jpg",
    },
    {
      id: "naejangsan-pavilion",
      season: "autumn",
      timing: "정읍 · 단풍 산책",
      location: "전북특별자치도 정읍시",
      title: "내장산 단풍길",
      summary: "붉게 물든 단풍과 내장산 정자를 둘러보는 가을 산책 코스예요.",
      attraction: attraction("내장산 단풍길", "단풍·산책", ["nature", "history"], 35.4958, 126.8875),
      image: "/seasonal/naejangsan-pavilion.jpg",
      imageAlt: "붉은 단풍에 둘러싸인 내장산 정자",
      creator: "Tung Thanh Dang",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Naejangsan_Pavilion_2.jpg",
    },
  ],
  winter: [
    {
      id: "taebaeksan-snow-festival",
      season: "winter",
      timing: "태백 · 겨울 축제",
      location: "강원특별자치도 태백시",
      title: "태백산 눈축제",
      summary: "태백산 설경과 눈 조각을 만나는 겨울 명소예요. 축제 일정과 산행 통제는 공식 공지를 확인하세요.",
      attraction: attraction("태백산 눈축제장", "눈축제·겨울 체험", ["culture", "nature"], 37.097, 128.921),
      image: "/seasonal/taebaeksan-snow-festival.jpg",
      imageAlt: "2019년 태백산 눈축제 현장",
      creator: "칼빈500",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:태백산_눈축제(AMJ).jpg",
    },
    {
      id: "taebaeksan-winter",
      season: "winter",
      timing: "태백 · 설경",
      location: "강원특별자치도 태백시",
      title: "눈 덮인 태백산",
      summary: "눈 덮인 태백산 풍경을 즐기는 겨울 여행지예요. 기상·등산로 통제와 방한 준비를 확인하세요.",
      attraction: attraction("태백산 겨울 산행", "설경·산행", ["nature", "activity"], 37.097, 128.921),
      image: "/seasonal/taebaeksan-mountain.jpg",
      imageAlt: "눈 덮인 태백산 눈축제 풍경",
      creator: "칼빈500",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:태백산눈2019(AMJ).jpg",
    },
  ],
};
