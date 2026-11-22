from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.models import User


class DemoDataRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert_missing(self, model, rows: list[dict]) -> set:
        if not rows:
            return set()
        insert = (
            postgresql.insert
            if self.session.get_bind().dialect.name == "postgresql"
            else sqlite.insert
        )
        primary = list(model.__table__.primary_key.columns)
        statement = insert(model).values(rows).on_conflict_do_nothing().returning(*primary)
        result = await self.session.execute(statement)
        return set(result.scalars()) if len(primary) == 1 else set(result.all())

    async def user(self, user_id: UUID):
        return await self.session.get(User, user_id)

    async def counts(self) -> dict[str, int]:
        return {
            table.name: await self.session.scalar(select(func.count()).select_from(table))
            for table in Base.metadata.sorted_tables
        }

    async def clear(self):
        # Keep tables, indexes, the Alembic version, and unrelated schemas/tables intact.
        for table in reversed(Base.metadata.sorted_tables):
            await self.session.execute(delete(table))
