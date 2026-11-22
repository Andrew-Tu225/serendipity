"""Read-only data access for recommendations (docs/recommendations.md section 2)."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Protocol
from uuid import UUID

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import Bookmark, Experience, Follow, Place, TasteProfile, User, UserInterest, domain
from app.models.conversions import (
    to_domain_bookmark,
    to_domain_experience,
    to_domain_follow,
    to_domain_place,
    to_domain_user,
)
from app.recommend.config import MAX_PLACES_IN_VIEW
from app.recommend.service import RecommendInput
from app.schemas.recommendations import BBox


@dataclass(frozen=True)
class PlaceLogsInput:
    place: domain.Place
    logs: Sequence[domain.Experience]
    users: Mapping[str, domain.User]
    follows: Sequence[domain.Follow]
    profiles: Sequence[domain.TasteProfile]


class RecommendationRepository(Protocol):
    async def load_input(
        self, viewer: domain.User, bbox: BBox, limit: int, today: date
    ) -> RecommendInput: ...

    async def load_place_logs(
        self, viewer: domain.User, place_id: str
    ) -> PlaceLogsInput | None: ...


class SqlRecommendationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def load_input(
        self, viewer: domain.User, bbox: BBox, limit: int, today: date
    ) -> RecommendInput:
        viewer_id = UUID(viewer.id)
        places = (
            await self.session.scalars(
                select(Place)
                .where(
                    Place.lat.between(bbox.min_lat, bbox.max_lat),
                    Place.lng.between(bbox.min_lng, bbox.max_lng),
                )
                .order_by(Place.id)
                .limit(MAX_PLACES_IN_VIEW)
            )
        ).all()
        logs = await self._latest_logs(Experience.place_id.in_([p.id for p in places]))
        bookmarks = await self.session.scalars(
            select(Bookmark).where(Bookmark.user_id == viewer_id)
        )
        return RecommendInput(
            viewer=viewer,
            users=await self._authors(logs),
            follows=await self._follows(viewer_id),
            bookmarks=tuple(to_domain_bookmark(b) for b in bookmarks),
            places=tuple(to_domain_place(p) for p in places),
            logs=logs,
            profiles=await self._profiles(),
            limit=limit,
            today=today,
        )

    async def load_place_logs(self, viewer: domain.User, place_id: str) -> PlaceLogsInput | None:
        try:
            place_uuid = UUID(place_id)
        except ValueError:
            return None
        place = await self.session.get(Place, place_uuid)
        if place is None:
            return None
        logs = await self._latest_logs(Experience.place_id == place_uuid)
        return PlaceLogsInput(
            place=to_domain_place(place),
            logs=logs,
            users=await self._authors(logs),
            follows=await self._follows(UUID(viewer.id)),
            profiles=await self._profiles(),
        )

    async def _latest_logs(self, condition: ColumnElement[bool]) -> tuple[domain.Experience, ...]:
        """The latest Experience per (user, place) among rows matching `condition`."""
        ranked = (
            select(
                Experience,
                func.row_number()
                .over(
                    partition_by=(Experience.user_id, Experience.place_id),
                    order_by=(
                        Experience.visited_on.desc(),
                        Experience.created_at.desc(),
                        Experience.id.desc(),
                    ),
                )
                .label("recency"),
            )
            .where(condition)
            .subquery()
        )
        latest = aliased(Experience, ranked)
        rows = await self.session.scalars(
            select(latest).where(ranked.c.recency == 1).order_by(latest.id)
        )
        return tuple(to_domain_experience(row) for row in rows)

    async def _authors(self, logs: Iterable[domain.Experience]) -> dict[str, domain.User]:
        author_ids = {UUID(log.user_id) for log in logs}
        users = await self.session.scalars(select(User).where(User.id.in_(author_ids)))
        return {str(user.id): to_domain_user(user) for user in users}

    async def _follows(self, viewer_id: UUID) -> tuple[domain.Follow, ...]:
        rows = await self.session.scalars(select(Follow).where(Follow.follower_id == viewer_id))
        return tuple(to_domain_follow(row) for row in rows)

    async def _profiles(self) -> tuple[domain.TasteProfile, ...]:
        rows = await self.session.scalars(select(TasteProfile))
        scores = {(str(row.user_id), row.category): row.score for row in rows}
        interests = await self.session.scalars(select(UserInterest))
        for interest in interests:
            key = (str(interest.user_id), interest.category)
            scores[key] = scores.get(key, 0.0) + 1.0
        return tuple(
            domain.TasteProfile(user_id=user_id, category=category, score=score)
            for (user_id, category), score in sorted(scores.items())
        )
