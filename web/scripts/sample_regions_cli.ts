/**
 * 샘플 지역 데이터(src/data/sampleRegions.ts)를 JSON으로 내보낸다 — 파이썬 검증 스크립트용.
 *   node --experimental-strip-types scripts/sample_regions_cli.ts
 */
import { SAMPLE_REGIONS } from "../src/data/sampleRegions.ts";

process.stdout.write(
  JSON.stringify(
    SAMPLE_REGIONS.map(({ code, name, province, totalVisitors, safety }) => ({ code, name, province, totalVisitors, safety })),
  ),
);
