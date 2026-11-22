"""Log values, category taste profiles and user similarity (docs/recommendations.md 2.1-2.3).

A profile maps every Category to the sum of the values of the user's logs at
Places in that category. It is stored and updated by `apply_log` as each log is
created; logs are never edited or deleted, so no other update exists.
"""

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from app.models.domain import Category, Experience, TasteProfile, verdict_value
from app.recommend.config import SIMILAR_K, SIMILAR_MIN

Profile = Mapping[Category, float]


@dataclass(frozen=True)
class SimilarUser:
    user_id: str
    sim: float


def log_value(log: Experience) -> float:
    """The stored value, so scores match what was added to the taste profile at write time."""
    return log.value if log.value is not None else verdict_value(log.verdict, log.rating)


def is_liked(log: Experience) -> bool:
    return log_value(log) > 0


def empty_profile() -> dict[Category, float]:
    return {category: 0.0 for category in Category}


def apply_log(profile: Profile, log: Experience, category: Category) -> dict[Category, float]:
    """Return the profile after a new log at a Place of `category`."""
    return {**empty_profile(), **profile, category: profile.get(category, 0.0) + log_value(log)}


def vectors_from_rows(rows: Iterable[TasteProfile]) -> dict[str, dict[Category, float]]:
    vectors: dict[str, dict[Category, float]] = {}
    for row in rows:
        current = vectors.get(row.user_id, empty_profile())
        vectors = {**vectors, row.user_id: {**current, row.category: row.score}}
    return vectors


def taste_sim(a: Profile, b: Profile) -> float:
    """Cosine similarity clamped at 0; 0 when either profile is all zeros."""
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in Category)
    norm = math.hypot(*(a.get(k, 0.0) for k in Category)) * math.hypot(
        *(b.get(k, 0.0) for k in Category)
    )
    if norm == 0:
        return 0.0
    return max(dot / norm, 0.0)


def similar_users(
    viewer_id: str, followees: frozenset[str], vectors: Mapping[str, Profile]
) -> tuple[SimilarUser, ...]:
    """N(u): the top SIMILAR_K non-followed users with taste_sim >= SIMILAR_MIN."""
    viewer = vectors.get(viewer_id, empty_profile())
    candidates = (
        SimilarUser(user_id, taste_sim(viewer, vector))
        for user_id, vector in vectors.items()
        if user_id != viewer_id and user_id not in followees
    )
    matches = [c for c in candidates if c.sim >= SIMILAR_MIN]
    ranked = sorted(matches, key=lambda c: (-c.sim, c.user_id))
    return tuple(ranked[:SIMILAR_K])
