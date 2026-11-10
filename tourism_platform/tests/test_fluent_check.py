import json
from pathlib import Path

from tourism_platform.lake import fluent_check

CONF_DIR = Path(__file__).resolve().parents[2] / "tourapi" / "fluent-bit"


def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")


def test_identical_streams_match_even_if_key_order_differs(tmp_path):
    write(tmp_path / "in.jsonl", [{"a": 1, "b": "가"}, {"a": 2, "b": "나"}])
    (tmp_path / "out.jsonl").write_text('{"b":"가","a":1}\n{"b": "나", "a": 2}\n', encoding="utf-8")
    result = fluent_check.check_stream("t", tmp_path / "in.jsonl", tmp_path / "out.jsonl")
    assert result.ok and result.input_lines == result.output_lines == 2


def test_dropped_and_extra_records_are_reported(tmp_path):
    write(tmp_path / "in.jsonl", [{"a": 1}, {"a": 2}, {"a": 3}])
    write(tmp_path / "out.jsonl", [{"a": 1}, {"a": 9}])
    result = fluent_check.check_stream("t", tmp_path / "in.jsonl", tmp_path / "out.jsonl")
    assert (result.missing, result.extra, result.ok) == (2, 1, False)


def test_duplicate_lines_are_counted_separately(tmp_path):
    write(tmp_path / "in.jsonl", [{"a": 1}, {"a": 1}])
    write(tmp_path / "out.jsonl", [{"a": 1}])
    result = fluent_check.check_stream("t", tmp_path / "in.jsonl", tmp_path / "out.jsonl")
    assert result.missing == 1 and not result.ok


def test_invalid_json_in_output_is_reported(tmp_path):
    write(tmp_path / "in.jsonl", [{"a": 1}])
    (tmp_path / "out.jsonl").write_text('{"a": 1}\nnot json\n', encoding="utf-8")
    assert fluent_check.check_stream("t", tmp_path / "in.jsonl", tmp_path / "out.jsonl").invalid_output_lines == 1


def test_report_says_when_files_are_missing(tmp_path):
    text, ok = fluent_check.report({"호출 로그": (tmp_path / "a.jsonl", tmp_path / "b.jsonl")})
    assert not ok and "파일이 없어 확인하지 못했습니다" in text


# --- 설정 파일 정적 점검 (Fluent Bit 없이 할 수 있는 확인) ------------------------------

def parse_conf(path):
    sections, current = [], None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            current = {"_type": line.strip("[]").upper()}
            sections.append(current)
        elif current is not None:
            key, _, value = line.partition(" ")
            current[key.lower()] = value.strip()
    return sections


def test_every_input_tag_is_matched_by_exactly_one_output():
    sections = parse_conf(CONF_DIR / "fluent-bit.conf")
    inputs = [s for s in sections if s["_type"] == "INPUT"]
    outputs = [s for s in sections if s["_type"] == "OUTPUT"]
    assert len(inputs) == 2 and len(outputs) == 2

    def matches(pattern, tag):
        return tag == pattern or (pattern.endswith("*") and tag.startswith(pattern[:-1]))

    for item in inputs:
        hits = [o for o in outputs if matches(o["match"], item["tag"])]
        assert len(hits) == 1, f"{item['tag']}를 받는 출력이 {len(hits)}개다(섞이거나 사라진다)"
    assert len({o["file"] for o in outputs}) == len(outputs)  # 두 출력이 같은 파일에 쓰지 않는다


def test_inputs_use_separate_offset_databases_and_known_parsers():
    sections = parse_conf(CONF_DIR / "fluent-bit.conf")
    inputs = [s for s in sections if s["_type"] == "INPUT"]
    assert len({i["db"] for i in inputs}) == len(inputs)  # 읽은 위치 기록 파일이 입력마다 따로다
    parsers = {s["name"] for s in parse_conf(CONF_DIR / "parsers.conf") if s["_type"] == "PARSER"}
    assert {i["parser"] for i in inputs} <= parsers


def test_parser_time_formats_match_the_logs_the_app_writes():
    parsers = {s["name"]: s for s in parse_conf(CONF_DIR / "parsers.conf") if s["_type"] == "PARSER"}
    assert parsers["json_ts"]["time_key"] == "ts" and parsers["json_ts"]["time_format"] == "%Y-%m-%dT%H:%M:%S"
    assert parsers["json_iso"]["time_key"] == "time" and parsers["json_iso"]["time_format"] == "%Y-%m-%dT%H:%M:%S.%L%z"
