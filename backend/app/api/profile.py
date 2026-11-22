from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database_session
from app.dependencies import CurrentUser
from app.schemas.profile import ProfileExperiences
from app.services.experiences import ExperienceService

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/experiences", response_model=ProfileExperiences)
async def profile_experiences(
    user: CurrentUser,
    database: Annotated[AsyncSession, Depends(get_database_session)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=40)] = 4,
):
    return await ExperienceService(database).profile_experiences(user, offset, limit)
