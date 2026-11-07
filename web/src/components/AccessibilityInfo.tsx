import { useEffect, useState } from "react";
import {
  cleanAccessText,
  loadAttractionAccess,
  toAccessSummary,
  type AccessParty,
  type AttractionAccess,
} from "../lib/liveAccess";
import type { Attraction } from "../lib/types";

/** 관광지 상세 패널의 "이용 편의 정보" 칸(한국관광공사 무장애 여행정보). 추천 순위에는 영향을 주지 않는다. */
export function AccessibilityInfo({ attraction, party }: { attraction: Attraction; party: AccessParty }) {
  const requestKey = `${attraction.name}|${party.withElderly}|${party.withChildren}`;
  const [state, setState] = useState<{ key: string; data?: AttractionAccess; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAttractionAccess(attraction, party)
      .then((data) => !cancelled && setState({ key: requestKey, data }))
      .catch((error: Error) => !cancelled && setState({ key: requestKey, error: error.message }));
    return () => {
      cancelled = true;
    };
    // party는 requestKey에 담겨 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attraction, requestKey]);

  const current = state?.key === requestKey ? state : null;
  const data = current?.data;
  const summary = toAccessSummary(attraction.name, data);

  return (
    <section className="accessibility-info" aria-labelledby="accessibility-heading">
      <h5 id="accessibility-heading">이용 편의 정보</h5>
      {!current && <p className="accessibility-note">불러오는 중…</p>}
      {current?.error && <p className="accessibility-note">{current.error}</p>}
      {data && !data.matched && (
        <p className="accessibility-note">
          관광공사 무장애 여행정보에 등록되지 않은 곳이에요. 시설이 없다는 뜻은 아니니 방문 전에 확인해 주세요.
        </p>
      )}
      {data?.matched && (
        <>
          {data.matchedBy !== "같은 이름" && (
            <p className="accessibility-note">관광공사 등록 이름: {data.title} (이름이 일부만 같아요)</p>
          )}
          {data.needs.length > 0 && (
            <div className="accessibility-fit">
              <p>
                <strong>{data.needs.join("·")}</strong>에게 필요한 시설
              </p>
              <p className="accessibility-have">있음: {summary.have.join(", ") || "-"}</p>
              <p className="accessibility-missing">등록 정보 없음: {summary.noInfo.join(", ") || "-"}</p>
              {summary.noInfo.length > 0 && (
                <p className="accessibility-note">등록 정보 없음은 시설이 없다는 뜻이 아닙니다.</p>
              )}
            </div>
          )}
          {!summary.hasInfo ? (
            <p className="accessibility-note">등록된 편의시설 정보가 없어요.</p>
          ) : (
            // 일행 조건이 있으면 요약을 먼저 보여 주고 전체 목록은 접어 둔다.
            <details className="accessibility-details" open={data.needs.length === 0}>
              <summary>등록된 편의시설 정보 {Object.keys(data.available).length}개</summary>
              <dl className="accessibility-list">
                {Object.entries(data.available).map(([key, value]) => (
                  <div key={key}>
                    <dt>{data.labels[key] ?? key}</dt>
                    <dd>{cleanAccessText(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <p className="accessibility-note">{data.note}</p>
        </>
      )}
      <p className="accessibility-source">출처: 한국관광공사 무장애 여행정보</p>
    </section>
  );
}
