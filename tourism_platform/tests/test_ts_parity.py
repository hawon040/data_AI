"""파이썬 지수(tourism_platform.indices)와 웹앱 지수(web/src/lib/indices.ts)가 같은 값을 내는지 비교한다.

web/scripts/indices_cli.ts를 node --experimental-strip-types로 실행해 TS 결과를 받는다.
node가 없으면 건너뛴다.
"""
import json
import math
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from tourism_platform.indices import group_score, location_quotient, specialization_score

WEB_DIR = Path(__file__).resolve().parents[2] / "web"
CLI = WEB_DIR / "scripts" / "indices_cli.ts"
REL_TOL = 1e-12

GROUPS = [f"{g}_{a}" for a in ("10s", "20s", "30s", "40s", "50s", "60plus") for g in ("M", "F")]
COMPANION_SETS = [
    ["F_20s"],
    ["M_60plus"],
    ["F_20s", "M_20s"],
    ["F_30s", "M_30s", "F_10s"],
    ["M_50s", "F_50s", "M_60plus", "F_60plus"],
    ["F_20s", "M_60plus"],
    GROUPS,
]

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node가 없어 TS 비교를 건너뜀")


def random_cases(n: int = 200, seed: int = 20261105) -> list[dict]:
    rng = random.Random(seed)
    cases = []
    for _ in range(n):
        v_i = rng.choice([rng.randint(1, 100), rng.randint(100, 100_000), rng.randint(100_000, 50_000_000)])
        cases.append({
            "vIg": rng.randint(0, v_i),
            "vI": v_i,
            "sG": rng.uniform(1e-4, 0.5),
            "k": rng.choice([0, 1, 50, 1000, rng.uniform(0, 500)]),
            "lqValues": [rng.uniform(0.01, 5.0) for _ in range(rng.randint(1, 6))],
        })
    return cases


def run_ts(cases: list[dict]) -> dict:
    proc = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", str(CLI)],
        input=json.dumps({"cases": cases, "companionSets": COMPANION_SETS}),
        capture_output=True, text=True, encoding="utf-8", cwd=WEB_DIR, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


@pytest.fixture(scope="module")
def ts_result():
    cases = random_cases()
    return cases, run_ts(cases)


def test_random_200_cases_match(ts_result):
    cases, out = ts_result
    assert len(out["cases"]) == 200
    for case, ts in zip(cases, out["cases"]):
        lq = location_quotient(case["vIg"], case["vI"], case["sG"], case["k"])
        assert ts["lq"] == pytest.approx(lq, rel=REL_TOL), case
        assert ts["spec"] == pytest.approx(specialization_score(lq, case["vI"]), rel=REL_TOL, abs=1e-12), case
        assert ts["group"] == pytest.approx(group_score(case["lqValues"], case["vI"]), rel=REL_TOL, abs=1e-12), case


def test_sample_10_regions_match(ts_result):
    _, out = ts_result
    regions = out["samples"]["regions"]
    assert len(regions) == 10

    # 전국 집단 비중 s_g를 파이썬에서 따로 계산한다.
    totals = {g: sum(r["groupVisitors"][g] for r in regions) for g in GROUPS}
    grand = sum(totals.values())
    shares = {g: totals[g] / grand for g in GROUPS}
    for g in GROUPS:
        assert out["samples"]["shares"][g] == pytest.approx(shares[g], rel=REL_TOL)

    for r in regions:
        assert r["totalVisitors"] == sum(r["groupVisitors"].values())
        lq = {g: location_quotient(r["groupVisitors"][g], r["totalVisitors"], shares[g]) for g in GROUPS}
        for g in GROUPS:
            assert r["lq"][g] == pytest.approx(lq[g], rel=REL_TOL), (r["name"], g)
            assert r["spec"][g] == pytest.approx(specialization_score(lq[g], r["totalVisitors"]), rel=REL_TOL), (r["name"], g)
        for companion_set, ts_group in zip(COMPANION_SETS, r["group"]):
            py_group = group_score([lq[g] for g in companion_set], r["totalVisitors"])
            assert ts_group == pytest.approx(py_group, rel=REL_TOL), (r["name"], companion_set)


def test_group_score_uses_minimum_not_mean(ts_result):
    # 수식 성질 확인: 동행자 점수 = 최솟값 LQ × log(V_i) ≤ 각 개인 특화점수
    _, out = ts_result
    for r in out["samples"]["regions"]:
        for companion_set, ts_group in zip(COMPANION_SETS, r["group"]):
            assert ts_group <= min(r["spec"][g] for g in companion_set) + 1e-12
            assert ts_group == pytest.approx(min(r["lq"][g] for g in companion_set) * math.log(r["totalVisitors"]))


EDGE_CASES = [
    {"vIg": 0, "vI": 0, "sG": 0.1, "k": 0, "lqValues": [1.0]},      # V_i + k = 0
    {"vIg": 5, "vI": 10, "sG": 0.0, "k": 50, "lqValues": [1.0]},    # s_g = 0
    {"vIg": 0, "vI": 0, "sG": 0.1, "k": 50, "lqValues": [1.0]},     # V_i = 0 (LQ는 되지만 log(0)은 안 됨)
    {"vIg": 1, "vI": 5, "sG": 0.1, "k": 1, "lqValues": []},         # 동행자 없음
]


def _py_or_error(fn):
    try:
        return fn()
    except ValueError:
        return "error"


def test_edge_cases_fail_the_same_way():
    out = run_ts(EDGE_CASES)
    for case, ts in zip(EDGE_CASES, out["cases"]):
        py = {
            "lq": _py_or_error(lambda: location_quotient(case["vIg"], case["vI"], case["sG"], case["k"])),
            "spec": _py_or_error(lambda: specialization_score(
                location_quotient(case["vIg"], case["vI"], case["sG"], case["k"]), case["vI"])),
            "group": _py_or_error(lambda: group_score(case["lqValues"], case["vI"])),
        }
        for key in ("lq", "spec", "group"):
            ts_value = "error" if isinstance(ts[key], dict) else ts[key]
            if py[key] == "error":
                assert ts_value == "error", (case, key, ts[key])
            else:
                assert ts_value == pytest.approx(py[key]), (case, key)
