import { useEffect, useState } from "react";
import { getSeason, SEASON_LABELS } from "../lib/tripPreferences";
import { SEASONAL_DESTINATIONS, type SeasonalDestination } from "../lib/seasonalDestinations";
import "./SeasonalDiscovery.css";

export function SeasonalDiscovery({
  month,
  paused,
  onTogglePaused,
  onSelect,
}: {
  month: number;
  paused: boolean;
  onTogglePaused: () => void;
  onSelect: (destination: SeasonalDestination) => void;
}) {
  const season = getSeason(month);
  const destinations = SEASONAL_DESTINATIONS[season];
  const destinationKey = destinations.map(({ id }) => id).join("|");
  const [activeSlide, setActiveSlide] = useState({ key: "", index: 0 });
  const activeIndex = activeSlide.key === destinationKey ? activeSlide.index : 0;
  const destination = destinations[activeIndex];
  const selectSlide = (index: number) => setActiveSlide({ key: destinationKey, index });

  useEffect(() => {
    if (paused || destinations.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => ({
        key: destinationKey,
        index: ((current.key === destinationKey ? current.index : 0) + 1) % destinations.length,
      }));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [destinationKey, destinations.length, paused]);

  return (
    <section className="seasonal-discovery" aria-labelledby="seasonal-discovery-heading">
      <div className="seasonal-heading">
        <div>
          <p className="seasonal-eyebrow">{SEASON_LABELS[season]} 여행 아이디어 · {month}월</p>
          <h3 id="seasonal-discovery-heading">실제 국내 여행지 둘러보기</h3>
        </div>
        <div className="seasonal-controls">
          <button type="button" onClick={() => selectSlide((activeIndex - 1 + destinations.length) % destinations.length)} aria-label="이전 여행지">
            ←
          </button>
          <span aria-live="polite">{activeIndex + 1} / {destinations.length}</span>
          <button type="button" onClick={() => selectSlide((activeIndex + 1) % destinations.length)} aria-label="다음 여행지">
            →
          </button>
          <button type="button" onClick={onTogglePaused} aria-pressed={paused} aria-label={paused ? "사진 자동 넘김 재생" : "사진 자동 넘김 일시정지"}>
            {paused ? "재생" : "일시정지"}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="seasonal-slide"
        onClick={() => onSelect(destination)}
        aria-label={`${destination.location} ${destination.title} 상세 정보 보기`}
      >
        <img src={destination.image} alt={destination.imageAlt} />
        <span className="seasonal-caption">
          <span className="seasonal-location">{destination.location} · {destination.timing}</span>
          <strong>{destination.title}</strong>
          <span className="seasonal-description">{destination.summary}</span>
          <span className="seasonal-cta">장소 정보와 길찾기 보기 ↗</span>
        </span>
      </button>

      <p className="seasonal-footnote">
        사진: {destination.creator} ·{" "}
        <a href={destination.sourceUrl} target="_blank" rel="noreferrer">원본 및 출처</a>
        {" "}·{" "}
        <a href={destination.licenseUrl} target="_blank" rel="noreferrer">{destination.license}</a>
        {" "}· 사진은 계절 분위기 참고용이며, 축제·시설 운영 일정은 공식 안내를 확인하세요.
      </p>
      <div className="seasonal-dots" aria-label="계절 여행지 선택">
        {destinations.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === activeIndex ? "active" : ""}
            onClick={() => selectSlide(index)}
            aria-label={`${index + 1}번: ${item.title}`}
            aria-current={index === activeIndex ? "true" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
