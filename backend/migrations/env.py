import asyncio

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.config import get_settings
from app.database import Base

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("Set DATABASE_URL in backend/.env before running migrations")
    engine = create_async_engine(url, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(run_migrations)
    await engine.dispose()


if context.config.attributes.get("connection") is not None:
    run_migrations(context.config.attributes["connection"])
elif context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
