from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, ExperienceList, ListItem, Place, User


class ListRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, experience_list: ExperienceList) -> None:
        self.session.add(experience_list)
        await self.session.flush()
        await self.session.refresh(experience_list)

    async def get(self, list_id: UUID) -> ExperienceList | None:
        return await self.session.get(ExperienceList, list_id)

    async def delete(self, experience_list: ExperienceList) -> None:
        await self.session.delete(experience_list)
        await self.session.flush()

    async def owned_by(self, user_id: UUID) -> list[tuple[ExperienceList, User, int]]:
        count = (
            select(func.count())
            .where(ListItem.list_id == ExperienceList.id)
            .correlate(ExperienceList)
            .scalar_subquery()
        )
        rows = await self.session.execute(
            select(ExperienceList, User, count)
            .join(User, User.id == ExperienceList.user_id)
            .where(ExperienceList.user_id == user_id)
            .order_by(ExperienceList.updated_at.desc(), ExperienceList.id)
        )
        return [tuple(row) for row in rows.all()]

    async def owner(self, experience_list: ExperienceList) -> User | None:
        return await self.session.get(User, experience_list.user_id)

    async def items(self, list_id: UUID):
        """Listed Experiences with their Place and author, oldest addition first."""
        rows = await self.session.execute(
            select(ListItem, Experience, Place, User)
            .join(Experience, Experience.id == ListItem.experience_id)
            .join(Place, Place.id == Experience.place_id)
            .join(User, User.id == Experience.user_id)
            .where(ListItem.list_id == list_id)
            .order_by(ListItem.added_at, ListItem.experience_id)
        )
        return rows.all()

    async def item_count(self, list_id: UUID) -> int:
        return await self.session.scalar(
            select(func.count()).select_from(ListItem).where(ListItem.list_id == list_id)
        )

    async def has_item(self, list_id: UUID, experience_id: UUID) -> bool:
        return (
            await self.session.get(ListItem, {"list_id": list_id, "experience_id": experience_id})
            is not None
        )

    async def add_item(self, list_id: UUID, experience_id: UUID) -> None:
        self.session.add(ListItem(list_id=list_id, experience_id=experience_id))
        await self.session.flush()

    async def remove_item(self, list_id: UUID, experience_id: UUID) -> bool:
        result = await self.session.execute(
            delete(ListItem).where(
                ListItem.list_id == list_id, ListItem.experience_id == experience_id
            )
        )
        return result.rowcount > 0

    async def experience_exists(self, experience_id: UUID) -> bool:
        return await self.session.get(Experience, experience_id) is not None
