from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database_session
from app.dependencies import CurrentUser
from app.schemas.profile import (
    ConnectionDirection,
    ProfileBookmarks,
    ProfileConnections,
    ProfileExperiences,
)
from app.services.profile import ProfileService

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/experiences", response_model=ProfileExperiences)
async def profile_experiences(
    user: CurrentUser,
    database: Annotated[AsyncSession, Depends(get_database_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=40)] = 4,
):
    return await ProfileService(database).experiences_for(user, offset, limit)


@router.get("/bookmarks", response_model=ProfileBookmarks)
async def profile_bookmarks(
    user: CurrentUser,
    database: Annotated[AsyncSession, Depends(get_database_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
):
    return await ProfileService(database).bookmarks_for(user, offset, limit)


@router.get("/connections/{direction}", response_model=ProfileConnections)
async def profile_connections(
    direction: ConnectionDirection,
    user: CurrentUser,
    database: Annotated[AsyncSession, Depends(get_database_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
):
    return await ProfileService(database).connections_for(user, direction, offset, limit)
