import pytest

from tourism_platform.validation import setting_compare as sc

HEADER = "region,name,category,tags,rule_setting,rule_terrains,label\n"


def _labeled(tmp_path, rows):
    path = tmp_path / "a.csv"
    path.write_text(HEADER + "\n".join(rows) + "\n", encoding="utf-8")
    return path


def test_only_labeled_rows_are_compared(tmp_path):
    path = _labeled(tmp_path, ["천안,가,박물관,culture,indoor,,indoor", "천안,나,공원,nature,outdoor,,", "천안,다,카페,cafe,indoor,,Outdoor"])
    df = sc.load_labeled(path)
    assert list(df["name"]) == ["가", "다"]  # 라벨이 빈 행은 뺀다, 대소문자는 맞춘다


def test_invalid_label_is_rejected(tmp_path):
    with pytest.raises(ValueError, match="indoor 또는 outdoor"):
        sc.load_labeled(_labeled(tmp_path, ["천안,가,x,y,indoor,,실내"]))


def test_accuracy_and_confusion_matrix(tmp_path):
    df = sc.load_labeled(_labeled(tmp_path, [
        "천안,가,x,y,indoor,,indoor", "천안,나,x,y,indoor,,outdoor", "천안,다,x,y,outdoor,,outdoor", "천안,라,x,y,outdoor,,outdoor"]))
    result = sc.evaluate(df, "rule_setting")
    assert (result["n"], result["correct"], result["accuracy_pct"]) == (4, 3, 75.0)
    assert result["confusion"].loc["outdoor", "indoor"] == 1  # 정답은 야외인데 규칙이 실내로 본 1곳
    assert list(result["wrong"]["name"]) == ["나"]


def test_orange_predictions_are_merged_by_region_and_name(tmp_path):
    labeled = _labeled(tmp_path, ["천안,가,x,y,indoor,,indoor", "천안,나,x,y,indoor,,outdoor"])
    orange = tmp_path / "o.csv"
    orange.write_text("region,name,Logistic Regression\n천안,가,indoor\n천안,나,outdoor\n", encoding="utf-8")
    df = sc.merge_orange(sc.load_labeled(labeled), orange, "Logistic Regression")
    assert sc.evaluate(df, "orange")["accuracy_pct"] == 100.0


def test_missing_orange_column_explains_what_exists(tmp_path):
    labeled = _labeled(tmp_path, ["천안,가,x,y,indoor,,indoor"])
    orange = tmp_path / "o.csv"
    orange.write_text("region,name,other\n천안,가,indoor\n", encoding="utf-8")
    with pytest.raises(ValueError, match="있는 열"):
        sc.merge_orange(sc.load_labeled(labeled), orange, "Logistic Regression")


def test_report_asks_for_labels_when_none_written():
    assert "label 칸이 비어 있습니다" in sc.report(sc.DEFAULT_LABELED)
