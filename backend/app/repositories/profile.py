from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, inspect, literal, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bookmark, ExperienceList, ExperienceListEntry, Follow, Place, User


class ProfileRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def has_list_storage(self) -> bool:
        connection = await self.session.connection()
        return await connection.run_sync(
            lambda conn: {ExperienceList.__tablename__, ExperienceListEntry.__tablename__}.issubset(
                inspect(conn).get_table_names()
            )
        )

    async def counts(self, user_id: UUID) -> tuple[int, int, int, int | None]:
        list_count = (
            select(func.count()).where(ExperienceList.user_id == user_id).scalar_subquery()
            if await self.has_list_storage()
            else literal(None)
        )
        statement = select(
            select(func.count()).where(Follow.followee_id == user_id).scalar_subquery(),
            select(func.count()).where(Follow.follower_id == user_id).scalar_subquery(),
            select(func.count()).where(Bookmark.user_id == user_id).scalar_subquery(),
            list_count,
        )
        followers, following, bookmarks, lists = (await self.session.execute(statement)).one()
        return followers, following, bookmarks, lists

    async def lists(self, user_id: UUID, offset: int, limit: int):
        entry_count = (
            select(func.count())
            .where(ExperienceListEntry.list_id == ExperienceList.id)
            .scalar_subquery()
        )
        query = (
            select(ExperienceList, entry_count)
            .where(ExperienceList.user_id == user_id)
            .order_by(ExperienceList.created_at.desc(), ExperienceList.id)
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.execute(query)).all()

    async def owned_list(self, user_id: UUID, list_id: UUID) -> ExperienceList | None:
        return await self.session.scalar(
            select(ExperienceList).where(
                ExperienceList.id == list_id, ExperienceList.user_id == user_id
            )
        )

    async def insert_list(self, user_id: UUID, list_id: UUID, name: str) -> bool:
        insert = (
            postgresql.insert
            if self.session.get_bind().dialect.name == "postgresql"
            else sqlite.insert
        )
        query = (
            insert(ExperienceList)
            .values(id=list_id, user_id=user_id, name=name)
            .on_conflict_do_nothing(index_elements=[ExperienceList.id])
            .returning(ExperienceList.id)
        )
        return await self.session.scalar(query) is not None

    async def entries(
        self, list_id: UUID, offset: int, limit: int
    ) -> Sequence[ExperienceListEntry]:
        query = (
            select(ExperienceListEntry)
            .where(ExperienceListEntry.list_id == list_id)
            .order_by(ExperienceListEntry.created_at, ExperienceListEntry.id)
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.scalars(query)).all()

    async def count_entries(self, list_id: UUID) -> int:
        query = select(func.count()).where(ExperienceListEntry.list_id == list_id)
        return (await self.session.execute(query)).scalar_one()

    async def insert_entry(
        self, list_id: UUID, entry_id: UUID, name: str, location: str
    ) -> ExperienceListEntry | None:
        insert = (
            postgresql.insert
            if self.session.get_bind().dialect.name == "postgresql"
            else sqlite.insert
        )
        await self.session.execute(
            insert(ExperienceListEntry)
            .values(id=entry_id, list_id=list_id, name=name, location=location)
            .on_conflict_do_nothing(index_elements=[ExperienceListEntry.id])
        )
        return await self.session.scalar(
            select(ExperienceListEntry).where(
                ExperienceListEntry.id == entry_id, ExperienceListEntry.list_id == list_id
            )
        )

    async def bookmarked_places(self, user_id: UUID, offset: int, limit: int) -> Sequence[Place]:
        statement = (
            select(Place)
            .join(Bookmark, Place.id == Bookmark.place_id)
            .where(Bookmark.user_id == user_id)
            .order_by(Bookmark.created_at.desc(), Bookmark.place_id)
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.scalars(statement)).all()

    async def connections(
        self, user_id: UUID, *, followers: bool, offset: int, limit: int
    ) -> Sequence[User]:
        owner, person = (
            (Follow.followee_id, Follow.follower_id)
            if followers
            else (
                Follow.follower_id,
                Follow.followee_id,
            )
        )
        statement = (
            select(User)
            .join(Follow, User.id == person)
            .where(owner == user_id)
            .order_by(Follow.created_at.desc(), User.id)
            .offset(offset)
            .limit(limit)
        )
        return (await self.session.scalars(statement)).all()
