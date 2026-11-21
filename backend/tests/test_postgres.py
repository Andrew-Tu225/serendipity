import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import AuthSession, User
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
