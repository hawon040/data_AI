"""가상 샘플 데이터를 data/sample/ 에 CSV로 저장한다.  python scripts/make_sample.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tourrec import sample_data  # noqa: E402

if __name__ == "__main__":
    sample_data.save(sample_data.generate(), ROOT / "data" / "sample")
    print("saved →", ROOT / "data" / "sample")
