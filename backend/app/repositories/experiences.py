from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, Place, TasteProfile


class ExperienceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, experience: Experience) -> None:
        self.session.add(experience)
        await self.session.flush()

    async def list_by_author(
        self, user_id: UUID, *, limit: int, offset: int = 0, highest_rated: bool = False
    ) -> Sequence[tuple[Experience, Place]]:
        order = (Experience.created_at.desc(), Experience.id.desc())
        if highest_rated:
            order = (Experience.rating.desc(), *order)
        statement = (
            select(Experience, Place)
            .join(Place, Place.id == Experience.place_id)
            .where(Experience.user_id == user_id)
            .order_by(*order)
            .offset(offset)
            .limit(limit)
        )
        rows = await self.session.execute(statement)
        return [(experience, place) for experience, place in rows]

    async def count_by_author(self, user_id: UUID) -> int:
        statement = (
            select(func.count()).select_from(Experience).where(Experience.user_id == user_id)
        )
        return (await self.session.execute(statement)).scalar_one()


class TasteProfileRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_score(self, user_id: UUID, category: str, delta: float) -> None:
        """Add `delta` to one (user, category) score, creating the row at `delta` if absent.

        The increment runs inside the database, so concurrent logs cannot lose an update.
        """
        dialect = self.session.get_bind().dialect.name
        insert = postgresql.insert if dialect == "postgresql" else sqlite.insert
        statement = insert(TasteProfile).values(user_id=user_id, category=category, score=delta)
        await self.session.execute(
            statement.on_conflict_do_update(
                index_elements=[TasteProfile.user_id, TasteProfile.category],
                set_={"score": TasteProfile.score + statement.excluded.score},
            )
        )
