/**
 * 웹앱 지수 계산(src/lib/indices.ts)을 파이썬 테스트에서 호출하기 위한 CLI.
 *
 *   node --experimental-strip-types scripts/indices_cli.ts < cases.json
 *
 * 입력(JSON, stdin): { cases: [{ vIg, vI, sG, k, lqValues }], companionSets: [["F_20s", "M_60plus"], ...] }
 * 출력(JSON, stdout): { cases: [{ lq, spec, group } | { error }], samples: {...} }
 * samples에는 샘플 10개 지역(src/data/sampleRegions.ts)의 원자료와 웹앱이 계산한 값이 들어 있다.
 * 비교는 tourism_platform/tests/test_ts_parity.py가 한다.
 */
import { SAMPLE_REGIONS } from "../src/data/sampleRegions.ts";
import { groupScore, locationQuotient, nationalShares, specializationScore } from "../src/lib/indices.ts";

interface Case {
  vIg: number;
  vI: number;
  sG: number;
  k: number;
  lqValues: number[];
}

function run<T>(fn: () => T): T | { error: string } {
  try {
    return fn();
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { cases: Case[]; companionSets: string[][] };

const cases = input.cases.map((c) => ({
  lq: run(() => locationQuotient(c.vIg, c.vI, c.sG, c.k)),
  spec: run(() => specializationScore(locationQuotient(c.vIg, c.vI, c.sG, c.k), c.vI)),
  group: run(() => groupScore(c.lqValues, c.vI)),
}));

const shares = nationalShares(SAMPLE_REGIONS);
const samples = {
  shares,
  regions: SAMPLE_REGIONS.map((region) => {
    const lq = Object.fromEntries(
      Object.entries(region.groupVisitors).map(([g, v]) => [g, locationQuotient(v, region.totalVisitors, shares[g as keyof typeof shares])]),
    );
    return {
      code: region.code,
      name: region.name,
      totalVisitors: region.totalVisitors,
      groupVisitors: region.groupVisitors,
      lq,
      spec: Object.fromEntries(Object.entries(lq).map(([g, v]) => [g, specializationScore(v, region.totalVisitors)])),
      group: input.companionSets.map((set) => groupScore(set.map((g) => lq[g]), region.totalVisitors)),
    };
  }),
};

process.stdout.write(JSON.stringify({ cases, samples }));
