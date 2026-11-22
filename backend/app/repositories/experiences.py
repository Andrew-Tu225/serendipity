from uuid import UUID

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Experience, TasteProfile


class ExperienceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, experience: Experience) -> None:
        self.session.add(experience)
        await self.session.flush()


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
