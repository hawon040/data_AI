"""관광지 안전 × 연령대 맞춤 추천 대시보드 (Streamlit MVP).

실행:  streamlit run app/streamlit_app.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tourrec import config as C  # noqa: E402
from tourrec import sample_data  # noqa: E402
from tourrec import validation as V  # noqa: E402
from tourrec.scoring import (build_features, effective_weights, profile_weights,  # noqa: E402
                             recommend, score)

# 차트 색: dataviz 기준 팔레트(검증 통과 조합). 색은 '항목'을 따라가며 순위로 바뀌지 않는다.
COL = {"S": "#2a78d6", "F": "#eb6834", "P": "#1baf7a",          # 최종 점수 3항
       "치안": "#4a3aa7", "교통": "#eda100", "날씨": "#e87ba4"}  # 안전도 3요인
CRITICAL = "#d03b3b"
LABEL = {"S": "안전도 S", "F": "연령 적합도 F′", "P": "인기도 P′"}
SUB_LABEL = {k: v[3] for k, v in C.SUBINDICATORS.items()}
SUB_SHORT = {"crime_rate": "범죄율", "traffic_spot": "주변 사고다발", "traffic_area": "시군구 사고",
             "traffic_child": "보행어린이 사고", "traffic_elder": "보행노인 사고",
             "heat": "폭염일", "rain": "호우일", "cold": "한파일", "snow": "대설일"}

st.set_page_config(page_title="관광지 안전 추천", layout="wide")


# ---------------------------------------------------------------------------
# 데이터
# ---------------------------------------------------------------------------
@st.cache_data
def load_tables():
    processed = ROOT / "data" / "processed"
    if processed.exists() and any(processed.glob("*.csv")):
        return sample_data.load(processed), False
    sample = ROOT / "data" / "sample"
    if sample.exists() and any(sample.glob("*.csv")):
        return sample_data.load(sample), True
    return sample_data.generate(), True


@st.cache_resource
def features():
    tables, is_sample = load_tables()
    return build_features(tables), tables, is_sample


def base_layout(fig, height=360, **kw):
    fig.update_layout(height=height, margin=dict(l=8, r=8, t=40, b=8), paper_bgcolor="rgba(0,0,0,0)",
                      plot_bgcolor="rgba(0,0,0,0)",
                      legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0, traceorder="normal"),
                      bargap=0.35, font=dict(size=13), **kw)
    fig.update_xaxes(showgrid=True, gridwidth=1, gridcolor="rgba(128,128,128,0.18)", zeroline=False)
    fig.update_yaxes(showgrid=False, zeroline=False)
    return fig


fx, tables, is_sample = features()

# ---------------------------------------------------------------------------
# 사이드바 — 사용자 입력(최소 수집) + 가중치
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("여행자 정보")
    age = st.selectbox("연령대", C.AGE_GROUPS, index=1, key="age")
    comp = st.selectbox("동반 유형", C.COMPANIONS, index=1, key="comp")
    month = st.select_slider("여행 월", C.MONTHS, value=8, format_func=lambda m: f"{m}월", key="month")
    slot = st.radio("주 이용 시간대", C.TIME_SLOTS, horizontal=True, key="slot")
    sidos = sorted(fx.attractions["sido"].dropna().unique())
    region = st.multiselect("희망 지역(선택)", sidos, key="region", placeholder="전체 지역")

    st.header("점수 가중치")
    a = st.slider("α 안전도", 0.0, 1.0, C.DEFAULT_ALPHA, 0.05, key="alpha")
    b = st.slider("β 연령 적합도", 0.0, 1.0, C.DEFAULT_BETA, 0.05, key="beta")
    g = st.slider("γ 인기도", 0.0, 1.0, C.DEFAULT_GAMMA, 0.05, key="gamma")
    if a + b + g == 0:
        st.error("세 가중치가 모두 0이면 점수를 계산할 수 없어요. 하나 이상 올려 주세요.")
        st.stop()
    st.caption(f"합이 1이 되도록 자동 환산: α {a/(a+b+g):.2f} · β {b/(a+b+g):.2f} · γ {g/(a+b+g):.2f}")
    combine = st.radio("결합 방식", ["rank", "value"], horizontal=True, key="combine",
                       format_func={"rank": "백분위 (기본)", "value": "원값"}.get,
                       help="백분위: 세 항을 전국 백분위로 맞춘 뒤 더해 명목 가중치 ≈ 실효 가중치가 되게 합니다. "
                            "원값: S·F′·P′를 그대로 더합니다(값 폭이 넓은 항이 순위를 좌우).")

    st.header("목록 옵션")
    top_n = st.slider("추천 개수", 5, 20, C.DEFAULT_TOP_N, key="topn")
    cap = st.slider("시군구당 최대", 1, 5, C.MAX_PER_SGG, key="cap")
    show_flag = st.checkbox("안전 주의(하위 10%) 관광지도 포함", key="flag")

scored = score(fx, age, comp, month, slot, a, b, g, combine=combine)
rec = recommend(scored, top_n, sido=region or None, include_flagged=show_flag, max_per_sgg=cap)
eff = effective_weights(scored)

# ---------------------------------------------------------------------------
# 머리말
# ---------------------------------------------------------------------------
st.title("관광지 안전 × 연령대 맞춤 추천")
st.caption("빅데이터와 AI · 2조 PBL — 안전도는 공공 통계 기반 상대 비교이며 절대적인 안전을 보장하지 않습니다.")
if is_sample:
    st.info("지금은 **가상 샘플 데이터**로 동작 중이에요. 지역명·수치는 실제가 아니며, 4주차 본수집 후 "
            "`data/processed/`에 같은 형식의 CSV를 넣으면 실제 데이터로 바뀝니다.")

m1, m2, m3, m4 = st.columns(4)
m1.metric("추천 후보", f"{int(scored['eligible'].sum())}곳", help="좌표·유형 조건과 커버리지 60% 이상을 통과한 관광지")
m2.metric("안전 게이트 기준", f"S < {scored.attrs['gate']*100:.1f}",
          help="이 프로필 기준 전국 하위 10% 안전도. 기본 목록에서 제외됩니다.")
m3.metric("1위 점수", f"{rec['score'].iloc[0]*100:.1f}" if len(rec) else "—")
m4.metric("1위 안전도", f"{rec['S'].iloc[0]*100:.1f}" if len(rec) else "—")
at = scored.attrs
st.caption(f"**실효 가중치** 안전 {eff['S']:.2f} · 적합 {eff['F']:.2f} · 인기 {eff['P']:.2f} "
           f"(명목 {at['alpha']:.2f} · {at['beta']:.2f} · {at['gamma']:.2f}) — 최종 점수 분산 중 각 항이 설명하는 몫입니다. "
           "명목보다 작거나 음수이면 그 항이 다른 항과 반대 방향으로 움직여(예: 인기 지역일수록 안전도 낮음) 효과가 상쇄된다는 뜻이에요.")

tab_rec, tab_why, tab_map, tab_val, tab_doc = st.tabs(["추천 결과", "점수 분해", "지도", "민감도·검증", "계산 방식"])

# ---------------------------------------------------------------------------
# 추천 결과
# ---------------------------------------------------------------------------
with tab_rec:
    if rec.empty:
        st.warning("조건에 맞는 관광지가 없어요. 희망 지역을 넓히거나 '안전 주의 포함'을 켜 보세요.")
    else:
        names = [f"{r.rank}. {r.title}" for r in rec.itertuples()]
        fig = go.Figure()
        for x in ["S", "F", "P"]:
            fig.add_bar(y=names, x=rec[f"c_{x}"] * 100, name=LABEL[x], orientation="h",
                        marker=dict(color=COL[x], line=dict(width=0)),
                        hovertemplate="%{y}<br>" + LABEL[x] + " 기여 %{x:.1f}점<extra></extra>")
        st.markdown("**" + ("최종 점수 = α·백분위(S) + β·백분위(F′) + γ·백분위(P′)" if combine == "rank"
                            else "최종 점수 = α·S + β·F′ + γ·P′") + "** · 100점 환산")
        fig.update_layout(barmode="stack")
        fig.update_yaxes(autorange="reversed")
        st.plotly_chart(base_layout(fig, 40 + 34 * len(rec)), width="stretch")

        def notes(r):
            out = []
            if r.safety_flag:
                out.append("⚠ 안전 주의")
            if r.crowd_flag:
                out.append("혼잡(성수기)")
            if r.fit_missing:
                out.append("연령 자료 없음")
            if r.coverage < 1:
                out.append(f"정보 {r.coverage*100:.0f}%")
            return " · ".join(out)

        table = pd.DataFrame({
            "순위": rec["rank"], "관광지": rec["title"], "지역": rec["sido"] + " " + rec["sigungu"],
            "유형": rec["category"], "점수": (rec["score"] * 100).round(1),
            "안전도 S": (rec["S"] * 100).round(1), "적합도 F′": (rec["F"] * 100).round(1),
            "LQ": rec["LQ"].round(2), "인기도 P′": (rec["P"] * 100).round(1),
            "참고": [notes(r) for r in rec.itertuples()],
        })
        st.dataframe(table, hide_index=True, width="stretch")
        st.caption("LQ(입지계수) > 1 이면 이 연령대가 전국 평균보다 상대적으로 많이 찾는 지역입니다.")

# ---------------------------------------------------------------------------
# 점수 분해
# ---------------------------------------------------------------------------
with tab_why:
    pool = rec if not rec.empty else scored.head(20)
    pick = st.selectbox("관광지 선택", pool["content_id"],
                        format_func=lambda c: pool.set_index("content_id").loc[c, "title"], key="pick")
    row = scored.set_index("content_id").loc[pick]
    w = scored.attrs["weights"]
    c1, c2 = st.columns([3, 2])
    with c1:
        keys = [k for k in w if w[k] > 0]
        fig = go.Figure()
        for f in ["치안", "교통", "날씨"]:
            ks = [k for k in keys if C.SUBINDICATORS[k][0] == f]
            fig.add_bar(y=[SUB_SHORT[k] for k in ks], x=[row[f"risk_{k}"] * 100 for k in ks], name=f,
                        orientation="h", marker=dict(color=COL[f]),
                        hovertemplate="%{y}: 감점 %{x:.2f}점<extra>" + f + "</extra>")
        st.markdown(f"**안전도 {row['S']*100:.1f}점 = 100 − 감점 합 {(1-row['S'])*100:.1f}점**")
        fig.update_yaxes(autorange="reversed")
        st.plotly_chart(base_layout(fig, 60 + 34 * len(keys)), width="stretch")
    with c2:
        st.markdown(f"**{row['title']}** · {row['sido']} {row['sigungu']}")
        st.markdown(f"- 최종 점수 **{row['score']*100:.1f}** = 안전 {row['c_S']*100:.1f} + 적합 "
                    f"{row['c_F']*100:.1f} + 인기 {row['c_P']*100:.1f}")
        st.markdown(f"- 연령 적합: LQ {row['LQ']:.2f} → F′ {row['F']*100:.1f}" if pd.notna(row["LQ"])
                    else "- 연령 적합: 자료 없음 → 중립값 50")
        st.markdown(f"- 최근접 관측소 {row['stn_km']:.1f}km" + (" (50km 초과 → 날씨는 전국 중앙값으로 대체)"
                                                          if pd.isna(row["stn_id"]) else ""))
        if row["crowd_flag"]:
            st.markdown(f"- {month}월 방문자가 연평균의 {row['crowd']:.2f}배 → 혼잡 주의")

    a_row = fx.attractions.set_index("content_id").loc[pick]
    wrow = fx.weather.reindex([(a_row["stn_id"], month)])
    detail = []
    for k in keys:
        if k in ["heat", "rain", "cold", "snow"]:
            raw = wrow[f"raw_{k}"].iloc[0] if pd.notna(a_row["stn_id"]) else None
            norm = wrow[k].iloc[0] if pd.notna(a_row["stn_id"]) else None
            raw = f"{raw*100:.1f}% (월 중 해당일 비율)" if raw is not None else "결측"
        else:
            raw, norm = a_row[f"raw_{k}"], a_row[f"r_{k}"]
            raw = f"{raw:,.1f}"
        detail.append({"하위지표": SUB_SHORT[k], "정의": SUB_LABEL[k], "원값": raw,
                       "정규화 r (0~1)": None if norm is None or pd.isna(norm) else round(float(norm), 3),
                       "가중치 w̃": round(w[k], 3), "감점 w̃·r (점)": round(row[f"risk_{k}"] * 100, 2)})
    st.dataframe(pd.DataFrame(detail), hide_index=True, width="stretch")

    st.subheader("이 프로필의 가중치가 중립 프로필과 어떻게 다른가")
    neutral = profile_weights("20대", "친구·연인", "주간")
    ks = list(C.SUBINDICATORS)
    fig = go.Figure()
    fig.add_bar(x=[SUB_SHORT[k] for k in ks], y=[neutral[k] for k in ks], name="중립(20대·친구·주간)",
                marker=dict(color="rgba(128,128,128,0.45)"), hovertemplate="%{x}: %{y:.3f}<extra>중립</extra>")
    fig.add_bar(x=[SUB_SHORT[k] for k in ks], y=[w[k] for k in ks], name=f"현재({age}·{comp}·{slot})",
                marker=dict(color=COL["S"]), hovertemplate="%{x}: %{y:.3f}<extra>현재</extra>")
    fig.update_layout(barmode="group")
    fig.update_xaxes(showgrid=False)
    fig.update_yaxes(showgrid=True, gridcolor="rgba(128,128,128,0.18)", title="가중치 w̃ (합 1)")
    st.plotly_chart(base_layout(fig, 320), width="stretch")

# ---------------------------------------------------------------------------
# 지도
# ---------------------------------------------------------------------------
with tab_map:
    s = scored[scored["eligible"]]
    top_ids = set(rec["content_id"])
    fig = go.Figure()
    fig.add_scattergl(x=s["lon"], y=s["lat"], mode="markers", name="후보 관광지",
                      marker=dict(size=8, color=s["S"] * 100, colorscale=[[0, "#cde2fb"], [1, "#0d366b"]],
                                  cmin=20, cmax=100, colorbar=dict(title="안전도", thickness=10),
                                  line=dict(width=0)),
                      text=s["title"] + " · " + s["sigungu"],
                      hovertemplate="%{text}<br>안전도 %{marker.color:.1f}<extra></extra>")
    r = s[s["content_id"].isin(top_ids)]
    fig.add_scatter(x=r["lon"], y=r["lat"], mode="markers+text", name="추천",
                    marker=dict(size=14, color="rgba(0,0,0,0)", line=dict(width=2, color=COL["F"])),
                    text=rec.set_index("content_id").loc[r["content_id"], "rank"].astype(str),
                    textposition="top center", hoverinfo="skip")
    fl = s[s["safety_flag"]]
    fig.add_scatter(x=fl["lon"], y=fl["lat"], mode="markers", name="⚠ 안전 주의(하위 10%)",
                    marker=dict(size=9, symbol="x-thin", line=dict(width=2, color=CRITICAL)), hoverinfo="skip")
    fig.update_xaxes(title="경도" + (" (가상 좌표)" if is_sample else ""))
    fig.update_yaxes(title="위도" + (" (가상 좌표)" if is_sample else ""), scaleanchor="x", scaleratio=1.25)
    st.plotly_chart(base_layout(fig, 560), width="stretch")
    st.caption("색이 진할수록 안전도가 높습니다. 주황 원은 추천 목록(숫자는 순위), 빨간 ×는 안전 주의 관광지입니다.")

# ---------------------------------------------------------------------------
# 민감도·검증
# ---------------------------------------------------------------------------
with tab_val:
    st.markdown("정답 레이블이 없는 지수라서 **외부 지표와의 일치도**, **가중치를 흔들었을 때 순위가 얼마나 "
                "버티는지**로 품질을 봅니다.")
    if "safety_index" in tables:
        cv = V.convergent_validity(fx, tables["safety_index"])
        cv["판정"] = cv["spearman"].map(lambda r: "양호 (≥ 0.5)" if r >= 0.5 else "재검토")
        st.subheader("① 수렴 타당도 — 지역안전지수 등급과의 스피어만 상관")
        st.dataframe(cv.round(3), hide_index=True, width="stretch")

    @st.cache_data
    def grid(age, comp, month, slot):
        return V.weight_grid_sensitivity(fx, age, comp, month, slot)

    gd = grid(age, comp, month, slot)
    st.subheader("② 가중치 민감도 — α·β·γ 전 조합에서 상위 10개 겹침(자카드)")
    piv = gd.pivot(index="beta", columns="alpha", values="jaccard").sort_index(ascending=False)
    fig = go.Figure(go.Heatmap(z=piv.values, x=piv.columns, y=piv.index, zmin=0, zmax=1,
                               colorscale=[[0, "#cde2fb"], [1, "#104281"]], xgap=2, ygap=2,
                               colorbar=dict(title="겹침", thickness=10),
                               hovertemplate="α %{x} · β %{y}<br>기준안과 겹침 %{z:.2f}<extra></extra>"))
    fig.add_scatter(x=[C.DEFAULT_ALPHA], y=[C.DEFAULT_BETA], mode="markers+text", text=["기준안"],
                    textposition="top center", marker=dict(size=12, color="rgba(0,0,0,0)",
                                                           line=dict(width=2, color=COL["F"])), showlegend=False)
    fig.update_xaxes(title="α (안전도)", showgrid=False)
    fig.update_yaxes(title="β (연령 적합도)  ·  γ = 1 − α − β")
    st.plotly_chart(base_layout(fig, 420), width="stretch")
    near = gd[(gd["alpha"] - C.DEFAULT_ALPHA).abs().le(0.1001) & (gd["beta"] - C.DEFAULT_BETA).abs().le(0.1001)]
    st.caption(f"기준안 ±0.1 범위 평균 겹침 {near['jaccard'].mean():.2f} · 평균 순위상관 {near['spearman'].mean():.2f} "
               "(판정 기준: 겹침 ≥ 0.7 이면 '가중치를 조금 바꿔도 추천이 안정적')")

    st.subheader("③ 몬테카를로 — 가중치 불확실성을 반영한 순위 구간")

    @st.cache_data
    def mc(age, comp, month, slot):
        return V.monte_carlo_ranks(fx, age, comp, month, slot, n_runs=200)

    m = mc(age, comp, month, slot).head(15)
    title = fx.attractions.set_index("content_id")["title"]
    m = m.assign(관광지=title.reindex(m.index).values)
    st.dataframe(pd.DataFrame({"관광지": m["관광지"], "상위 10 진입 확률": (m["p_top"] * 100).round(0).astype(int).astype(str) + "%",
                               "순위 5%": m["rank_p05"].round(0), "순위 중앙": m["rank_p50"].round(0),
                               "순위 95%": m["rank_p95"].round(0)}), hide_index=True, width="stretch")
    st.caption("(α, β, γ)와 하위지표 가중치를 기준안 중심 디리클레 분포(κ=30)에서 200번 뽑아 계산. "
               "순위는 다양성 제약 전 전국 순위입니다.")

# ---------------------------------------------------------------------------
# 계산 방식 문서
# ---------------------------------------------------------------------------
with tab_doc:
    st.markdown((ROOT / "docs" / "recommendation_method.md").read_text(encoding="utf-8"))
