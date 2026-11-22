from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException

from app.models import User, domain
from app.models.conversions import to_domain_user
from app.recommend.service import (
    RecommendationItem,
    ShownLog,
    followee_ids,
    recommend,
    sort_logs_by_relation,
    sort_logs_liked_first,
)
from app.recommend.taste import similar_users, vectors_from_rows
from app.repositories.recommendations import RecommendationRepository
from app.schemas.recommendations import BBox


@dataclass(frozen=True)
class PlaceLogs:
    place: domain.Place
    logs: tuple[ShownLog, ...]


class RecommendationService:
    def __init__(self, repository: RecommendationRepository):
        self.repository = repository

    async def recommendations(
        self, user: User, bbox: BBox, limit: int, today: date
    ) -> tuple[RecommendationItem, ...]:
        data = await self.repository.load_input(to_domain_user(user), bbox, limit, today)
        return recommend(data)

    async def place_logs(self, user: User, place_id: str) -> PlaceLogs:
        viewer = to_domain_user(user)
        data = await self.repository.load_place_logs(viewer, place_id)
        if data is None:
            raise HTTPException(404, "Place not found")
        followees = followee_ids(viewer.id, data.follows)
        similar = similar_users(viewer.id, followees, vectors_from_rows(data.profiles))
        ordered = sort_logs_by_relation(data.logs, data.users, followees, similar)
        return PlaceLogs(place=data.place, logs=sort_logs_liked_first(ordered))
