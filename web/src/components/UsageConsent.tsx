import { useState } from "react";
import { Link } from "react-router-dom";
import { getUsageConsent, setUsageConsent } from "../lib/usageApi";

/**
 * 사용자 기록 동의 안내. 동의해야 평가와 길찾기 기록이 서버로 가고, 동의하지 않아도 모든 기능을 그대로 쓸 수 있다.
 * 선택은 이 브라우저에만 저장되고 언제든 바꿀 수 있다.
 */
export function UsageConsent() {
  const [consent, setConsent] = useState(getUsageConsent());

  const choose = (agreed: boolean) => {
    setUsageConsent(agreed);
    setConsent(agreed ? "agreed" : "declined");
  };

  return (
    <div className="usage-consent" role="region" aria-label="사용자 기록 안내">
      <p className="uc-title">더 잘 맞는 추천을 위한 익명 기록</p>
      <p className="uc-body">
        동의하면 <strong>성별·연령대, 관광지 평가, 길찾기 클릭</strong>을 익명으로 기록해 다음 추천에 반영해요.
        이름·연락처·위치는 저장하지 않고, 동의하지 않아도 모든 기능을 똑같이 쓸 수 있어요.{" "}
        <Link to="/privacy">개인정보 처리방침</Link>
      </p>
      {consent === null ? (
        <div className="uc-actions">
          <button type="button" className="pill-mini" onClick={() => choose(true)}>동의하고 참여</button>
          <button type="button" className="pill-mini ghost" onClick={() => choose(false)}>동의하지 않음</button>
        </div>
      ) : (
        <div className="uc-actions">
          <span className="uc-state">{consent === "agreed" ? "기록에 참여 중" : "기록하지 않음"}</span>
          <button type="button" className="pill-mini ghost" onClick={() => choose(consent !== "agreed")}>
            {consent === "agreed" ? "참여 끄기" : "참여하기"}
          </button>
        </div>
      )}
    </div>
  );
}
