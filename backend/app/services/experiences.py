from collections.abc import Sequence
from datetime import date
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, User, domain
from app.recommend.taste import log_value
from app.repositories.experiences import ExperienceRepository, TasteProfileRepository
from app.repositories.places import PlaceRepository


class ExperienceService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.places = PlaceRepository(database)
        self.experiences = ExperienceRepository(database)
        self.profiles = TasteProfileRepository(database)

    async def create_experience(
        self,
        user: User,
        place_id: str,
        *,
        rating: float,
        visited_on: date,
        verdict: domain.Verdict = domain.Verdict.NEUTRAL,
        review: str | None = None,
        photo_urls: Sequence[str] = (),
    ) -> domain.Experience:
        """Store a log and add its value to the author's category score in one transaction.

        Raises 404 for an unknown place and pydantic.ValidationError for invalid fields.
        """
        place = await self._place(place_id)
        log = domain.Experience(
            id=str(uuid4()),
            user_id=str(user.id),
            place_id=str(place.id),
            rating=rating,
            verdict=verdict,
            review=review,
            photo_urls=tuple(photo_urls),
            visited_on=visited_on,
        )
        try:
            await self.experiences.add(
                Experience(
                    id=UUID(log.id),
                    user_id=user.id,
                    place_id=place.id,
                    rating=log.rating,
                    verdict=log.verdict.value,
                    review=log.review,
                    photo_urls=list(log.photo_urls),
                    visited_on=log.visited_on,
                )
            )
            await self.profiles.add_score(user.id, place.category, log_value(log))
            await self.database.commit()
        except Exception:
            await self.database.rollback()
            raise
        return log

    async def _place(self, place_id: str):
        try:
            place = await self.places.get(UUID(place_id))
        except ValueError:
            place = None
        if place is None:
            raise HTTPException(404, "Place not found")
        return place
