"""사용자 맞춤 관광지 추천을 터미널에서 출력한다.

예)  python scripts/recommend.py --age "70대 이상" --companion "가족(고령 부모 동반)" --month 8
     python scripts/recommend.py --age 30대 --companion "가족(아동 동반)" --month 1 --time 야간 --sido 강원특별자치도

data/processed/ 에 실제 데이터가 있으면 실제 관광지를, 없으면 가상 샘플을 추천한다.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tourrec import config as C  # noqa: E402
from tourrec import sample_data  # noqa: E402
from tourrec.explain import explain, profile_summary  # noqa: E402
from tourrec.scoring import build_features, recommend, score  # noqa: E402


def load():
    for d, is_sample in [(ROOT / "data" / "processed", False), (ROOT / "data" / "sample", True)]:
        if any(d.glob("*.csv")):
            return sample_data.load(d), is_sample
    return sample_data.generate(), True


def main(argv=None):
    ap = argparse.ArgumentParser(description="관광지 안전 × 연령대 맞춤 추천")
    ap.add_argument("--age", required=True, choices=C.AGE_GROUPS)
    ap.add_argument("--companion", default="친구·연인", choices=C.COMPANIONS)
    ap.add_argument("--month", type=int, required=True, choices=C.MONTHS)
    ap.add_argument("--time", default="주간", choices=C.TIME_SLOTS)
    ap.add_argument("--sido", nargs="*", help="희망 시도(여러 개 가능)")
    ap.add_argument("--top", type=int, default=5)
    args = ap.parse_args(argv)

    tables, is_sample = load()
    fx = build_features(tables)
    s = score(fx, args.age, args.companion, args.month, args.time)
    rec = recommend(s, args.top, sido=args.sido)

    if is_sample:
        print("※ 가상 샘플 데이터입니다. 실제 관광지가 아닙니다 (data/processed/ 에 실제 데이터를 넣으세요).\n")
    print(profile_summary(args.age, args.companion, args.time))
    print(f"{args.month}월 · 전국 후보 {int(s['eligible'].sum())}곳 중 상위 {len(rec)}곳\n")
    for r in rec.itertuples():
        row = s.loc[r.Index]
        ex = explain(row, fx, s.attrs)
        print(f"{r.rank}. {r.title}  ({r.sido} {r.sigungu} · {r.category})  점수 {r.score*100:.1f}")
        for t in ex.reasons:
            print(f"   ✓ {t}")
        for t in ex.cautions:
            print(f"   ! {t}")
        for t in ex.notes:
            print(f"   · {t}")
        print()
    print("안전도는 공공 통계 기반 상대 비교이며 절대적인 안전을 보장하지 않습니다.")


if __name__ == "__main__":
    main()
