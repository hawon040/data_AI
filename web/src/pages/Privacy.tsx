import { Link } from "react-router-dom";
import { POLICY_NEEDS_REVIEW, PRIVACY_POLICY } from "../lib/privacyPolicy";
import "./Privacy.css";

/** 개인정보 처리방침 (초안). 내용은 lib/privacyPolicy.ts에 있다. */
export function Privacy() {
  return (
    <main className="privacy-page">
      <Link to="/app" className="back-link">← 추천으로 돌아가기</Link>
      <h1>개인정보 처리방침</h1>
      <p className="privacy-draft" role="note">
        초안입니다. {POLICY_NEEDS_REVIEW}로 표시한 항목은 팀이 정해 채운 뒤 시행합니다.
      </p>
      {PRIVACY_POLICY.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items && (
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
