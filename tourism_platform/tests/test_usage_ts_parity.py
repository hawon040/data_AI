"""사용자 기록 보정 계산이 파이썬(usage/)과 웹앱(web/src/lib/usageAdjust.ts)에서 같은 값을 내는지 확인한다.

web/scripts/usage_cli.ts를 node --experimental-strip-types로 실행해 TS 결과를 받는다. node가 없으면 건너뛴다.
"""
import json
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from tourism_platform.usage import affinity, aggregate, events, region

CLI = Path(__file__).resolve().parents[2] / "web" / "scripts" / "usage_cli.ts"
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node가 없어 TS 비교를 건너뜀")


def run_cli(payload):
    done = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(CLI)],
                          input=json.dumps(payload), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


def random_case(rng):
    codes = [f"{40000 + i}" for i in range(rng.randint(2, 6))]
    priors, counts = {}, {}
    for code in codes:
        weights = [rng.random() + 0.05 for _ in events.GROUP_KEYS]
        total = sum(weights)
        priors[code] = {"shares": {g: w / total for g, w in zip(events.GROUP_KEYS, weights)},
                        "strength": rng.uniform(5, 300)}
        if rng.random() < 0.8:
            counts[code] = {g: rng.choice([0, 0, rng.randint(1, 400) * rng.choice([1, 0.5])]) for g in events.GROUP_KEYS}
    return {"counts": counts, "priors": priors, "region": rng.choice(codes), "group": rng.choice(events.GROUP_KEYS)}


def test_region_lq_matches_between_python_and_typescript():
    rng = random.Random(20261110)
    cases = [random_case(rng) for _ in range(200)]
    ts = run_cli({"lq": cases, "affinity": []})["lq"]
    for case, got in zip(cases, ts):
        priors = {r: aggregate.Prior(p["shares"], p["strength"]) for r, p in case["priors"].items()}
        shares = aggregate.blended_national_shares(case["counts"], priors)
        want = region.region_lq(case["counts"], shares, case["region"], case["group"], priors[case["region"]])
        assert got["lq"] == pytest.approx(want.lq, rel=1e-12)
        assert got["records"] == pytest.approx(want.records, rel=1e-12, abs=1e-12)
        assert got["reliability"] == pytest.approx(want.reliability, rel=1e-12, abs=1e-12)


def test_adjusted_affinity_matches_between_python_and_typescript():
    rng = random.Random(7)
    cases = []
    for _ in range(300):
        has = rng.random() < 0.85
        cases.append({
            "prior": rng.uniform(0.5, 1.5),
            "stat": {"n": rng.uniform(0, 80), "mean": rng.uniform(1, 5)} if has else None,
            "ageMean": {"n": rng.uniform(1, 800), "mean": rng.uniform(1.5, 5)} if rng.random() < 0.9 else None,
            "m": rng.choice([5.0, 10.0, 20.0]),
        })
    ts = run_cli({"lq": [], "affinity": cases})["affinity"]
    for case, got in zip(cases, ts):
        stat = affinity.RatingStat(**{"n_eff": case["stat"]["n"], "mean": case["stat"]["mean"]}) if case["stat"] else None
        age = affinity.RatingStat(case["ageMean"]["n"], case["ageMean"]["mean"]) if case["ageMean"] else None
        assert got == pytest.approx(affinity.adjusted_affinity(case["prior"], stat, age, case["m"]), rel=1e-12)
