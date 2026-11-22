import asyncio
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import AuthSession, Experience, Follow, Place, TasteProfile, User
from app.repositories.experiences import TasteProfileRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.services.auth import hash_token

pytestmark = pytest.mark.anyio


async def test_concurrent_user_provisioning(postgres_factory):
    async def provision():
        async with postgres_factory() as session:
            user = await UserRepository(session).upsert_from_auth0({"sub": "auth0|concurrent"})
            await session.commit()
            return user.id

    ids = await asyncio.gather(*(provision() for _ in range(5)))
    assert len(set(ids)) == 1
    async with postgres_factory() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 1


async def test_login_state_can_only_be_consumed_once(postgres_factory):
    token_hash = hash_token("temporary-login-cookie")
    async with postgres_factory() as session:
        await SessionRepository(session).add(
            AuthSession(
                token_hash=token_hash,
                data={"state": "one-use-state"},
                expires_at=datetime.now(UTC) + timedelta(minutes=10),
            )
        )
        await session.commit()

    async def consume():
        async with postgres_factory() as session:
            result = await SessionRepository(session).consume_login(token_hash)
            await session.commit()
            return result

    results = await asyncio.gather(*(consume() for _ in range(5)))
    assert sum(result is not None for result in results) == 1


async def test_migration_downgrade_upgrade_and_model_match(postgres_factory):
    from alembic import command
    from alembic.autogenerate import compare_metadata
    from alembic.config import Config
    from alembic.migration import MigrationContext

    from app.database import Base

    def verify(connection):
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
        command.upgrade(config, "head")
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
        assert differences == []

    async with postgres_factory.kw["bind"].begin() as connection:
        await connection.run_sync(verify)


async def test_migrated_tables_enforce_rating_and_self_follow_checks(postgres_factory):
    async with postgres_factory() as session:
        user = await UserRepository(session).upsert_from_auth0({"sub": "auth0|checks"})
        place = Place(id=uuid4(), name="Spot", lat=43.6, lng=-79.4, category="park")
        session.add(place)
        await session.commit()
        user_id, place_id = user.id, place.id

    bad_rows = [
        Experience(
            user_id=user_id,
            place_id=place_id,
            rating=3.3,
            verdict="neutral",
            photo_urls=[],
            visited_on=date(2026, 10, 1),
        ),
        Follow(follower_id=user_id, followee_id=user_id),
    ]
    for row in bad_rows:
        async with postgres_factory() as session:
            session.add(row)
            with pytest.raises(IntegrityError):
                await session.commit()


async def test_concurrent_taste_profile_increments_are_not_lost(postgres_factory):
    async with postgres_factory() as session:
        user = await UserRepository(session).upsert_from_auth0({"sub": "auth0|scores"})
        await session.commit()
        user_id = user.id

    async def add_one():
        async with postgres_factory() as session:
            await TasteProfileRepository(session).add_score(user_id, "cafe", 1.0)
            await session.commit()

    await asyncio.gather(*(add_one() for _ in range(10)))
    async with postgres_factory() as session:
        row = await session.get(TasteProfile, (user_id, "cafe"))
        assert row.score == 10.0


async def test_migration_0008_backfills_value_for_existing_experiences(postgres_factory):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text

    def downgrade_insert_upgrade(connection):
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        config.attributes["connection"] = connection
        command.downgrade(config, "0007")
        user_id, place_id = uuid4(), uuid4()
        connection.execute(
            text("INSERT INTO users (id, auth0_sub) VALUES (:id, 'auth0|backfill')"),
            {"id": user_id},
        )
        connection.execute(
            text(
                "INSERT INTO places (id, name, lat, lng, category) "
                "VALUES (:id, 'Spot', 43.6, -79.4, 'park')"
            ),
            {"id": place_id},
        )
        for verdict, rating in (("recommend", 2.0), ("avoid", 5.0), ("neutral", 4.5)):
            connection.execute(
                text(
                    "INSERT INTO experiences "
                    "(id, user_id, place_id, rating, verdict, photo_urls, visited_on) "
                    "VALUES (:id, :user, :place, :rating, :verdict, '[]', '2026-10-01')"
                ),
                {
                    "id": uuid4(),
                    "user": user_id,
                    "place": place_id,
                    "rating": rating,
                    "verdict": verdict,
                },
            )
        command.upgrade(config, "head")
        return sorted(connection.execute(text("SELECT value FROM experiences")).scalars())

    async with postgres_factory.kw["bind"].begin() as connection:
        values = await connection.run_sync(downgrade_insert_upgrade)
    assert values == [-1.0, 0.75, 1.0]
