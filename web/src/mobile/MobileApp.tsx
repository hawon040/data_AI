import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CompanionForm } from "../components/CompanionForm";
import { SAMPLE_REGIONS } from "../data/sampleRegions";
import { kakaoDirectionsUrl } from "../lib/kakaoLocal";
import { airTips, mergeTips, terrainTips, weatherTipSentences } from "../lib/preparationTips";
import type { SafetyDisplayFilters } from "../lib/safetyPriority";
import {
  DEFAULT_TRIP_PREFERENCES,
  getPreparationTips,
  getSeason,
  type TripPreferences,
} from "../lib/tripPreferences";
import { AGE_GROUP_LABELS, type Attraction, type Person, type Region } from "../lib/types";
import { useTripEngine } from "../lib/useTripEngine";
import { MobileFooter } from "./MobileHome";
import { MobileHeader } from "./MobileHeader";
import { MobileMap, type MobileMapMarker } from "./MobileMap";
import "./mobile.css";

type View = "map" | "region" | "results" | "place" | "done";
const VIEWS: View[] = ["map", "region", "results", "place", "done"];

/** 위치 권한이 없거나 아직 허용 전일 때 쓰는 예시 위치(서울 중구). */
const SAMPLE_POSITION = { lat: 37.5641, lng: 126.9979 };
const KOREA_CENTER = { lat: 36.3, lng: 127.8 };

const TRANSPORT_LABELS: Record<TripPreferences["transport"], string> = {
  "public-transit": "대중교통",
  "tour-bus": "관광버스",
  car: "자가용",
  walking: "도보·자전거",
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${year}. ${month}. ${day}.`;
}

function durationLabel(preferences: TripPreferences): string {
  return preferences.duration === "day" ? "당일치기" : `${preferences.nights}박`;
}

/**
 * 모바일 02~07 (Figma): 지도 → 추천 지역 → 추천 결과 → 장소·안전 정보 → 카카오맵 이동 확인 → 완료.
 * 화면 단계는 주소의 ?v= 로 두어 브라우저 뒤로 가기가 한 단계씩 돌아간다.
 * 위치는 이 브라우저 안에서만 쓰고, 길찾기 클릭·평가 같은 이용 기록은 어디에도 보내거나 저장하지 않는다.
 */
export function MobileApp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const weatherDemo = searchParams.get("demo") === "weather";

  const [people, setPeople] = useState<Person[] | null>(null);
  const [safetyFilters, setSafetyFilters] = useState<SafetyDisplayFilters>({
    withChildren: false,
    withElderly: false,
    nightPlan: false,
  });
  const [tripPreferences, setTripPreferences] = useState<TripPreferences>(() => {
    // 홈의 "여행 찾기"에서 고른 지역·일정을 이어받는다.
    const province = searchParams.get("province");
    const duration = searchParams.get("duration");
    return {
      ...DEFAULT_TRIP_PREFERENCES,
      province: province && SAMPLE_REGIONS.some((region) => region.province === province) ? province : "all",
      duration: duration === "overnight" ? "overnight" : "day",
    };
  });
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [attraction, setAttraction] = useState<Attraction | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);

  const [myPosition, setMyPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const engine = useTripEngine({ people, safetyFilters, tripPreferences, weatherDemo });
  const { recommendations, weatherDecisions, regionWeather, weatherLoading, weatherPreset } = engine;

  const requested = searchParams.get("v") as View | null;
  const featuredRegion: Region =
    recommendations[0]?.region ?? [...SAMPLE_REGIONS].sort((a, b) => b.totalVisitors - a.totalVisitors)[0];
  const selectedRegion = SAMPLE_REGIONS.find((region) => region.code === regionCode) ?? null;
  const selectedItem = recommendations.find((item) => item.region.code === selectedRegion?.code) ?? null;

  // 필요한 값이 없는 단계는 지도로 돌려보낸다(새로고침 등).
  let view: View = requested && VIEWS.includes(requested) ? requested : "map";
  if (view === "region" && !selectedRegion) view = "map";
  if (view === "results" && people == null) view = "map";
  if ((view === "place" || view === "done") && (!attraction || !selectedRegion)) view = "map";

  const go = useCallback(
    (next: View) => {
      setDirectionsOpen(false);
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          params.set("v", next);
          return params;
        },
        { replace: false },
      );
      window.scrollTo({ top: 0 });
    },
    [setSearchParams],
  );

  function locate() {
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationNotice("이 브라우저는 위치 기능을 지원하지 않아 예시 위치(서울 중구)를 보여 드려요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
        if (view === "region") go("map");
      },
      () => {
        setLocationNotice("위치 권한이 없어 예시 위치(서울 중구)를 보여 드려요.");
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  }

  function openPlace(region: Region, spot: Attraction) {
    setRegionCode(region.code);
    setAttraction(spot);
    go("place");
  }

  const base = myPosition ?? SAMPLE_POSITION;
  const mapMarkers = ((): MobileMapMarker[] => {
    if (view === "results") {
      return recommendations.map((item) => ({
        id: item.region.code,
        lat: item.region.lat,
        lng: item.region.lng,
        label: item.region.name,
        tone: "region" as const,
      }));
    }
    const markers: MobileMapMarker[] = [];
    if (view === "region" && selectedRegion) {
      markers.push({
        id: selectedRegion.code,
        lat: selectedRegion.lat,
        lng: selectedRegion.lng,
        label: `${selectedRegion.name} · 추천 지역`,
        tone: "selected",
      });
    } else {
      markers.push({ id: "me", lat: base.lat, lng: base.lng, label: "현재 위치", tone: "me" });
      markers.push({ id: "me-label", lat: base.lat, lng: base.lng, label: myPosition ? "현재 위치" : "현재 위치 · 서울 중구", tone: "region" });
    }
    return markers;
  })();

  const form = (
    <div id="m-form" className="m-form">
      <CompanionForm
        regions={SAMPLE_REGIONS}
        preferences={tripPreferences}
        weatherDemo={weatherDemo}
        onPreferencesChange={(preferences) => {
          setTripPreferences(preferences);
          setRegionCode(null);
          setAttraction(null);
        }}
        onSubmit={(next, filters) => {
          setPeople(next);
          setSafetyFilters(filters);
          setRegionCode(null);
          setAttraction(null);
          go("results");
        }}
      />
    </div>
  );

  if (view === "done" && attraction && selectedRegion) {
    return (
      <div className="m-shell" data-season={getSeason(tripPreferences.month)}>
        <MobileHeader showNav />
        <main className="m-main">
          <Breadcrumb current="길찾기 실행 완료" />
          <DirectionsDone
            attraction={attraction}
            region={selectedRegion}
            preferences={tripPreferences}
            onBackToResults={() => go("results")}
            onBackToPlace={() => go("place")}
          />
        </main>
        <MobileFooter />
      </div>
    );
  }

  if (view === "place" && attraction && selectedRegion) {
    const decision = weatherDecisions[selectedRegion.code];
    const party = { withElderly: safetyFilters.withElderly, withChildren: safetyFilters.withChildren };
    const worst = weatherDemo ? weatherPreset.weather : regionWeather[selectedRegion.code]?.worst ?? null;
    const tips = mergeTips(getPreparationTips(attraction, tripPreferences), [
      ...weatherTipSentences(weatherDemo ? [] : regionWeather[selectedRegion.code]?.tips ?? []),
      ...airTips(worst),
      ...terrainTips([attraction], party),
    ]);
    return (
      <div className="m-shell" data-season={getSeason(tripPreferences.month)}>
        <MobileHeader showNav />
        <main className="m-main">
          <Breadcrumb current="장소 상세" />
          <PlaceScreen
            attraction={attraction}
            region={selectedRegion}
            preferences={tripPreferences}
            weatherSummary={people != null ? decision?.summary ?? null : null}
            weatherLoading={weatherLoading}
            tips={tips}
            onBack={() => go("results")}
            onDirections={() => setDirectionsOpen(true)}
          />
        </main>
        <MobileFooter />
        {directionsOpen && (
          <DirectionsModal
            attraction={attraction}
            region={selectedRegion}
            onClose={() => setDirectionsOpen(false)}
            onOpen={() => {
              window.open(kakaoDirectionsUrl(attraction.name, attraction.lat, attraction.lng), "_blank", "noopener");
              setDirectionsOpen(false);
              go("done");
            }}
          />
        )}
      </div>
    );
  }

  if (view === "results" && people != null) {
    const ageLabels = people.length
      ? people.map((person) => AGE_GROUP_LABELS[person.ageGroup]).join(" · ")
      : "연령대 입력 없음";
    return (
      <div className="m-shell" data-season={getSeason(tripPreferences.month)}>
        <MobileHeader />
        <main className="m-main">
          <h1 className="m-page-title">여행 추천 결과</h1>
          <section className="m-card m-summary" aria-label="여행 조건 요약">
            <strong>
              {formatDate(tripPreferences.visitDate)} · {tripPreferences.month}월 · {durationLabel(tripPreferences)}
            </strong>
            <p>
              {tripPreferences.province === "all" ? "전국" : tripPreferences.province} ·{" "}
              {TRANSPORT_LABELS[tripPreferences.transport]} · {ageLabels}
            </p>
            <button
              type="button"
              className="m-soft-button"
              onClick={() => document.getElementById("m-form")?.scrollIntoView({ behavior: "smooth" })}
            >
              여행 조건 확인·변경 ↓
            </button>
          </section>

          <MobileMap center={KOREA_CENTER} level={13} markers={mapMarkers} height={200} />

          {weatherLoading && <p className="m-status" role="status">방문일 날씨를 확인하는 중…</p>}
          {recommendations.length === 0 && !weatherLoading ? (
            <p className="m-status">현재 조건에 맞는 여행지가 없어요. 목적이나 지역 범위를 넓히거나 다른 날짜를 골라 보세요.</p>
          ) : (
            <ol className="m-results">
              {recommendations.flatMap((item, index) => {
                const top = item.topAttractions[0]?.attraction;
                if (!top) return [];
                const weather = weatherDecisions[item.region.code]?.summary;
                return (
                  <li key={item.region.code} className="m-card m-result">
                    <div className="m-result-thumb">
                      <div className="m-result-head">
                        <span>{top.category}</span>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <p className="m-result-title">{top.name}</p>
                      <button type="button" className="m-result-link" onClick={() => openPlace(item.region, top)}>
                        장소·안전 정보 보기 →
                      </button>
                    </div>
                    <h2 className="m-result-sub">
                      {item.region.name} · {top.name}
                    </h2>
                    <p className="m-result-body">
                      {item.evidence.slice(0, 2).join(" ")}
                      {weather && (
                        <>
                          <br />
                          {weather}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {form}
        </main>
        <MobileFooter />
      </div>
    );
  }

  // 02 현재 위치 지도 / 03 추천 지역 지도
  const inRegion = view === "region" && selectedRegion;
  const cardRegion = inRegion ? selectedRegion : featuredRegion;
  const cardTop = (inRegion ? selectedItem?.topAttractions[0]?.attraction : null) ?? cardRegion.attractions[0] ?? null;
  const cardWeather = inRegion && people != null ? weatherDecisions[cardRegion.code]?.summary : null;
  return (
    <div className="m-shell m-has-tabs" data-season={getSeason(tripPreferences.month)}>
      <MobileHeader />
      <main className="m-main m-main-flush">
        <div className="m-pad">
          <h1 className="m-page-title">{inRegion ? "추천 지역을 둘러보고 있어요" : "내 위치 중심으로 둘러보기"}</h1>
          <p className="m-subtle">
            {inRegion
              ? `${selectedRegion.province} ${selectedRegion.name} · 선택한 추천 지역`
              : myPosition
                ? "현재 위치 · 위치는 이 기기에서만 사용해요"
                : "현재 위치 · 서울특별시 중구 (예시)"}
          </p>
        </div>
        <MobileMap
          center={inRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : base}
          level={inRegion ? 7 : 8}
          markers={mapMarkers}
          locating={locating}
          onMyLocation={locate}
          onWholeKorea={() => setRegionCode(null)}
        />
        {locationNotice && <p className="m-status m-pad" role="status">{locationNotice}</p>}

        <section className="m-pad m-region-panel" aria-labelledby="m-region-title">
          <h2 id="m-region-title" className="m-section-title">
            내 위치에서 시작하는 여행
          </h2>
          <p className="m-subtle">{myPosition ? "현재 위치 기준" : "서울 중구 기준 · 위치 예시"}</p>
          <h3 className="m-ask">어디로 떠나볼까요?</h3>
          <article className="m-card m-region-card m-tinted">
            <p className="m-eyebrow m-blue">{inRegion ? "선택한 추천 지역" : "추천 지역"}</p>
            <p className="m-region-name">{cardRegion.name}</p>
            <p className="m-region-line">{cardRegion.highlight}</p>
            {inRegion && cardTop && (
              <>
                <p className="m-region-spot">
                  {cardRegion.name} · {cardTop.name}
                </p>
                {selectedItem && <p className="m-region-line">{selectedItem.evidence.slice(0, 2).join(" ")}</p>}
                {cardWeather && <p className="m-region-weather">{cardWeather}</p>}
                {!selectedItem && <p className="m-region-note">추천 정보 예시</p>}
              </>
            )}
            <button
              type="button"
              className="m-primary-button"
              disabled={Boolean(inRegion)}
              onClick={() => {
                setRegionCode(cardRegion.code);
                go("region");
              }}
            >
              {inRegion ? `${cardRegion.name} 지도 보는 중` : "이 지역으로 지도 이동 →"}
            </button>
          </article>
          <p className="m-hint">
            {inRegion
              ? `여행 조건은 그대로 두고 지도 중심만 ${cardRegion.name}으로 이동했어요`
              : "추천 지역을 선택하면 그 지역 중심으로 지도가 이동해요"}
          </p>
          <p className="m-hint m-hint-small">
            지역을 선택해도 여행 조건은 유지돼요.
            <br />◎ 내 위치 버튼으로 언제든 돌아올 수 있어요. 위치는 서버에 저장하지 않아요.
          </p>
        </section>

        <div className="m-pad">{form}</div>
      </main>
      <nav className="m-tabs" aria-label="화면 이동">
        <button type="button" className="is-active" aria-current="page" onClick={() => setRegionCode(null)}>
          지도
        </button>
        <button
          type="button"
          onClick={() => (people != null ? go("results") : document.getElementById("m-form")?.scrollIntoView({ behavior: "smooth" }))}
        >
          추천
        </button>
        <a href="https://www.e-gen.or.kr" target="_blank" rel="noreferrer">
          응급
        </a>
        <a href="/service">더보기</a>
      </nav>
    </div>
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav className="m-breadcrumb" aria-label="현재 위치">
      <a href="/">홈</a> / <span>여행 추천 결과</span> / <span aria-current="page">{current}</span>
    </nav>
  );
}

function PlaceScreen({
  attraction,
  region,
  preferences,
  weatherSummary,
  weatherLoading,
  tips,
  onBack,
  onDirections,
}: {
  attraction: Attraction;
  region: Region;
  preferences: TripPreferences;
  weatherSummary: string | null;
  weatherLoading: boolean;
  tips: string[];
  onBack: () => void;
  onDirections: () => void;
}) {
  return (
    <>
      <button type="button" className="m-outline-button m-back" onClick={onBack}>
        ← 추천 결과
      </button>
      <h1 className="m-place-title">{attraction.name}</h1>
      <p className="m-subtle">
        {region.province} {region.name} · {attraction.category} · {durationLabel(preferences)}
      </p>

      <section className="m-card m-block">
        <h2>{region.name}에서 만나는 곳</h2>
        <p>{region.highlight}</p>
        <p className="m-note">운영 시간과 매장 운영 여부는 방문 전에 확인해 주세요.</p>
      </section>

      {weatherLoading ? (
        <p className="m-status" role="status">방문일 날씨를 확인하는 중…</p>
      ) : (
        weatherSummary && (
          <section className="m-card m-callout" aria-label="방문일 날씨">
            <strong>{weatherSummary}</strong>
            <p>추천 결과 기준이에요. 출발 전 최신 날씨를 확인해 주세요.</p>
          </section>
        )
      )}

      <section className="m-card m-block">
        <h2>방문 전 체크</h2>
        <ol className="m-checklist">
          {tips.map((tip, index) => (
            <li key={tip}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {tip}
            </li>
          ))}
        </ol>
      </section>

      <section className="m-card m-block">
        <h2>주변 안전 정보</h2>
        <p className="m-warning">운영·수용 여부는 실시간으로 확인해 주세요.</p>
        <h3>응급실 찾기</h3>
        <p>가까운 응급실과 진료 가능 여부를 확인해요. 응급 상황에는 바로 119에 연락해 주세요.</p>
        <a className="m-outline-button" href="https://www.e-gen.or.kr" target="_blank" rel="noreferrer">
          E-Gen에서 응급실 확인 ↗
        </a>
        <hr />
        <h3>대피소 찾기</h3>
        <p>현재 위치 주변의 대피소와 안전한 이동 경로를 미리 살펴보세요.</p>
        <a className="m-outline-button" href="https://www.safekorea.go.kr" target="_blank" rel="noreferrer">
          국민재난안전포털에서 확인 ↗
        </a>
        <p className="m-note">정보 제공처의 최신 안내를 기준으로 확인해 주세요.</p>
      </section>

      <section className="m-card m-block">
        <h2>이 여행지로 떠나볼까요?</h2>
        <p>카카오맵에서 출발지와 대중교통 경로를 확인할 수 있어요.</p>
        <button type="button" className="m-gradient-button" onClick={onDirections}>
          카카오맵 길찾기 ↗
        </button>
      </section>
    </>
  );
}

function DirectionsModal({
  attraction,
  region,
  onClose,
  onOpen,
}: {
  attraction: Attraction;
  region: Region;
  onClose: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="m-scrim" onClick={onClose}>
      <div
        className="m-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="m-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="m-modal-close" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
        <p className="m-modal-arrow" aria-hidden="true">↗</p>
        <h2 id="m-modal-title">카카오맵으로 이동할까요?</h2>
        <p className="m-modal-lead">
          선택한 장소의 길찾기를 새 창에서 열어요.
          <br />
          현재 추천 결과는 그대로 유지돼요.
        </p>
        <div className="m-modal-dest">
          <span>도착지</span>
          <strong>{attraction.name}</strong>
          <small>
            {region.province} {region.name}
          </small>
        </div>
        <p className="m-note m-center">출발지와 대중교통 경로는 카카오맵에서 확인해 주세요. 경로와 소요 시간은 외부 서비스의 안내를 따라요.</p>
        <button type="button" className="m-gradient-button" onClick={onOpen}>
          카카오맵 열기 ↗
        </button>
        <button type="button" className="m-outline-button" onClick={onClose}>
          돌아가기
        </button>
        <p className="m-note m-center">외부 서비스의 위치·개인정보 이용 정책이 적용돼요.</p>
      </div>
    </div>
  );
}

function DirectionsDone({
  attraction,
  region,
  preferences,
  onBackToResults,
  onBackToPlace,
}: {
  attraction: Attraction;
  region: Region;
  preferences: TripPreferences;
  onBackToResults: () => void;
  onBackToPlace: () => void;
}) {
  const url = kakaoDirectionsUrl(attraction.name, attraction.lat, attraction.lng);
  return (
    <section className="m-card m-done">
      <div className="m-done-check" aria-hidden="true">✓</div>
      <h1>카카오맵 길찾기를 열었어요</h1>
      <p className="m-center">열린 카카오맵에서 출발지와 이동 경로를 확인해 주세요. 언제든 돌아와 다른 여행지를 둘러볼 수 있어요.</p>
      <div className="m-modal-dest">
        <span>선택한 여행지</span>
        <strong>{attraction.name}</strong>
        <small>
          {region.name} · {durationLabel(preferences)} · {TRANSPORT_LABELS[preferences.transport]}
        </small>
      </div>
      <div className="m-recheck">
        <strong>출발 전 한 번 더 확인해요</strong>
        <p>최신 날씨와 방문지 운영 정보를 확인해 주세요. 주변 응급실과 대피소는 장소 상세에서 다시 볼 수 있어요.</p>
      </div>
      <button type="button" className="m-gradient-button" onClick={onBackToResults}>
        추천 결과로 돌아가기
      </button>
      <button type="button" className="m-outline-button" onClick={onBackToPlace}>
        장소·안전 정보 다시 보기
      </button>
      <a className="m-reopen" href={url} target="_blank" rel="noreferrer">
        카카오맵이 열리지 않았나요? 다시 열기 ↗
      </a>
    </section>
  );
}
