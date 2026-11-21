from collections.abc import AsyncIterator
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    url = get_settings().database_url
    if not url:
        raise HTTPException(503, "Database is not configured")
    engine = create_async_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_database_session() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session
