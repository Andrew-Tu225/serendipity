from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database_session
from app.dependencies import CurrentUser, VerifiedMutation
from app.schemas.onboarding import MyProfile, OnboardingWrite
from app.services.onboarding import OnboardingService

router = APIRouter(prefix="/me", tags=["onboarding"])


def get_service(database: Annotated[AsyncSession, Depends(get_database_session)]):
    return OnboardingService(database)


Service = Annotated[OnboardingService, Depends(get_service)]


@router.get("/profile", response_model=MyProfile)
async def profile(user: CurrentUser, service: Service):
    return await service.profile(user)


@router.put("/onboarding", response_model=MyProfile)
async def complete(
    data: OnboardingWrite, user: CurrentUser, verified: VerifiedMutation, service: Service
):
    return await service.complete(user, data)
