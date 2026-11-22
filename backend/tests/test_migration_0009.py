from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import select, text

from app.models import User, UserInterest


def test_migrations_have_one_head_and_unique_revisions():
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_heads() == ["0009"]
    revisions = [script.revision for script in scripts.walk_revisions()]
    assert len(revisions) == len(set(revisions)) == 9


@pytest.mark.anyio
@pytest.mark.parametrize("postgres_factory", ["0005", "0008"], indirect=True)
@pytest.mark.parametrize("legacy_schema", ["onboarding", "character"])
async def test_reconciles_user_schema(postgres_factory, migrate_postgres, legacy_schema):
    user_id = uuid4()
    completed_at = datetime(2026, 10, 1, tzinfo=UTC)
    async with postgres_factory() as session:
        await session.execute(
            text("INSERT INTO users (id, auth0_sub) VALUES (:id, 'auth0|existing')"),
            {"id": user_id},
        )
        if legacy_schema == "character":
            await session.execute(text("DROP TABLE user_interests"))
            await session.execute(text("ALTER TABLE users DROP COLUMN onboarding_completed_at"))
            await session.execute(text("ALTER TABLE users ADD COLUMN character JSONB"))
            await session.execute(text('UPDATE users SET character = \'{"color": "purple"}\''))
        else:
            await session.execute(
                text("UPDATE users SET onboarding_completed_at = :completed"),
                {"completed": completed_at},
            )
            await session.execute(
                text("INSERT INTO user_interests (user_id, category) VALUES (:id, 'cafe')"),
                {"id": user_id},
            )

        connection = await session.connection()
        await connection.run_sync(migrate_postgres)
        assert await session.scalar(text("SELECT version_num FROM alembic_version")) == "0009"
        user = await session.get(User, user_id)
        interests = list(await session.scalars(select(UserInterest.category)))
        assert user.auth0_sub == "auth0|existing"
        if legacy_schema == "character":
            assert user.character == {"color": "purple"}
            assert user.onboarding_completed_at is None
            assert interests == []
        else:
            assert user.character is None
            assert user.onboarding_completed_at == completed_at
            assert interests == ["cafe"]
