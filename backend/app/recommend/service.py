"""Place recommendations for one viewer (docs/recommendations.md 2.4-2.9).

Pure functions over in-memory data; the caller loads `RecommendInput`.
Hidden gems are places someone liked where no weighted author (followee or
similar user) has a log, so a place the viewer's circle disliked is never
offered as a gem.
"""

import hashlib
import random
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.models.domain import Bookmark, Experience, Follow, Place, TasteProfile, User
from app.recommend.config import EXPLORE_RATIO, LOGS_PER_PLACE
from app.recommend.taste import SimilarUser, is_liked, log_value, similar_users, vectors_from_rows

FOLLOWEE_WEIGHT = 1.0


class Relation(StrEnum):
    FOLLOWING = "following"
    SIMILAR_TASTE = "similar_taste"
    COMMUNITY = "community"


class PinKind(StrEnum):
    FRIEND = "friend"
    SIMILAR_TASTE = "similar_taste"
    EXPLORE = "explore"


@dataclass(frozen=True)
class RecommendInput:
    viewer: User
    users: Mapping[str, User]
    follows: Sequence[Follow]
    bookmarks: Sequence[Bookmark]
    places: Sequence[Place]
    logs: Sequence[Experience]
    profiles: Sequence[TasteProfile]
    limit: int
    today: date


@dataclass(frozen=True)
class ScoredPlace:
    place_id: str
    score: float


@dataclass(frozen=True)
class Slot:
    place_id: str
    score: float
    is_gem: bool


@dataclass(frozen=True)
class ShownLog:
    experience: Experience
    author: User
    relation: Relation


@dataclass(frozen=True)
class RecommendationItem:
    place: Place
    kind: PinKind
    score: float
    logs: tuple[ShownLog, ...]


def build_user_weights(
    followees: frozenset[str], similar: Sequence[SimilarUser]
) -> dict[str, float]:
    """Followees weigh 1, similar users their similarity; everyone else is absent (0)."""
    return {
        **{s.user_id: s.sim for s in similar},
        **{user_id: FOLLOWEE_WEIGHT for user_id in followees},
    }


def score_places(
    logs: Iterable[Experience], weights: Mapping[str, float], excluded: frozenset[str]
) -> tuple[ScoredPlace, ...]:
    """Places with a positive weighted sum of log values, highest first, ties by id."""
    totals: dict[str, float] = defaultdict(float)
    for log in logs:
        if log.place_id not in excluded and log.user_id in weights:
            totals[log.place_id] += weights[log.user_id] * log_value(log)
    positive = (ScoredPlace(pid, score) for pid, score in totals.items() if score > 0)
    return tuple(sorted(positive, key=lambda s: (-s.score, s.place_id)))


def find_hidden_gems(
    logs: Sequence[Experience], weights: Mapping[str, float], excluded: frozenset[str]
) -> dict[str, int]:
    """Liked-log count per place that has a liked log and no log by a weighted author."""
    weighted_places = {log.place_id for log in logs if log.user_id in weights}
    liked = Counter(
        log.place_id
        for log in logs
        if is_liked(log) and log.place_id not in excluded and log.place_id not in weighted_places
    )
    return dict(liked)


def daily_seed(viewer_id: str, today: date) -> int:
    """Stable across processes, unlike hash(), which is salted per interpreter run."""
    digest = hashlib.sha256(f"{viewer_id}:{today.isoformat()}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


def pick_random_gems(gems: Mapping[str, int], count: int, seed: int) -> tuple[str, ...]:
    population = sorted(gems)
    return tuple(random.Random(seed).sample(population, min(count, len(population))))


def pick_most_liked_gems(gems: Mapping[str, int], count: int) -> tuple[str, ...]:
    return tuple(sorted(gems, key=lambda pid: (-gems[pid], pid))[:count])


def merge_top_and_gems(
    scored: Sequence[ScoredPlace], gem_ids: Sequence[str], limit: int
) -> tuple[Slot, ...]:
    """Top places take round((1 - EXPLORE_RATIO) * limit) slots, gems the rest.

    When either side runs short the other fills the gap. `gem_ids` is in pick order.
    """
    scored_ids = {s.place_id for s in scored}
    gems = [g for g in dict.fromkeys(gem_ids) if g not in scored_ids]
    main_target = round((1 - EXPLORE_RATIO) * limit)
    gem_count = min(len(gems), limit - min(len(scored), main_target))
    main_count = min(len(scored), limit - gem_count)
    main = (Slot(s.place_id, s.score, is_gem=False) for s in scored[:main_count])
    picked = (Slot(g, 0.0, is_gem=True) for g in gems[:gem_count])
    return (*main, *picked)


def sort_logs_by_relation(
    logs: Iterable[Experience],
    users: Mapping[str, User],
    followees: frozenset[str],
    similar: Sequence[SimilarUser],
) -> tuple[ShownLog, ...]:
    """Followees, then similar users by similarity, then everyone; newest first in each."""
    sims = {s.user_id: s.sim for s in similar}

    def relation(user_id: str) -> Relation:
        if user_id in followees:
            return Relation.FOLLOWING
        if user_id in sims:
            return Relation.SIMILAR_TASTE
        return Relation.COMMUNITY

    rank = {Relation.FOLLOWING: 0, Relation.SIMILAR_TASTE: 1, Relation.COMMUNITY: 2}
    shown = tuple(
        ShownLog(experience=log, author=_author(users, log), relation=relation(log.user_id))
        for log in logs
    )
    return tuple(
        sorted(
            shown,
            key=lambda s: (
                rank[s.relation],
                -sims.get(s.author.id, 0.0),
                -s.experience.visited_on.toordinal(),
                s.experience.id,
            ),
        )
    )


def _author(users: Mapping[str, User], log: Experience) -> User:
    if log.user_id not in users:
        raise ValueError(f"author {log.user_id} of experience {log.id} is missing from users")
    return users[log.user_id]


def pick_pin_logs(logs: Sequence[ShownLog]) -> tuple[ShownLog, ...]:
    """The first LOGS_PER_PLACE liked logs, keeping the given order."""
    return tuple(s for s in logs if is_liked(s.experience))[:LOGS_PER_PLACE]


def sort_logs_liked_first(logs: Sequence[ShownLog]) -> tuple[ShownLog, ...]:
    """Liked logs, then the rest; the given order is kept within each group."""
    return tuple(sorted(logs, key=lambda s: not is_liked(s.experience)))


def followee_ids(viewer_id: str, follows: Iterable[Follow]) -> frozenset[str]:
    return frozenset(f.followee_id for f in follows if f.follower_id == viewer_id)


def label_pin_kind(slot: Slot, pin_logs: Sequence[ShownLog]) -> PinKind:
    if slot.is_gem:
        return PinKind.EXPLORE
    if any(s.relation is Relation.FOLLOWING for s in pin_logs):
        return PinKind.FRIEND
    return PinKind.SIMILAR_TASTE


def recommend(data: RecommendInput) -> tuple[RecommendationItem, ...]:
    viewer_id = data.viewer.id
    places = {p.id: p for p in data.places}
    logs = tuple(log for log in data.logs if log.place_id in places)
    followees = followee_ids(viewer_id, data.follows)
    excluded = frozenset(
        {b.place_id for b in data.bookmarks if b.user_id == viewer_id}
        | {log.place_id for log in logs if log.user_id == viewer_id}
    )

    similar = similar_users(viewer_id, followees, vectors_from_rows(data.profiles))
    weights = build_user_weights(followees, similar)
    scored = score_places(logs, weights, excluded)
    gems = find_hidden_gems(logs, weights, excluded)
    if weights:
        gem_ids = pick_random_gems(gems, data.limit, daily_seed(viewer_id, data.today))
    else:
        gem_ids = pick_most_liked_gems(gems, data.limit)
    slots = merge_top_and_gems(scored, gem_ids, data.limit)

    logs_by_place: dict[str, list[Experience]] = defaultdict(list)
    for log in logs:
        logs_by_place[log.place_id].append(log)

    def to_item(slot: Slot) -> RecommendationItem:
        ordered = sort_logs_by_relation(
            logs_by_place[slot.place_id], data.users, followees, similar
        )
        pin_logs = pick_pin_logs(ordered)
        return RecommendationItem(
            place=places[slot.place_id],
            kind=label_pin_kind(slot, pin_logs),
            score=slot.score,
            logs=pin_logs,
        )

    return tuple(to_item(slot) for slot in slots)
