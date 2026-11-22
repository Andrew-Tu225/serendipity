from collections.abc import Sequence
from datetime import date
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, Place, User, domain
from app.repositories.experiences import ExperienceRepository, TasteProfileRepository
from app.repositories.places import PlaceRepository
from app.schemas.profile import ProfileExperience, ProfileExperiences


class ExperienceService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.places = PlaceRepository(database)
        self.experiences = ExperienceRepository(database)
        self.profiles = TasteProfileRepository(database)

    async def profile_experiences(self, user: User, offset: int, limit: int) -> ProfileExperiences:
        favorites = await self.experiences.list_by_author(user.id, limit=4, highest_rated=True)
        recent = await self.experiences.list_by_author(user.id, offset=offset, limit=limit + 1)
        return ProfileExperiences(
            display_name=user.display_name,
            total=await self.experiences.count_by_author(user.id),
            favorites=[
                self._profile_experience(experience, place) for experience, place in favorites
            ],
            recent=[
                self._profile_experience(experience, place) for experience, place in recent[:limit]
            ],
            next_offset=offset + limit if len(recent) > limit else None,
        )

    @staticmethod
    def _profile_experience(experience: Experience, place: Place) -> ProfileExperience:
        return ProfileExperience(
            id=experience.id,
            place_name=place.name,
            category=place.category,
            rating=experience.rating,
            verdict=experience.verdict,
            rated_on=experience.created_at.date(),
        )

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
            value=domain.verdict_value(domain.Verdict(verdict), rating),
        )
        try:
            await self.experiences.add(
                Experience(
                    id=UUID(log.id),
                    user_id=user.id,
                    place_id=place.id,
                    rating=log.rating,
                    verdict=log.verdict.value,
                    value=log.value,
                    review=log.review,
                    photo_urls=list(log.photo_urls),
                    visited_on=log.visited_on,
                )
            )
            await self.profiles.add_score(user.id, place.category, log.value)
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
