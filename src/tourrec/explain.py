"""계산값을 근거로 사용자 맞춤 추천 이유와 주의 정보를 문장으로 만든다.

문장은 모두 점수 계산에 실제로 쓰인 값(백분위, LQ, 하위지표 원값, 감점 기여)에서만
만든다. 계산에 없는 정보(리뷰, 감성 등)로 이유를 지어내지 않는다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from . import config as C
from .scoring import Features, profile_multipliers

OLDER = {"60대", "70대 이상"}

# 하위지표별 주의 문장. raw 는 원값, n 은 반경 내 다발지역 수.
CAUTION_TEXT = {
    "heat": "{m}월 폭염일 비율 {pct:.0f}% — 한낮(12~17시) 야외 활동은 줄이고 물과 그늘을 챙기세요",
    "rain": "{m}월 호우일 비율 {pct:.0f}% — 출발 전 기상특보를 확인하고 계곡·하천 주변은 피하세요",
    "cold": "{m}월 한파일 비율 {pct:.0f}% — 방한 준비와 빙판길 낙상에 주의하세요",
    "snow": "{m}월 대설일 비율 {pct:.0f}% — 도로 통제·결빙 가능성이 있어 대중교통을 권해요",
    "crime_rate": "시군구 5대 범죄율이 전국 상위권 — 늦은 시간 이동과 소지품 관리에 신경 쓰세요",
    "traffic_spot": "반경 500m 안에 교통사고 다발지역 {n}곳 — 진입로·횡단보도에서 주의하세요",
    "traffic_area": "시군구 전체의 교통사고 위험이 높은 편이에요 — 운전 시 감속하세요",
    "traffic_child": "반경 500m 안에 어린이 보행사고 다발지역 {n}곳 — 아이 손을 꼭 잡고 이동하세요",
    "traffic_elder": "반경 500m 안에 노인 보행사고 다발지역 {n}곳 — 신호를 넉넉히 두고 건너세요",
}
SHORT = {"crime_rate": "범죄", "traffic_spot": "주변 교통사고", "traffic_area": "지역 교통사고",
         "traffic_child": "어린이 보행사고", "traffic_elder": "노인 보행사고",
         "heat": "폭염", "rain": "호우", "cold": "한파", "snow": "대설"}


@dataclass
class Explanation:
    reasons: list[str] = field(default_factory=list)
    cautions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _top_pct(q: float) -> str:
    return f"상위 {max(1, round((1 - q) * 100))}%"


def explain(row: pd.Series, fx: Features, scored_attrs: dict, risk_threshold: float = 0.5,
            max_cautions: int = 3) -> Explanation:
    """추천 1건의 이유·주의를 만든다.

    - 이유: 세 항 중 백분위가 높은 것 (S, F′ 는 0.7 이상, P′ 는 0.7 이상이면 '인기',
      0.3 이하이면 '한적함'), LQ 는 1.1 이상일 때만 연령 이유로 쓴다.
    - 주의: 정규화 위험 r ≥ 0.5 이고 가중치가 0보다 큰 하위지표를 감점 기여가 큰 순으로.
    """
    age, month = scored_attrs["age"], scored_attrs["month"]
    w = scored_attrs["weights"]
    a = fx.attractions.set_index("content_id").loc[row["content_id"]]
    ex = Explanation()

    if row["q_S"] >= 0.7:
        ex.reasons.append(f"같은 조건의 전국 후보 중 안전도 {_top_pct(row['q_S'])} (안전도 {row['S']*100:.0f}점)")
    if pd.notna(row["LQ"]) and row["LQ"] >= 1.1:
        ex.reasons.append(f"{age} 방문 비중이 전국 평균의 {row['LQ']:.2f}배인 지역 — 비슷한 연령대가 많이 찾아요")
    if row["q_P"] >= 0.7:
        ex.reasons.append(f"외지인·외국인 방문이 많은 지역 (방문자 수 전국 {_top_pct(row['q_P'])})")
    elif row["q_P"] <= 0.3:
        ex.reasons.append("방문객이 적은 편이라 비교적 한적해요")
    if not ex.reasons:
        ex.reasons.append("안전·연령 적합·인기 세 항목이 고르게 평균 이상이에요")

    cand = []
    for k, wk in w.items():
        if wk <= 0:
            continue
        if k in ("heat", "rain", "cold", "snow"):
            if pd.isna(a["stn_id"]):
                continue
            r = fx.weather.loc[(a["stn_id"], month), k]
            raw = fx.weather.loc[(a["stn_id"], month), f"raw_{k}"]
        else:
            r, raw = a[f"r_{k}"], a[f"raw_{k}"]
        if pd.notna(r) and r >= risk_threshold:
            cand.append((row[f"risk_{k}"], k, raw))
    for _, k, raw in sorted(cand, reverse=True)[:max_cautions]:
        n = {"traffic_spot": a["n_spot"], "traffic_child": a["n_spot_child"],
             "traffic_elder": a["n_spot_elder"]}.get(k, 0)
        text = CAUTION_TEXT[k].format(m=month, pct=(raw or 0) * 100, n=int(n))
        if k == "heat" and age in OLDER:
            text += " (고령층은 온열질환 위험이 커요)"
        ex.cautions.append(text)
    if row["crowd_flag"]:
        ex.cautions.append(f"{month}월 방문자가 연평균의 {row['crowd']:.2f}배 — 붐빌 수 있어 이른 시간 방문을 권해요")
    if row["safety_flag"]:
        ex.cautions.insert(0, "이 프로필 기준 전국 안전도 하위 10% — 아래 주의 사항을 꼭 확인하세요")

    if row["fit_missing"]:
        ex.notes.append("이 지역은 연령 비중 자료가 없어 연령 적합도를 중립(50점)으로 계산했어요")
    if pd.isna(a["stn_id"]):
        ex.notes.append("50km 안에 기상 관측소가 없어 날씨는 전국 중앙값으로 계산했어요")
    if row["coverage"] < 0.999:
        ex.notes.append(f"안전 지표 중 {row['coverage']*100:.0f}%만 실제 자료로 계산했어요")
    return ex


def profile_summary(age: str, companion: str, time_slot: str) -> str:
    """이 프로필에 적용된 배수 m_k(연령·동반 최댓값 × 시간대)를 한 문장으로.

    재정규화 전의 배수를 보여 준다. 재정규화 후 가중치 비율은 다른 지표가 함께
    커지면 1보다 작아질 수 있어(예: 야간 범죄 ×1.5 인데 어린이 지표가 새로 켜지면 희석),
    사용자에게는 '무엇을 얼마나 더 조심하도록 계산했는지'를 그대로 보여 주는 편이 정확하다.
    """
    m = profile_multipliers(age, companion, time_slot)
    up = sorted(((v, k) for k, v in m.items()
                 if (k in C.INACTIVE_BY_DEFAULT and v > 0) or (k not in C.INACTIVE_BY_DEFAULT and v > 1.0)),
                reverse=True)
    down = [k for k, v in m.items() if k not in C.INACTIVE_BY_DEFAULT and v < 1.0]
    head = f"{age} · {companion} · {time_slot}"
    if not up and not down:
        return f"{head}: 치안·교통·날씨를 같은 비중(각 1/3)으로 반영했어요."
    parts = [f"{SHORT[k]} {'반영' if k in C.INACTIVE_BY_DEFAULT and v <= 1 else f'×{v:.1f}'}" for v, k in up]
    text = f"{head} — 더 크게 반영한 위험: " + ", ".join(parts)
    if down:
        text += " / 낮춰 반영: " + ", ".join(SHORT[k] for k in down)
    return text
