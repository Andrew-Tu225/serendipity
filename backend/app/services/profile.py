from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, Place, User
from app.repositories.experiences import ExperienceRepository
from app.repositories.profile import ProfileRepository
from app.repositories.users import UserRepository
from app.schemas.character import CharacterAppearance
from app.schemas.profile import (
    ConnectionDirection,
    ProfileBookmark,
    ProfileBookmarks,
    ProfileConnection,
    ProfileConnections,
    ProfileExperience,
    ProfileExperiences,
    ProfileListCreate,
    ProfileListEntries,
    ProfileListEntry,
    ProfileLists,
    ProfileListSummary,
)


class ProfileService:
    def __init__(self, database: AsyncSession):
        self.database = database
        self.experiences = ExperienceRepository(database)
        self.profile = ProfileRepository(database)
        self.users = UserRepository(database)

    async def save_character(
        self, user: User, appearance: CharacterAppearance
    ) -> CharacterAppearance:
        self.users.set_character(user, appearance.model_dump())
        await self.database.commit()
        return appearance

    async def experiences_for(self, user: User, offset: int, limit: int) -> ProfileExperiences:
        favorites = await self.experiences.list_by_author(user.id, limit=4, highest_rated=True)
        recent = await self.experiences.list_by_author(user.id, offset=offset, limit=limit + 1)
        followers, following, bookmarks, lists = await self.profile.counts(user.id)
        return ProfileExperiences(
            user_id=user.id,
            display_name=user.display_name,
            character=user.character,
            total=await self.experiences.count_by_author(user.id),
            follower_count=followers,
            following_count=following,
            bookmark_count=bookmarks,
            list_count=lists + 1,
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

    async def lists_for(self, user: User, offset: int, limit: int) -> ProfileLists:
        rows = await self.profile.lists(user.id, offset, limit + 1)
        return ProfileLists(
            lists=[
                ProfileListSummary(id=collection.id, name=collection.name, entry_count=count)
                for collection, count in rows[:limit]
            ],
            next_offset=offset + limit if len(rows) > limit else None,
        )

    async def create_list(self, user: User, data: ProfileListCreate) -> ProfileListSummary:
        created = await self.profile.insert_list(user.id, data.id, data.name)
        collection = await self.profile.owned_list(user.id, data.id)
        if collection is None or collection.name != data.name:
            raise HTTPException(409, "This list already exists")
        if created and data.first_entry:
            await self._save_entry(collection.id, data.first_entry)
        count = await self.profile.count_entries(collection.id)
        result = ProfileListSummary(id=collection.id, name=collection.name, entry_count=count)
        await self.database.commit()
        return result

    async def list_entries(
        self, user: User, list_id: UUID, offset: int, limit: int
    ) -> ProfileListEntries:
        if await self.profile.owned_list(user.id, list_id) is None:
            raise HTTPException(404, "List unavailable")
        rows = await self.profile.entries(list_id, offset, limit + 1)
        return ProfileListEntries(
            entries=[
                ProfileListEntry.model_validate(row, from_attributes=True) for row in rows[:limit]
            ],
            next_offset=offset + limit if len(rows) > limit else None,
        )

    async def add_list_entry(
        self, user: User, list_id: UUID, entry: ProfileListEntry
    ) -> ProfileListEntry:
        if await self.profile.owned_list(user.id, list_id) is None:
            raise HTTPException(404, "List unavailable")
        result = await self._save_entry(list_id, entry)
        await self.database.commit()
        return result

    async def _save_entry(self, list_id: UUID, entry: ProfileListEntry) -> ProfileListEntry:
        row = await self.profile.insert_entry(list_id, entry.id, entry.name, entry.location)
        if row is None or (row.name, row.location) != (entry.name, entry.location):
            raise HTTPException(409, "This entry already exists")
        return ProfileListEntry.model_validate(row, from_attributes=True)

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
                    character=person.character,
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
