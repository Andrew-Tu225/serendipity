from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.models import Experience, Place, User


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

    async def place(self, place_id: UUID):
        return await self.session.get(Place, place_id)

    async def existing_users(self, ids):
        return (await self.session.scalars(select(User.id).where(User.id.in_(ids)))).all()

    async def non_fixture_users(self, fixture_ids):
        return (
            await self.session.scalars(select(User.id).where(User.id.not_in(fixture_ids)))
        ).all()

    async def refresh_labels(self, names, logs):
        from sqlalchemy import update

        for user_id, name in names:
            await self.session.execute(
                update(User)
                .where(User.id == user_id, User.display_name == f"Demo {name}")
                .values(display_name=name)
            )
        for log in logs:
            await self.session.execute(
                update(Experience)
                .where(
                    Experience.id == UUID(log.id),
                    Experience.user_id == UUID(log.user_id),
                    Experience.review == f"[Mock review] {log.review}",
                )
                .values(review=log.review)
            )

    async def link_place(self, place_id: UUID, google_id: str) -> bool:
        from sqlalchemy import update

        place = await self.session.get(Place, place_id)
        if place is None or place.google_place_id not in {None, google_id}:
            return False
        conflict = await self.session.scalar(
            select(Place.id).where(Place.google_place_id == google_id, Place.id != place_id)
        )
        if conflict is not None:
            return False
        await self.session.execute(
            update(Place)
            .where(Place.id == place_id, Place.google_place_id.is_(None))
            .values(google_place_id=google_id)
        )
        return True

    async def counts(self) -> dict[str, int]:
        return {
            table.name: await self.session.scalar(select(func.count()).select_from(table))
            for table in Base.metadata.sorted_tables
        }

    async def clear(self):
        # Keep tables, indexes, the Alembic version, and unrelated schemas/tables intact.
        for table in reversed(Base.metadata.sorted_tables):
            await self.session.execute(delete(table))
