"""설정된 data.go.kr 데이터셋을 전부 실제로 호출해 data/live/에 저장한다.

    python -m tourism_platform.data.fetch_live

datasets.py에 endpoint/operation이 아직 안 채워진 항목은 건너뛰고 "미설정"으로
표시한다 — 키를 일부만 발급받은 상태에서도 설정된 것만 돌아가게 하기 위해서다.
API 오류(호출은 됐지만 실패)와 미설정(애초에 호출 안 함)을 구분해 둬야, 뭐가
문제인지(신청이 덜 됐는지 vs 요청이 잘못됐는지) 바로 알 수 있다.
"""
from __future__ import annotations

import json
from pathlib import Path

from . import datagokr_client
from .datagokr_client import DatasetNotConfiguredError, ServiceKeyMissingError
from .datasets import DATASETS

LIVE_DIR = Path(__file__).resolve().parents[3] / "data" / "live"


def fetch_all(live_dir: Path = LIVE_DIR) -> dict[str, str]:
    """모든 데이터셋을 시도하고 {데이터셋key: 결과상태} 를 반환한다."""
    live_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, str] = {}

    for key, config in DATASETS.items():
        try:
            data = datagokr_client.fetch(config)
        except DatasetNotConfiguredError:
            results[key] = "미설정 (endpoint/operation 비어 있음)"
            continue
        except ServiceKeyMissingError:
            results[key] = "서비스키 없음 (DATA_GO_KR_SERVICE_KEY 미설정)"
            continue
        except Exception as e:  # noqa: BLE001 — 어떤 API 오류든 이 데이터셋만 실패 처리하고 계속 진행
            results[key] = f"실패: {e}"
            continue

        out_path = live_dir / f"{key}.json"
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        results[key] = f"성공 -> {out_path}"

    return results


def main() -> None:
    results = fetch_all()
    print("=== data.go.kr 실시간 연동 결과 ===")
    for key, status in results.items():
        print(f"{key}: {status}")

    configured = sum(1 for s in results.values() if s.startswith("성공") or s.startswith("실패"))
    print(f"\n{configured}/{len(results)}개 데이터셋이 설정됨 (나머지는 datasets.py에서 endpoint/operation 채우기 필요)")


if __name__ == "__main__":
    main()
