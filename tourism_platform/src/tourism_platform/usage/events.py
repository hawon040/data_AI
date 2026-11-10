"""사용자 기록 한 건의 형식과 검증.

받는 것은 성별·연령대·지역·관광지·행동뿐이다. 이름, 연락처, 정확한 나이, 위치 좌표 같은 개인 식별 정보는
받지 않고, 허용하지 않은 필드가 하나라도 있으면 기록 전체를 거절한다(실수로 개인정보가 저장되는 것을 막는다).

anon_id는 브라우저가 처음 만들어 두는 임의의 값이다. 사람을 알아내는 데 쓰지 않고, 같은 사람이 같은 행동을
반복해서 통계를 부풀리는 것을 막는 용도(dedupe)로만 쓴다.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any, Iterable

GENDERS = ("M", "F")
AGE_GROUPS = ("10s", "20s", "30s", "40s", "50s", "60plus")
GROUP_KEYS = tuple(f"{g}_{a}" for g in GENDERS for a in AGE_GROUPS)  # 웹 types.ts의 GroupKey와 같은 형식
KINDS = ("rating", "directions")  # 방문 후 평가, 길찾기 클릭
SCORE_RANGE = (1, 5)

ALLOWED_FIELDS = frozenset(
    {"anon_id", "kind", "region_code", "attraction", "gender", "age_group", "occurred_at", "score"}
)


@dataclass(frozen=True)
class UsageEvent:
    anon_id: str
    kind: str
    region_code: str
    attraction: str
    gender: str
    age_group: str
    occurred_at: dt.datetime  # 시간대가 있는 값(UTC로 맞춤)
    score: int | None = None  # kind == "rating"일 때만 1~5

    @property
    def group_key(self) -> str:
        return f"{self.gender}_{self.age_group}"


def parse_event(raw: dict[str, Any]) -> UsageEvent:
    """JSON으로 받은 기록 한 건을 검증해 UsageEvent로 바꾼다. 형식이 틀리면 ValueError."""
    extra = set(raw) - ALLOWED_FIELDS
    if extra:
        raise ValueError(f"허용하지 않는 필드입니다: {sorted(extra)}")
    for field in ("anon_id", "kind", "region_code", "attraction", "gender", "age_group", "occurred_at"):
        if not raw.get(field):
            raise ValueError(f"{field}가 없습니다")
    if raw["kind"] not in KINDS:
        raise ValueError(f"kind는 {KINDS} 중 하나여야 합니다: {raw['kind']!r}")
    if raw["gender"] not in GENDERS:
        raise ValueError(f"gender는 {GENDERS} 중 하나여야 합니다: {raw['gender']!r}")
    if raw["age_group"] not in AGE_GROUPS:
        raise ValueError(f"age_group은 {AGE_GROUPS} 중 하나여야 합니다: {raw['age_group']!r}")

    score = raw.get("score")
    if raw["kind"] == "rating":
        if isinstance(score, bool) or not isinstance(score, int) or not SCORE_RANGE[0] <= score <= SCORE_RANGE[1]:
            raise ValueError(f"평가 점수는 {SCORE_RANGE[0]}~{SCORE_RANGE[1]}의 정수여야 합니다: {score!r}")
    elif score is not None:
        raise ValueError("길찾기 기록에는 score를 넣을 수 없습니다")

    when = raw["occurred_at"]
    if isinstance(when, str):
        when = dt.datetime.fromisoformat(when)
    if not isinstance(when, dt.datetime) or when.tzinfo is None:
        raise ValueError("occurred_at은 시간대가 있는 시각이어야 합니다 (예: 2026-11-10T09:00:00+09:00)")

    return UsageEvent(
        anon_id=str(raw["anon_id"]),
        kind=raw["kind"],
        region_code=str(raw["region_code"]),
        attraction=str(raw["attraction"]),
        gender=raw["gender"],
        age_group=raw["age_group"],
        occurred_at=when.astimezone(dt.timezone.utc),
        score=score,
    )


def dedupe(events: Iterable[UsageEvent]) -> list[UsageEvent]:
    """같은 사람(anon_id)이 같은 날 같은 관광지에 같은 행동을 반복한 기록은 첫 번째만 남긴다."""
    seen: set[tuple] = set()
    kept = []
    for event in sorted(events, key=lambda e: e.occurred_at):
        key = (event.anon_id, event.kind, event.region_code, event.attraction, event.occurred_at.date())
        if key not in seen:
            seen.add(key)
            kept.append(event)
    return kept
