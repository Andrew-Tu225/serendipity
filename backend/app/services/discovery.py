from collections import defaultdict
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.repositories.discovery import DiscoveryRepository
from app.schemas.discovery import (
    DiscoveryPage,
    DiscoveryPlace,
    ExperienceCreate,
    ExperienceOut,
    PlaceExperiences,
    RatingSummary,
)
from app.schemas.recommendations import BBox
from app.services.experiences import ExperienceService


class DiscoveryService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.repository = DiscoveryRepository(database)

    async def summaries(self, places, viewer: User | None):
        follows = await self.repository.followees(viewer.id if viewer else None)
        grouped = defaultdict(list)
        for log, author in await self.repository.latest_logs([p.id for p in places]):
            grouped[log.place_id].append(
                ExperienceOut(
                    id=log.id,
                    author_id=author.id,
                    author_name=(author.display_name or "Anonymous").strip()[:60] or "Anonymous",
                    rating=log.rating,
                    verdict=log.verdict,
                    review=log.review,
                    photo_urls=list(log.photo_urls),
                    visited_on=log.visited_on,
                    is_friend=author.id in follows,
                    is_self=viewer is not None and author.id == viewer.id,
                )
            )
        summaries = []
        for place in places:
            logs = grouped[place.id]
            friends = [log for log in logs if log.is_friend]
            summaries.append(
                DiscoveryPlace(
                    id=place.id,
                    name=place.name,
                    latitude=place.lat,
                    longitude=place.lng,
                    category=place.category,
                    google_place_id=place.google_place_id,
                    rating_summary=RatingSummary(
                        average=round(sum(log.rating for log in logs) / len(logs), 2)
                        if logs
                        else 0,
                        count=len(logs),
                    ),
                    friend_count=len(friends),
                    friends=friends[:3],
                )
            )
        return summaries, grouped

    async def discover(self, bounds: BBox, cursor: UUID | None, limit: int, viewer: User | None):
        rows = await self.repository.places_in_bounds(bounds, cursor, limit + 1)
        places, _ = await self.summaries(rows[:limit], viewer)
        return DiscoveryPage(
            places=places, next_cursor=rows[limit - 1].id if len(rows) > limit else None
        )

    async def details(self, place_id: UUID, viewer: User | None, offset: int, limit: int):
        place = await self.repository.get(place_id)
        if place is None:
            raise HTTPException(404, "Place not found")
        summaries, grouped = await self.summaries([place], viewer)
        logs = grouped[place.id]
        return PlaceExperiences(
            place=summaries[0],
            experiences=logs[offset : offset + limit],
            next_offset=offset + limit if len(logs) > offset + limit else None,
        )

    async def resolve(self, google_place_id: str, viewer: User | None):
        place = await self.repository.by_google_id(google_place_id)
        if place is None:
            raise HTTPException(404, "Place has no app record yet")
        return (await self.summaries([place], viewer))[0][0]

    async def create_experience(self, data: ExperienceCreate, user: User):
        try:
            place_id = data.place_id
            if data.new_place is not None:
                place_id = (await self.repository.create_place(data.new_place)).id
            # This service commits the new Place, Experience and taste update together.
            await ExperienceService(self.database).create_experience(
                user,
                str(place_id),
                rating=data.rating,
                visited_on=data.visited_on,
                verdict=data.verdict,
                review=data.review or None,
            )
        except Exception:
            await self.database.rollback()
            raise
        return await self.details(place_id, user, 0, 20)
