/**
 * 큐레이션 관광지를 실내/야외 분류용 CSV로 내보낸다 (Orange 분류 실습·정확도 비교용).
 *
 *   node --experimental-strip-types --no-warnings scripts/attraction_setting_cli.ts > ../tourism_platform/data/orange/attractions.csv
 *
 * 열: region, name, category, tags, rule_setting, rule_terrains, label
 *  - rule_setting·rule_terrains: 지금 서비스가 쓰는 키워드 규칙(src/lib/attractionSetting.ts classifyAttraction)의 판정
 *  - label: 사람이 정답을 적는 칸(indoor / outdoor). 비워 둔다.
 */
import { SAMPLE_REGIONS } from "../src/data/sampleRegions.ts";
import { classifyAttraction } from "../src/lib/attractionSetting.ts";

const csv = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const lines = ["region,name,category,tags,rule_setting,rule_terrains,label"];
for (const region of SAMPLE_REGIONS) {
  for (const attraction of region.attractions) {
    const { setting, terrains } = classifyAttraction(attraction);
    lines.push([
      region.name,
      attraction.name,
      attraction.category,
      attraction.tags.join("|"),
      setting,
      terrains.join("|"),
      "",
    ].map(csv).join(","));
  }
}
process.stdout.write(lines.join("\n") + "\n");
