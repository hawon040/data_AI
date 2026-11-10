/**
 * 사용자 기록 보정 계산(src/lib/usageAdjust.ts)을 파이썬 테스트에서 호출하기 위한 CLI.
 *
 *   node --experimental-strip-types --no-warnings scripts/usage_cli.ts < cases.json
 *
 * 입력(JSON, stdin): { lq: [{ counts, priors, region, group }], affinity: [{ prior, stat, ageMean, m }] }
 * 출력(JSON, stdout): { lq: [{ lq, records, reliability }], affinity: [number] }
 * 비교는 tourism_platform/tests/test_usage_ts_parity.py가 한다.
 */
import { adjustedAffinity, blendedNationalShares, regionLQ } from "../src/lib/usageAdjust.ts";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

const lq = input.lq.map((c: any) => {
  const groups = Object.keys(Object.values(c.priors)[0] ? (Object.values(c.priors)[0] as any).shares : {});
  const shares = blendedNationalShares(c.counts, c.priors, groups);
  return regionLQ(c.counts, shares, c.region, c.group, c.priors[c.region]);
});
const affinity = input.affinity.map((c: any) => adjustedAffinity(c.prior, c.stat ?? undefined, c.ageMean ?? undefined, c.m));

process.stdout.write(JSON.stringify({ lq, affinity }));
