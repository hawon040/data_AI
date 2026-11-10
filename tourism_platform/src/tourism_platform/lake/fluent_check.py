"""Fluent Bit 실행 결과 점검: 입력 로그와 출력 로그가 빠짐없이 같은지 확인한다.

    python -m tourism_platform.lake.fluent_check

Fluent Bit(tourapi/fluent-bit/fluent-bit.conf)을 한 번 돌린 뒤 실행한다. 두 흐름을 각각 비교한다.

    접근 로그   tourapi/logs/access.jsonl                          → tourapi/logs/fluent-out/access.jsonl
    호출 로그   tourism_platform/data/logs/api_calls.jsonl         → tourapi/logs/fluent-out/api_calls.jsonl

확인하는 것: 줄 수가 같은지, 출력의 모든 줄이 JSON인지, 입력의 각 기록이 출력에 그대로 있는지(없거나 더 있는 기록).
Fluent Bit은 파일 끝까지 읽은 뒤에도 잠시 기다리므로, 입력에 줄을 더 쓴 직후에는 몇 초 뒤에 실행한다.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
STREAMS = {
    "접근 로그": (REPO_ROOT / "tourapi" / "logs" / "access.jsonl",
                  REPO_ROOT / "tourapi" / "logs" / "fluent-out" / "access.jsonl"),
    "호출 로그": (REPO_ROOT / "tourism_platform" / "data" / "logs" / "api_calls.jsonl",
                  REPO_ROOT / "tourapi" / "logs" / "fluent-out" / "api_calls.jsonl"),
}


@dataclass(frozen=True)
class StreamCheck:
    name: str
    input_lines: int | None   # None이면 파일이 없다
    output_lines: int | None
    invalid_output_lines: int
    missing: int              # 입력에는 있는데 출력에 없는 기록 수
    extra: int                # 출력에만 있는 기록 수

    @property
    def ok(self) -> bool:
        return (self.input_lines is not None and self.output_lines is not None
                and self.input_lines == self.output_lines and not self.invalid_output_lines
                and not self.missing and not self.extra)


def _records(path: Path) -> tuple[Counter, int, int]:
    """(기록별 개수, 줄 수, JSON이 아닌 줄 수). 키 순서와 공백이 달라도 같은 기록으로 센다."""
    counts, lines, invalid = Counter(), 0, 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        lines += 1
        try:
            counts[json.dumps(json.loads(line), sort_keys=True, ensure_ascii=False)] += 1
        except json.JSONDecodeError:
            invalid += 1
    return counts, lines, invalid


def check_stream(name: str, input_path: Path, output_path: Path) -> StreamCheck:
    if not input_path.exists() or not output_path.exists():
        return StreamCheck(name, input_path.exists() and _records(input_path)[1] or None,
                           output_path.exists() and _records(output_path)[1] or None, 0, 0, 0)
    in_counts, in_lines, _ = _records(input_path)
    out_counts, out_lines, invalid = _records(output_path)
    return StreamCheck(name, in_lines, out_lines, invalid,
                       sum((in_counts - out_counts).values()), sum((out_counts - in_counts).values()))


def report(streams: dict[str, tuple[Path, Path]] = STREAMS) -> tuple[str, bool]:
    lines, all_ok = [], True
    for name, (input_path, output_path) in streams.items():
        result = check_stream(name, input_path, output_path)
        all_ok &= result.ok
        if result.input_lines is None or result.output_lines is None:
            missing_file = input_path if result.input_lines is None else output_path
            lines.append(f"[{name}] 파일이 없어 확인하지 못했습니다: {missing_file}")
            continue
        lines.append(
            f"[{name}] 입력 {result.input_lines}줄 · 출력 {result.output_lines}줄 · "
            f"출력에 없는 기록 {result.missing} · 출력에만 있는 기록 {result.extra} · JSON 아닌 줄 {result.invalid_output_lines} "
            f"→ {'일치' if result.ok else '불일치'}"
        )
    return "\n".join(lines), all_ok


if __name__ == "__main__":
    text, ok = report()
    print(text)
    sys.exit(0 if ok else 1)
