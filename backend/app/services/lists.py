from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExperienceList, User
from app.repositories.lists import ListRepository
from app.schemas.lists import (
    ListCreate,
    ListDetail,
    ListExperienceOut,
    ListSummary,
    ListUpdate,
)

MAX_LIST_ITEMS = 200


def display_name(user: User) -> str:
    return (user.display_name or "Anonymous").strip()[:60] or "Anonymous"


def summary(experience_list: ExperienceList, owner: User, item_count: int) -> ListSummary:
    return ListSummary(
        id=experience_list.id,
        owner_id=owner.id,
        owner_name=display_name(owner),
        name=experience_list.name,
        description=experience_list.description,
        item_count=item_count,
        created_at=experience_list.created_at,
        updated_at=experience_list.updated_at,
    )


class ListService:
    """Lists are public to read; only the owner may rename, delete or change membership."""

    def __init__(self, database: AsyncSession):
        self.database = database
        self.lists = ListRepository(database)

    async def lists_of(self, user_id: UUID) -> list[ListSummary]:
        return [summary(*row) for row in await self.lists.owned_by(user_id)]

    async def detail(self, list_id: UUID) -> ListDetail:
        experience_list = await self._get(list_id)
        owner = await self.lists.owner(experience_list)
        rows = await self.lists.items(list_id)
        return ListDetail(
            **summary(experience_list, owner, len(rows)).model_dump(),
            items=[
                ListExperienceOut(
                    experience_id=log.id,
                    place_id=place.id,
                    place_name=place.name,
                    place_category=place.category,
                    latitude=place.lat,
                    longitude=place.lng,
                    author_id=author.id,
                    author_name=display_name(author),
                    rating=log.rating,
                    verdict=log.verdict,
                    review=log.review,
                    visited_on=log.visited_on,
                    added_at=item.added_at,
                )
                for item, log, place, author in rows
            ],
        )

    async def create(self, data: ListCreate, user: User) -> ListDetail:
        experience_list = ExperienceList(
            id=uuid4(), user_id=user.id, name=data.name, description=data.description or None
        )
        await self._commit(self.lists.add(experience_list))
        return await self.detail(experience_list.id)

    async def update(self, list_id: UUID, data: ListUpdate, user: User) -> ListDetail:
        experience_list = await self._owned(list_id, user)
        if data.name is not None:
            experience_list.name = data.name
        if data.description is not None:
            experience_list.description = data.description or None
        experience_list.updated_at = datetime.now(UTC)
        await self._commit(self.database.flush())
        return await self.detail(list_id)

    async def delete(self, list_id: UUID, user: User) -> None:
        experience_list = await self._owned(list_id, user)
        await self._commit(self.lists.delete(experience_list))

    async def add_experience(self, list_id: UUID, experience_id: UUID, user: User) -> ListDetail:
        """Idempotent: re-adding a listed Experience leaves the list unchanged."""
        experience_list = await self._owned(list_id, user)
        if await self.lists.has_item(list_id, experience_id):
            return await self.detail(list_id)
        if not await self.lists.experience_exists(experience_id):
            raise HTTPException(404, "Experience not found")
        if await self.lists.item_count(list_id) >= MAX_LIST_ITEMS:
            raise HTTPException(409, f"A list holds at most {MAX_LIST_ITEMS} experiences")
        experience_list.updated_at = datetime.now(UTC)
        try:
            await self.lists.add_item(list_id, experience_id)
            await self.database.commit()
        except IntegrityError:
            # A concurrent add of the same item, or the Experience was deleted meanwhile.
            await self.database.rollback()
            if not await self.lists.has_item(list_id, experience_id):
                raise HTTPException(404, "Experience not found") from None
        except Exception:
            await self.database.rollback()
            raise
        return await self.detail(list_id)

    async def remove_experience(self, list_id: UUID, experience_id: UUID, user: User) -> None:
        experience_list = await self._owned(list_id, user)
        if not await self.lists.remove_item(list_id, experience_id):
            raise HTTPException(404, "Experience is not in this list")
        experience_list.updated_at = datetime.now(UTC)
        await self._commit(self.database.flush())

    async def _get(self, list_id: UUID) -> ExperienceList:
        experience_list = await self.lists.get(list_id)
        if experience_list is None:
            raise HTTPException(404, "List not found")
        return experience_list

    async def _owned(self, list_id: UUID, user: User) -> ExperienceList:
        experience_list = await self._get(list_id)
        if experience_list.user_id != user.id:
            raise HTTPException(403, "Only the list owner can change it")
        return experience_list

    async def _commit(self, pending) -> None:
        try:
            await pending
            await self.database.commit()
        except Exception:
            await self.database.rollback()
            raise
