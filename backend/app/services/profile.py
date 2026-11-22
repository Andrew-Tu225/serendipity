from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, Place, User
from app.repositories.experiences import ExperienceRepository
from app.repositories.profile import ProfileRepository
from app.schemas.profile import (
    ConnectionDirection,
    ProfileBookmark,
    ProfileBookmarks,
    ProfileConnection,
    ProfileConnections,
    ProfileExperience,
    ProfileExperiences,
)


class ProfileService:
    def __init__(self, database: AsyncSession):
        self.experiences = ExperienceRepository(database)
        self.profile = ProfileRepository(database)

    async def experiences_for(self, user: User, offset: int, limit: int) -> ProfileExperiences:
        favorites = await self.experiences.list_by_author(user.id, limit=4, highest_rated=True)
        recent = await self.experiences.list_by_author(user.id, offset=offset, limit=limit + 1)
        followers, following, bookmarks = await self.profile.counts(user.id)
        return ProfileExperiences(
            display_name=user.display_name,
            total=await self.experiences.count_by_author(user.id),
            follower_count=followers,
            following_count=following,
            bookmark_count=bookmarks,
            favorites=[profile_experience(experience, place) for experience, place in favorites],
            recent=[profile_experience(experience, place) for experience, place in recent[:limit]],
            next_offset=offset + limit if len(recent) > limit else None,
        )

    async def bookmarks_for(self, user: User, offset: int, limit: int) -> ProfileBookmarks:
        places = await self.profile.bookmarked_places(user.id, offset, limit + 1)
        return ProfileBookmarks(
            places=[
                ProfileBookmark(
                    id=place.id, name=place.name, latitude=place.lat, longitude=place.lng
                )
                for place in places[:limit]
            ],
            next_offset=offset + limit if len(places) > limit else None,
        )

    async def connections_for(
        self, user: User, direction: ConnectionDirection, offset: int, limit: int
    ) -> ProfileConnections:
        people = await self.profile.connections(
            user.id, followers=direction == "followers", offset=offset, limit=limit + 1
        )
        return ProfileConnections(
            people=[
                ProfileConnection(
                    id=person.id,
                    display_name=(person.display_name or "").strip() or "Serendipity user",
                )
                for person in people[:limit]
            ],
            next_offset=offset + limit if len(people) > limit else None,
        )


def profile_experience(experience: Experience, place: Place) -> ProfileExperience:
    return ProfileExperience(
        id=experience.id,
        place_name=place.name,
        category=place.category,
        rating=experience.rating,
        verdict=experience.verdict,
        rated_on=experience.created_at.date(),
    )
